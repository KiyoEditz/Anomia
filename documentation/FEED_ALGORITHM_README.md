# Feed Algorithm — Spesifikasi Implementasi

> Dokumen ini adalah skema algoritma untuk feed beranda Anomia.
> Dua mode feed: **"Untuk Kamu"** (rekomendasi berbasis skor) dan **"Terbaru"**
> (kronologis dari akun yang diikuti). Didesain agar ringan dijalankan di atas
> MongoDB tanpa perlu infrastruktur ML terpisah — cocok untuk skala saat ini
> dan tetap bisa berkembang seiring pertumbuhan user.

---

## 1. Dua Mode Feed

| Tab | Sumber Konten | Urutan |
|---|---|---|
| **Untuk Kamu** | Semua post publik (termasuk dari akun yang belum diikuti) | Berdasarkan skor (lihat bagian 3) |
| **Terbaru** | Hanya post dari akun yang diikuti + post sendiri | Kronologis murni, terbaru paling atas |

Tab "Terbaru" sengaja dibuat sederhana (cukup `find().sort({ createdAt: -1 })`)
karena tujuannya predictable: user tahu persis apa yang akan mereka lihat.
Tab "Untuk Kamu" yang membutuhkan algoritma scoring.

---

## 2. Filosofi Algoritma

Skala Anomia saat ini belum membutuhkan machine learning atau collaborative
filtering yang berat. Pendekatan yang dipakai adalah **weighted scoring**
(mirip cara kerja Hacker News/Reddit "hot" ranking), dihitung dari beberapa
sinyal sederhana, lalu dipersonalisasi sedikit berdasarkan siapa yang diikuti
user. Ini cukup untuk:

- Memunculkan post yang sedang ramai engagement-nya.
- Tetap memberi post baru kesempatan tampil (tidak kalah selamanya oleh post lama populer).
- Memberi sedikit prioritas ke akun yang diikuti / sering berinteraksi.
- Murah secara komputasi — bisa dihitung saat request atau di-cache berkala.

Kalau nanti skala user sudah jauh lebih besar (puluhan ribu post aktif), baru
worth dipertimbangkan migrasi ke sistem rekomendasi yang lebih canggih.

---

## 3. Formula Skor

```
skor_total = (skor_engagement × bobot_engagement)
           + (skor_recency × bobot_recency)
           + (skor_afinitas × bobot_afinitas)
```

### 3a. Skor Engagement

```
skor_engagement = (jumlah_like × 1) + (jumlah_komentar × 2) + (jumlah_repost × 3)
```

Komentar dan repost diberi bobot lebih tinggi dari like karena butuh effort
lebih besar dari user — sinyal yang lebih kuat soal kualitas post.

**Implementasi aktual:** Menggunakan `$size` dari array `likes` dan `reposts`
langsung di aggregation pipeline, plus field `commentsCount` yang sudah
di-increment/decrement secara atomik setiap ada komentar dibuat/dihapus.

### 3b. Skor Recency (Peluruhan Waktu)

Menggunakan fungsi peluruhan logaritmik agar post baru tetap kompetitif,
tapi post lama tidak hilang sama sekali secara tiba-tiba:

```
jam_sejak_post = (waktu_sekarang - createdAt) dalam jam
skor_recency = 1 / (jam_sejak_post + 2)^1.5
```

Efeknya: post berusia 0 jam punya skor recency tinggi, menurun cepat di
beberapa jam pertama, lalu melandai. Post berusia >48 jam praktis tidak lagi
muncul di "Untuk Kamu" kecuali engagement-nya sangat tinggi.

### 3c. Skor Afinitas (Personalisasi)

Skor afinitas dihitung sebagai **penjumlahan** dari sinyal-sinyal berikut
(bukan mutually exclusive — satu author bisa dapat beberapa bonus sekaligus):

| Sinyal | Bonus | Keterangan |
|---|---|---|
| User mengikuti penulis post | +5 | Sinyal paling kuat — user secara eksplisit tertarik |
| Penulis post mengikuti user | +3 | Mutual follow / interaksi dua arah |
| User pernah like/komentar post penulis (7 hari terakhir) | +2 | Interaksi aktif menandakan relevansi |
| Tidak ada hubungan | +0 | Post dari "stranger" tetap tampil berdasarkan engagement + recency |

**Implementasi aktual:** Sinyal "mengikuti" dan "mengikuti balik" dihitung
langsung di MongoDB aggregation pipeline via `$cond` + `$in`. Sinyal
"pernah interaksi 7 hari terakhir" di-resolve terlebih dahulu di application
layer (query ke Post.likes dan Comment.author) sebelum dimasukkan ke pipeline
sebagai array ID.

### 3d. Bobot Gabungan

```js
const WEIGHTS = {
  engagement: 1.0,
  recency: 100,    // Dikali lebih besar karena skala skor_recency kecil (0–1)
  affinity: 1.0,
};
```

