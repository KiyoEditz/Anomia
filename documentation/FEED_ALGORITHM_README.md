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
| **Terbaru** | Hanya post dari akun yang diikuti | Kronologis murni, terbaru paling atas |

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

```
skor_afinitas =
  + 5   jika user mengikuti penulis post
  + 3   jika penulis post mengikuti user (mutual follow lebih relevan)
  + 2   jika user pernah like/komentar post penulis ini sebelumnya (7 hari terakhir)
  + 0   jika tidak ada hubungan apapun (post dari "stranger")
```

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

```js
// src/services/feedService.js

const Post = require('../models/Post');
const Follow = require('../models/Follow'); // atau field followers/following di User

const WEIGHTS = { engagement: 1.0, recency: 100, affinity: 1.0 };

const getForYouFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const now = new Date();

  // Ambil daftar following user untuk skor afinitas
  const currentUser = await User.findById(userId).select('following');
  const followingIds = currentUser.following.map(id => id.toString());

  const posts = await Post.aggregate([
    // 1. Hanya post yang sudah published, bukan dari user yang diblokir
    { $match: { status: 'published' } },

    // 2. Hitung umur post dalam jam
    {
      $addFields: {
        ageInHours: {
          $divide: [{ $subtract: [now, '$createdAt'] }, 1000 * 60 * 60]
        }
      }
    },

    // 3. Hitung skor engagement
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $multiply: [{ $size: { $ifNull: ['$likes', []] } }, 1] },
            { $multiply: ['$commentsCount', 2] },
            { $multiply: [{ $ifNull: ['$repostsCount', 0] }, 3] },
          ]
        }
      }
    },

    // 4. Hitung skor recency
    {
      $addFields: {
        recencyScore: {
          $divide: [
            1,
            { $pow: [{ $add: ['$ageInHours', 2] }, 1.5] }
          ]
        }
      }
    },

    // 5. Hitung skor afinitas (sederhana — di-refine lebih lanjut di app layer
    //    untuk komponen "pernah interaksi 7 hari terakhir" karena butuh join tambahan)
    {
      $addFields: {
        affinityScore: {
          $cond: [
            { $in: ['$userId', followingIds.map(id => new mongoose.Types.ObjectId(id))] },
            5,
            0
          ]
        }
      }
    },

    // 6. Gabungkan jadi skor total
    {
      $addFields: {
        totalScore: {
          $add: [
            { $multiply: ['$engagementScore', WEIGHTS.engagement] },
            { $multiply: ['$recencyScore', WEIGHTS.recency] },
            { $multiply: ['$affinityScore', WEIGHTS.affinity] },
          ]
        }
      }
    },

    // 7. Urutkan berdasarkan skor tertinggi
    { $sort: { totalScore: -1 } },

    // 8. Paginasi
    { $skip: (page - 1) * limit },
    { $limit: limit },

    // 9. Join data author
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'author'
      }
    },
    { $unwind: '$author' },
  ]);

  return posts;
};

module.exports = { getForYouFeed };
```

```js
// Tab "Terbaru" — jauh lebih sederhana, tidak perlu aggregation pipeline
const getRecentFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const currentUser = await User.findById(userId).select('following');

  const posts = await Post.find({
    userId: { $in: currentUser.following },
    status: 'published',
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('userId', 'username displayName avatarUrl role');

  return posts;
};

module.exports = { getForYouFeed, getRecentFeed };
```

---

## 5. Diversity Guard (Anti Post Beruntun dari Satu Akun)

Tanpa pengaman ini, satu akun yang sangat aktif/viral bisa mendominasi seluruh
halaman pertama feed "Untuk Kamu". Tambahkan filter setelah hasil aggregation:

```js
// src/utils/diversifyFeed.js

// Maksimal 2 post berturut-turut dari penulis yang sama
const diversifyFeed = (posts, maxConsecutive = 2) => {
  const result = [];
  const buffer = [];
  let lastAuthorId = null;
  let consecutiveCount = 0;

  for (const post of posts) {
    const authorId = post.author._id.toString();

    if (authorId === lastAuthorId) {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      lastAuthorId = authorId;
    }

    if (consecutiveCount <= maxConsecutive) {
      result.push(post);
    } else {
      buffer.push(post); // Simpan untuk disisipkan nanti, jangan dibuang
    }
  }

  // Sisipkan sisa post dari buffer di akhir, supaya tidak hilang total
  return [...result, ...buffer];
};

module.exports = diversifyFeed;
```

---

