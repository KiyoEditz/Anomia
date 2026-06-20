# Post Limitation & Anti-Spam System — Spesifikasi Implementasi

> Dokumen ini mencakup sistem pembatasan posting berlapis untuk mencegah spam,
> scripted posting, dan penyalahgunaan API. Dirancang dengan pendekatan defense-in-depth:
> ancaman dicegat sedini mungkin sebelum menyentuh database.

---

## 1. Gambaran Sistem (Berlapis)

Spam dan scripted posting dicegat di beberapa lapisan secara berurutan:

```
Request masuk
     │
     ▼
[Layer 1] IP Rate Limiter
     │ Terlalu banyak request dari IP yang sama → 429
     ▼
[Layer 2] Auth Check
     │ Token tidak valid → 401
     ▼
[Layer 3] Cooldown antar Post
     │ Post terlalu cepat (< 30 detik dari post terakhir) → 429
     ▼
[Layer 4] Daily Post Limit
     │ Sudah 30 post → warning notifikasi
     │ Sudah 50 post → reject + notifikasi berhenti
     ▼
[Layer 5] Duplikasi Konten
     │ Konten identik / sangat mirip dengan post sebelumnya → reject
     ▼
[Layer 6] Suspicious Pattern Detection
     │ Pola script terdeteksi (posting sangat cepat berulang) → auto-suspend sementara
     ▼
Post diterima → lanjut ke pipeline moderasi konten
```

---

## 2. Data Model (MongoDB)

### Collection: `post_limits`

Satu dokumen per user per hari. Reset otomatis setiap hari baru.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  date: String,             // Format "YYYY-MM-DD", misal "2026-06-19"

  postCount: Number,        // Jumlah post hari ini (increment setiap post berhasil)
  warningIssued: Boolean,   // Sudah kirim warning di 30 post?
  limitReached: Boolean,    // Sudah diblokir di 50 post?

  lastPostAt: Date,         // Timestamp post terakhir (untuk cooldown antar post)

  // Deteksi pola mencurigakan
  rapidPostStreak: Number,  // Berapa kali berturut-turut posting < 30 detik
  suspendUntil: Date | null // Null = tidak suspend. Diisi jika terdeteksi script
}
```

### Index yang disarankan:

```js
// Query utama: cari limit record user hari ini
{ userId: 1, date: 1 }  // unique: true

// TTL index: otomatis hapus dokumen lama setelah 7 hari
{ date: 1 }  // TTL 7 hari (hanya butuh hari ini, sisanya untuk audit singkat)
```

### Tambahan di collection `posts`:

```js
// Tambah field untuk deduplication check
{
  contentHash: String,   // SHA-256 dari konten teks (lowercase, trim, hapus spasi ganda)
  // ... field posts yang sudah ada
}

// Index untuk cek duplikat
{ userId: 1, contentHash: 1 }
```

---

## 3. Layer 1 — IP Rate Limiter

Pasang di level paling awal, sebelum auth. Gunakan package `express-rate-limit`.

```bash
npm install express-rate-limit
```

```js
// src/middleware/ipRateLimiter.js
const rateLimit = require('express-rate-limit');

// Limit global: semua endpoint
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 menit
  max: 200,                   // maks 200 request per IP per 15 menit
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.' }
});

// Limit spesifik untuk endpoint post (lebih ketat)
const postEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 menit
  max: 10,              // maks 10 request ke POST /api/posts per menit per IP
  message: { message: 'Terlalu banyak permintaan posting. Tunggu sebentar.' }
});

module.exports = { globalLimiter, postEndpointLimiter };
```

```js
// Di src/server.js — pasang sebelum semua route
const { globalLimiter, postEndpointLimiter } = require('./middleware/ipRateLimiter');
app.use(globalLimiter);
app.use('/api/posts', postEndpointLimiter);
```

---

## 4. Layer 3 — Cooldown Antar Post (30 Detik)

Mencegah scripted posting yang mengirim banyak request dalam hitungan detik.

```js
// src/middleware/postCooldown.js
const PostLimit = require('../models/PostLimit');
const { getToday } = require('../utils/date');

const COOLDOWN_SECONDS = 30;

const postCooldown = async (req, res, next) => {
  const userId = req.user._id;
  const now = new Date();

  const record = await PostLimit.findOne({ userId, date: getToday() });

  if (record?.lastPostAt) {
    const secondsSinceLast = (now - new Date(record.lastPostAt)) / 1000;

    if (secondsSinceLast < COOLDOWN_SECONDS) {
      const sisaDetik = Math.ceil(COOLDOWN_SECONDS - secondsSinceLast);
      return res.status(429).json({
        message: `Posting terlalu cepat. Tunggu ${sisaDetik} detik lagi.`,
        retryAfter: sisaDetik
      });
    }
  }

  next();
};