> Bobot ini adalah titik awal — sebaiknya disesuaikan setelah lihat perilaku
> feed nyata. Kalau "Untuk Kamu" terasa terlalu didominasi post lama yang
> sudah viral, naikkan bobot recency. Kalau terlalu random/tidak personal,
> naikkan bobot afinitas.

---

## 4. Implementasi — MongoDB Aggregation Pipeline

File: `src/services/feedService.js`

```js
const WEIGHTS = { engagement: 1.0, recency: 100, affinity: 1.0 };

const getForYouFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const now = new Date();
  const currentUser = await User.findById(userId).select('following followers').lean();
  const followingIds = (currentUser.following || []).map(id => new mongoose.Types.ObjectId(id));
  const followerIds = new Set((currentUser.followers || []).map(id => id.toString()));

  // Cold start: boost engagement untuk user baru
  const isNewUser = followingIds.length === 0;
  const weights = isNewUser ? { ...WEIGHTS, engagement: 1.5 } : WEIGHTS;

  // Resolve interaksi 7 hari terakhir di app layer
  const recentInteractionAuthors = isNewUser
    ? []
    : await getRecentInteractionAuthors(userId);

  const pipeline = [
    { $match: { status: 'published' } },

    // Hitung umur post dalam jam
    { $addFields: { ageInHours: { $divide: [{ $subtract: [now, '$createdAt'] }, 3600000] } } },

    // Skor engagement: likes×1 + comments×2 + reposts×3
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $multiply: [{ $size: { $ifNull: ['$likes', []] } }, 1] },
            { $multiply: [{ $ifNull: ['$commentsCount', 0] }, 2] },
            { $multiply: [{ $size: { $ifNull: ['$reposts', []] } }, 3] },
          ]
        }
      }
    },

    // Skor recency: 1 / (ageInHours + 2)^1.5
    { $addFields: { recencyScore: { $divide: [1, { $pow: [{ $add: ['$ageInHours', 2] }, 1.5] }] } } },

    // Skor afinitas: following +5, follower +3, recent interaction +2 (dijumlahkan)
    {
      $addFields: {
        affinityScore: {
          $add: [
            { $cond: [{ $in: ['$author', followingIds] }, 5, 0] },
            { $cond: [{ $in: [{ $toString: '$author' }, [...followerIds]] }, 3, 0] },
            { $cond: [{ $in: [{ $toString: '$author' }, recentInteractionAuthors] }, 2, 0] },
          ]
        }
      }
    },

    // Skor total
    {
      $addFields: {
        totalScore: {
          $add: [
            { $multiply: ['$engagementScore', weights.engagement] },
            { $multiply: ['$recencyScore', weights.recency] },
            { $multiply: ['$affinityScore', weights.affinity] },
          ]
        }
      }
    },

    { $sort: { totalScore: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },

    // Populate author, tags, repostOf via $lookup
    // ... (lihat kode lengkap di src/services/feedService.js)
  ];

  return Post.aggregate(pipeline);
};
```

### Tab "Terbaru"

```js
const getRecentFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const currentUser = await User.findById(userId).select('following').lean();
  const authorIds = [...(currentUser.following || []), userId];

  return Post.find({ author: { $in: authorIds }, status: 'published' })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('author', 'username displayName avatarUrl role')
    .populate('tags', 'name slug category')
    .populate({
      path: 'repostOf',
      populate: [
        { path: 'author', select: 'username displayName avatarUrl role' },
        { path: 'tags', select: 'name slug category' },
      ],
    });
};
```

---

## 5. Diversity Guard (Anti Post Beruntun dari Satu Akun)

File: `src/utils/diversifyFeed.js`

Tanpa pengaman ini, satu akun yang sangat aktif/viral bisa mendominasi seluruh
halaman pertama feed "Untuk Kamu". Filter diterapkan setelah hasil aggregation:

```js
const diversifyFeed = (posts, maxConsecutive = 2) => {
  const result = [];
  const buffer = [];
  let lastAuthorId = null;
  let consecutiveCount = 0;

  for (const post of posts) {
    const authorId = (post.author._id || post.author).toString();

    if (authorId === lastAuthorId) {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      lastAuthorId = authorId;
    }

    if (consecutiveCount <= maxConsecutive) {
      result.push(post);
    } else {
      buffer.push(post);
    }
  }

  return [...result, ...buffer];
};
```

---

## 6. Cold Start — User Baru Tanpa Following/Riwayat

User yang baru daftar belum punya `following` dan belum punya riwayat interaksi,
sehingga skor afinitas selalu 0 untuk semua post. Ini ditangani dengan:

- Mengecek `followingIds.length === 0`
- Jika user baru, boost `engagement` weight dari 1.0 → 1.5
- Hasilnya feed terasa "ramai" karena post populer lebih diprioritaskan
- Afinitas skip sepenuhnya (tidak ada query interaksi 7 hari juga)