## 6. Cold Start — User Baru Tanpa Following/Riwayat

User yang baru daftar belum punya `following` dan belum punya riwayat interaksi,
sehingga skor afinitas selalu 0 untuk semua post. Ini tidak masalah secara teknis
(feed tetap terisi berdasarkan engagement + recency), tapi untuk pengalaman lebih baik:

```js
const getForYouFeed = async (userId, options) => {
  const currentUser = await User.findById(userId).select('following');

  // Jika following kosong (user baru), boost sedikit bobot engagement
  // supaya feed terasa "ramai" alih-alih kosong/personal yang hampa
  const isNewUser = currentUser.following.length === 0;
  const weights = isNewUser
    ? { ...WEIGHTS, engagement: 1.5 }
    : WEIGHTS;

  // ... lanjut proses dengan weights yang disesuaikan
};
```

---

## 7. Caching — Hindari Hitung Ulang Setiap Request

Menghitung aggregation pipeline di atas untuk **setiap** request feed cukup
berat kalau traffic naik. Untuk skala saat ini, cache sederhana sudah cukup:

```js
// Strategi: cache hasil "Untuk Kamu" per user selama 5 menit
// Tidak perlu Redis dulu — bisa pakai in-memory cache sederhana,
// upgrade ke Redis kalau Render instance sudah multi-region/scaling

const feedCache = new Map(); // userId -> { data, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

const getForYouFeedCached = async (userId, options) => {
  const cacheKey = `${userId}_${options.page || 1}`;
  const cached = feedCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await getForYouFeed(userId, options);
  feedCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

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
| GET | `/api/feed/for-you?page=1&limit=20` | Feed "Untuk Kamu" dengan scoring |
| GET | `/api/feed/recent?page=1&limit=20` | Feed "Terbaru" dari akun yang diikuti |

```js
// src/routes/feedRoutes.js
const { getForYouFeedCached, getRecentFeed } = require('../services/feedService');
const diversifyFeed = require('../utils/diversifyFeed');

router.get('/for-you', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const posts = await getForYouFeedCached(req.user._id, { page: Number(page), limit: Number(limit) });
  const diversified = diversifyFeed(posts);
  res.json({ posts: diversified });
});

router.get('/recent', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const posts = await getRecentFeed(req.user._id, { page: Number(page), limit: Number(limit) });
  res.json({ posts });
});
```

---

## 9. Indikator "Postingan Baru" (New Posts Banner)

Seperti yang sudah direncanakan di UI redesign — feed perlu menampilkan banner
"X postingan baru" tanpa langsung mengubah urutan feed yang sedang dilihat user
(supaya tidak mengganggu scroll position).

```js
// GET /api/feed/recent/check-new?since=<timestamp ISO terakhir kali load>
router.get('/recent/check-new', requireAuth, async (req, res) => {
  const { since } = req.query;
  const currentUser = await User.findById(req.user._id).select('following');

  const count = await Post.countDocuments({
    userId: { $in: currentUser.following },
    status: 'published',
    createdAt: { $gt: new Date(since) },
  });

  res.json({ newPostsCount: count });
});
```

Frontend bisa polling endpoint ini setiap 30 detik untuk update banner, tanpa
perlu fetch ulang seluruh feed.

---

## 10. Implementation Checklist

- [ ] Tambah field `commentsCount`, `repostsCount` ke schema Post (jika belum ada,
      di-update via increment setiap ada komentar/repost baru — hindari `$size`
      pada array besar tiap request)
- [ ] Buat `feedService.js` dengan fungsi `getForYouFeed` dan `getRecentFeed`
- [ ] Implementasi aggregation pipeline skor (engagement + recency + afinitas)
- [ ] Buat `diversifyFeed.js` — anti dominasi satu akun
- [ ] Tangani cold start untuk user baru
- [ ] Implementasi in-memory cache 5 menit untuk feed "Untuk Kamu"
- [ ] Endpoint `GET /api/feed/for-you`
- [ ] Endpoint `GET /api/feed/recent`
- [ ] Endpoint `GET /api/feed/recent/check-new` untuk banner postingan baru
- [ ] Index MongoDB: `{ status: 1, createdAt: -1 }` di collection `posts` untuk
      mempercepat query dasar sebelum aggregation
- [ ] Test: user baru (following kosong) tetap dapat feed terisi
- [ ] Test: post sangat baru (< 1 jam) tetap kompetitif dibanding post lama populer
- [ ] Test: satu akun spam tidak mendominasi >2 post berturut-turut di feed