module.exports = postCooldown;
```

---

## 5. Layer 4 — Daily Post Limit (Inti)

### Konstanta limit:

```js
// src/config/postLimits.js
module.exports = {
  DAILY_LIMIT: 50,         // Post ke-51+ ditolak
  WARNING_THRESHOLD: 30,   // Post ke-30: kirim warning pertama
  COOLDOWN_SECONDS: 30,    // Jarak minimum antar post
  RAPID_STREAK_LIMIT: 5,   // Berapa kali rapid-post sebelum dianggap bot
  SUSPEND_MINUTES: 60,     // Durasi suspend sementara kalau terdeteksi script
};
```

### Middleware utama:

```js
// src/middleware/dailyPostLimit.js
const PostLimit = require('../models/PostLimit');
const { createNotification } = require('../services/notificationService');
const { DAILY_LIMIT, WARNING_THRESHOLD, RAPID_STREAK_LIMIT, SUSPEND_MINUTES } = require('../config/postLimits');
const { getToday } = require('../utils/date');

const dailyPostLimit = async (req, res, next) => {
  const userId = req.user._id;
  const today = getToday();
  const now = new Date();

  // Ambil atau buat record hari ini
  let record = await PostLimit.findOneAndUpdate(
    { userId, date: today },
    { $setOnInsert: { postCount: 0, warningIssued: false, limitReached: false, rapidPostStreak: 0 } },
    { upsert: true, new: true }
  );

  // Cek suspend sementara (hasil deteksi bot)
  if (record.suspendUntil && new Date(record.suspendUntil) > now) {
    const menitSisa = Math.ceil((new Date(record.suspendUntil) - now) / 60000);
    return res.status(429).json({
      message: `Akunmu dibatasi sementara karena aktivitas mencurigakan. Coba lagi dalam ${menitSisa} menit.`,
    });
  }

  // Cek apakah sudah mencapai limit harian
  if (record.limitReached || record.postCount >= DAILY_LIMIT) {
    return res.status(429).json({
      message: 'Kamu sudah mencapai batas 50 postingan hari ini. Coba lagi besok.',
      postsToday: record.postCount,
      limit: DAILY_LIMIT
    });
  }

  // Deteksi rapid-post streak (bot behavior)
  const secondsSinceLast = record.lastPostAt
    ? (now - new Date(record.lastPostAt)) / 1000 : 999;

  const newStreak = secondsSinceLast < 30
    ? (record.rapidPostStreak || 0) + 1
    : 0;

  if (newStreak >= RAPID_STREAK_LIMIT) {
    const suspendUntil = new Date(now.getTime() + SUSPEND_MINUTES * 60 * 1000);
    await PostLimit.updateOne({ userId, date: today }, {
      $set: { suspendUntil, rapidPostStreak: 0 }
    });
    await createNotification({
      recipientId: userId,
      type: 'system',
      message: `Aktivitas akunmu terdeteksi tidak normal. Kemampuan posting dibatasi selama ${SUSPEND_MINUTES} menit.`,
    });
    return res.status(429).json({
      message: `Aktivitas mencurigakan terdeteksi. Kemampuan posting dibatasi ${SUSPEND_MINUTES} menit.`
    });
  }

  // Simpan info ke req untuk dipakai setelah post berhasil disimpan
  req.postLimitRecord = record;
  req.newRapidStreak = newStreak;
  next();
};

module.exports = dailyPostLimit;
```

### Fungsi setelah post berhasil dibuat:

```js
// src/services/postLimitService.js — panggil ini setelah post berhasil disimpan ke DB
const PostLimit = require('../models/PostLimit');
const { createNotification } = require('./notificationService');
const { DAILY_LIMIT, WARNING_THRESHOLD } = require('../config/postLimits');
const { getToday } = require('../utils/date');

const incrementPostCount = async (userId, currentRecord, newRapidStreak) => {
  const newCount = (currentRecord.postCount || 0) + 1;
  const today = getToday();
  const now = new Date();

  const updateData = {
    postCount: newCount,
    lastPostAt: now,
    rapidPostStreak: newRapidStreak,
    suspendUntil: null
  };

  // Warning di post ke-30
  if (newCount === WARNING_THRESHOLD && !currentRecord.warningIssued) {
    updateData.warningIssued = true;
    await createNotification({
      recipientId: userId,
      type: 'system',
      message: `Kamu sudah membuat ${WARNING_THRESHOLD} postingan hari ini. Batas harian adalah ${DAILY_LIMIT} postingan.`,
    });
  }

  // Block di post ke-50
  if (newCount >= DAILY_LIMIT) {
    updateData.limitReached = true;
    await createNotification({
      recipientId: userId,
      type: 'system',
      message: `Kamu telah mencapai batas ${DAILY_LIMIT} postingan untuk hari ini. Kemampuan posting akan pulih besok.`,
    });
  }

  await PostLimit.updateOne({ userId, date: today }, { $set: updateData });
};

module.exports = { incrementPostCount };
```

---

## 6. Layer 5 — Deduplication Konten

Menolak postingan yang identik atau sangat mirip dengan postingan sebelumnya dalam 24 jam.

```js
// src/utils/contentHash.js
const crypto = require('crypto');

const normalizeContent = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')        // Hapus spasi ganda
    .replace(/[^\w\s]/g, '');    // Hapus tanda baca
};