---

## 7. Caching — Hindari Hitung Ulang Setiap Request

File: `src/services/feedService.js` (bagian bawah)

Cache sederhana in-memory per user per page, TTL 5 menit:

```js
const feedCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getForYouFeedCached = async (userId, options) => {
  const cacheKey = `${userId}_${options.page || 1}`;
  const cached = feedCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await getForYouFeed(userId, options);
  feedCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  // Evict expired entries ketika cache terlalu besar
  if (feedCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of feedCache) {
      if (val.expiresAt <= now) feedCache.delete(key);
    }
  }

  return data;
};
```

> Catatan: in-memory cache seperti ini hilang setiap kali Render redeploy/restart
> instance — tidak masalah untuk skala sekarang. Kalau nanti pakai lebih dari
> satu instance Render (horizontal scaling), baru perlu pindah ke Redis supaya
> cache konsisten antar instance.

---

## 8. API Endpoint

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/feed/for-you?page=1&limit=20` | Feed "Untuk Kamu" dengan scoring + diversity guard |
| GET | `/api/feed/recent?page=1&limit=20` | Feed "Terbaru" dari akun yang diikuti + post sendiri |
| GET | `/api/feed/recent/check-new?since=<ISO>` | Cek jumlah post baru sejak timestamp |
| GET | `/api/posts/feed?page=1` | (Legacy) Feed kronologis dari following |

File: `src/routes/feed.routes.js`

```js
router.get('/for-you', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const posts = await getForYouFeedCached(req.user._id, { page, limit });
  const diversified = diversifyFeed(posts);
  res.json({ posts: diversified, page });
});

router.get('/recent', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const posts = await getRecentFeed(req.user._id, { page, limit });
  res.json({ posts, page });
});

router.get('/recent/check-new', requireAuth, async (req, res) => {
  const { since } = req.query;
  const count = await checkNewPosts(req.user._id, since);
  res.json({ newPostsCount: count });
});
```

---

## 9. Indikator "Postingan Baru" (New Posts Banner)

Feed menampilkan banner "X postingan baru" tanpa langsung mengubah urutan
feed yang sedang dilihat user (supaya tidak mengganggu scroll position).

Frontend bisa polling endpoint `GET /api/feed/recent/check-new?since=<ISO>`
setiap 30 detik untuk update banner, tanpa perlu fetch ulang seluruh feed.

---

## 10. MongoDB Index

Index `{ status: 1, createdAt: -1 }` ditambahkan di model Post untuk
mempercepat `$match: { status: 'published' }` yang menjadi tahap pertama
aggregation pipeline.

File: `src/models/Post.js`

```js
postSchema.index({ status: 1, createdAt: -1 });
```

---

## 11. Catatan Perbedaan dari Desain Awal

| Desain Awal | Implementasi Aktual | Alasan |
|---|---|---|
| Field `userId` di Post | Field `author` | Menyesuaikan schema Post yang sudah ada |
| Field `repostsCount` (counter) | `$size` dari array `reposts` | Array `reposts` sudah ada di schema, menghindari duplikasi data |
| Model `Follow` terpisah | Array `followers`/`following` di User | Mengikuti arsitektur User model yang sudah ada |
| Afinitas mutual follow = 3 (berdiri sendiri) | Following + follower dijumlahkan = 5+3 = 8 | Lebih akurat — mutual follow otomatis mendapat skor tertinggi |
| Endpoint di `/api/feed/*` | Endpoint di `/api/feed/*` + legacy `/api/posts/feed` | Backward compatibility dengan frontend yang sudah ada |

---

## 12. Implementation Checklist

- [x] Field `commentsCount` di schema Post (sudah ada, auto-increment via comment controller)
- [x] Repost tracking via array `reposts` di schema Post (sudah ada)
- [x] Buat `src/services/feedService.js` dengan `getForYouFeed` dan `getRecentFeed`
- [x] Implementasi aggregation pipeline skor (engagement + recency + afinitas)
- [x] Resolve interaksi 7 hari terakhir untuk skor afinitas
- [x] Buat `src/utils/diversifyFeed.js` — anti dominasi satu akun
- [x] Tangani cold start untuk user baru (boost engagement weight)
- [x] Implementasi in-memory cache 5 menit untuk feed "Untuk Kamu"
- [x] Endpoint `GET /api/feed/for-you`
- [x] Endpoint `GET /api/feed/recent`
- [x] Endpoint `GET /api/feed/recent/check-new` untuk banner postingan baru
- [x] Index MongoDB: `{ status: 1, createdAt: -1 }` di Post model
- [ ] Test: user baru (following kosong) tetap dapat feed terisi
- [ ] Test: post sangat baru (< 1 jam) tetap kompetitif dibanding post lama populer
- [ ] Test: satu akun spam tidak mendominasi >2 post berturut-turut di feed