const hashContent = (text) => {
  const normalized = normalizeContent(text);
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

module.exports = { hashContent, normalizeContent };
```

```js
// src/middleware/contentDedup.js
const Post = require('../models/Post');
const { hashContent } = require('../utils/contentHash');

const contentDedup = async (req, res, next) => {
  const { content } = req.body;
  if (!content || content.trim().length === 0) return next();

  const hash = hashContent(content);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const duplicate = await Post.findOne({
    userId: req.user._id,
    contentHash: hash,
    createdAt: { $gte: yesterday },
    status: { $ne: 'removed' }
  });

  if (duplicate) {
    return res.status(409).json({
      message: 'Kamu sudah membuat postingan dengan konten yang sama hari ini.'
    });
  }

  req.contentHash = hash;
  next();
};

module.exports = contentDedup;
```

---

## 7. Integrasi ke Route Post

```js
// src/routes/postRoutes.js
const requireAuth = require('../middleware/requireAuth');
const { postEndpointLimiter } = require('../middleware/ipRateLimiter');
const postCooldown = require('../middleware/postCooldown');
const dailyPostLimit = require('../middleware/dailyPostLimit');
const contentDedup = require('../middleware/contentDedup');
const { incrementPostCount } = require('../services/postLimitService');

router.post(
  '/',
  requireAuth,         // Layer 2: auth
  postCooldown,        // Layer 3: cooldown 30 detik
  dailyPostLimit,      // Layer 4: limit harian
  contentDedup,        // Layer 5: duplikasi konten
  async (req, res) => {
    // ... handler buat post (simpan ke DB, upload media, dll)
    const newPost = await Post.create({
      ...postData,
      contentHash: req.contentHash || null
    });

    // Update counter setelah post berhasil dibuat
    await incrementPostCount(req.user._id, req.postLimitRecord, req.newRapidStreak);

    res.status(201).json({ post: newPost });
  }
);
```

---

## 8. Utility: getToday()

```js
// src/utils/date.js
const getToday = () => {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
};

module.exports = { getToday };
```

---

## 9. Ringkasan Respons Error per Layer

| Layer | HTTP Status | Pesan ke User |
|---|---|---|
| IP Rate Limit | 429 | "Terlalu banyak permintaan. Coba lagi dalam beberapa menit." |
| Cooldown 30 detik | 429 | "Tunggu X detik lagi." + `retryAfter` |
| Suspend (bot) | 429 | "Aktivitas mencurigakan. Dibatasi X menit." |
| Limit harian 50 | 429 | "Batas 50 postingan tercapai. Coba besok." |
| Duplikasi konten | 409 | "Kamu sudah membuat postingan dengan konten yang sama hari ini." |

---

## 10. Pembersihan Database Spam yang Sudah Ada

Sebelum deployment, bersihkan data sampah yang sudah terlanjur masuk. Jalankan
bertahap di MongoDB Atlas shell — jangan sekaligus kalau datanya besar:

```js
// Langkah 1: Identifikasi user dengan postingan > 50 hari ini
db.posts.aggregate([
  { $match: { createdAt: { $gte: new Date("2026-06-19T00:00:00Z") } } },
  { $group: { _id: "$userId", count: { $sum: 1 } } },
  { $match: { count: { $gt: 50 } } },
  { $sort: { count: -1 } }
])

// Langkah 2: Lihat contoh postingan spammer teratas sebelum hapus
db.posts.find({ userId: ObjectId("ID_USER_SPAMMER") }).limit(5)

// Langkah 3: Hapus duplikat konten (postingan dengan teks identik dari user yang sama)
db.posts.aggregate([
  { $group: {
    _id: { userId: "$userId", content: "$content" },
    ids: { $push: "$_id" },
    count: { $sum: 1 }
  }},
  { $match: { count: { $gt: 1 } } }
]).forEach(group => {
  const [keep, ...remove] = group.ids;
  db.posts.deleteMany({ _id: { $in: remove } });
});

// Langkah 4: Pastikan index contentHash ada untuk mencegah duplikat ke depannya
db.posts.createIndex({ userId: 1, contentHash: 1 })
db.post_limits.createIndex({ userId: 1, date: 1 }, { unique: true })
```

---

## 11. Implementation Checklist

- [ ] Install `express-rate-limit`
- [ ] Buat collection `post_limits` dengan index + TTL
- [ ] Tambah field `contentHash` ke collection `posts` + index
- [ ] Helper `getToday()` dan `hashContent()`
- [ ] Middleware `postCooldown` (cooldown 30 detik)
- [ ] Middleware `dailyPostLimit` (warning 30, block 50, deteksi bot)
- [ ] Middleware `contentDedup` (hash deduplication)
- [ ] Service `incrementPostCount` (update counter + kirim notifikasi)
- [ ] Integrasi semua middleware ke route `POST /api/posts`
- [ ] IP rate limiter global + spesifik endpoint post
- [ ] Jalankan cleanup script untuk data spam yang sudah ada
- [ ] Test manual: posting 30x → cek warning notif, posting 50x → cek block notif
