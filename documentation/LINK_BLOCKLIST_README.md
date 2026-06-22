# Link Blocklist Filter — Spesifikasi Implementasi

> Dokumen ini adalah skema implementasi filter tautan (URL) terlarang pada postingan
> Anomia. Didesain agar daftar link yang diblokir bisa ditambah/dihapus dengan mudah
> **tanpa perlu redeploy kode** — disimpan di database, bisa dikelola lewat API
> atau langsung lewat MongoDB shell untuk kebutuhan cepat.

---

## 1. Pendekatan

Daftar domain terlarang **tidak di-hardcode di kode**, melainkan disimpan sebagai
data di MongoDB collection `blocked_links`. Ini berarti:

- Menambah link baru = insert satu dokumen ke database, tidak perlu ubah kode/redeploy.
- Bisa dikelola lewat endpoint API (oleh role `dev`/`mod`) atau langsung lewat
  MongoDB Atlas shell kalau ingin super cepat tanpa buka aplikasi.
- Daftar di-cache di memory server agar pengecekan tiap post tetap cepat, dengan
  cache yang otomatis refresh.

---

## 2. Data Model (MongoDB)

### Collection: `blocked_links`

```js
{
  _id: ObjectId,
  pattern: String,         // Bisa berupa domain, path lengkap, atau pola wildcard
  matchType: String,       // "exact" | "pattern" — lihat penjelasan di bawah
  reason: String,          // opsional, alasan diblokir (untuk catatan internal)
  addedBy: ObjectId,       // userId dev/mod yang menambahkan
  createdAt: Date,
}
```

### Dua Mode Pencocokan

| matchType | Kapan dipakai | Contoh `pattern` | Yang ikut terblokir |
|---|---|---|---|
| `exact` | Blokir domain atau satu link spesifik | `spam-site.net` | Semua post yang mengandung string itu di mana pun |
| `pattern` | Blokir **link promosi spam** yang punya kode tracking berubah-ubah tiap kiriman (`?ref=...`, `?id=...`) | `promo-spam.com/click*` | `promo-spam.com/click?ref=8821`, `promo-spam.com/click?id=x92ka`, dst — semua varian dengan prefix yang sama |

`*` di akhir pattern berarti "apa pun setelah ini". Ini paling relevan untuk kasus
kamu: link promosi spam biasanya share prefix domain+path yang sama, hanya beda
di parameter tracking-nya — jadi cukup blokir prefix-nya saja.

### Index:
```js
// Pastikan tidak ada pattern duplikat di daftar
db.blocked_links.createIndex({ pattern: 1 }, { unique: true })
```

---

## 3. Cara Tercepat Menambah Link Blokir (Tanpa Buka Aplikasi)

Untuk kebutuhan mendesak (misal ada link spam yang baru ketahuan dan harus
segera diblokir), langsung jalankan ini di MongoDB Atlas → Collections → shell:

```js
// Blokir satu domain/link spesifik (exact match)
db.blocked_links.insertOne({
  pattern: "contoh-link-jahat.com",
  matchType: "exact",
  reason: "Spam/phishing",
  addedBy: null,
  createdAt: new Date()
})

// Blokir link promosi spam dengan kode tracking yang berubah-ubah (pattern match)
db.blocked_links.insertOne({
  pattern: "promo-spam.com/click*",
  matchType: "pattern",
  reason: "Spam promosi — kode tracking berubah tiap kiriman",
  addedBy: null,
  createdAt: new Date()
})
```

Domain/pattern langsung aktif diblokir dalam waktu maksimal sesuai durasi cache
(lihat bagian 5) — tidak perlu restart server.

---

## 4. Fungsi Normalisasi & Deteksi

Orang yang coba akali filter biasanya menyamarkan link dengan spasi, tanda kurung,
atau kata "dot". Fungsi ini menormalisasi teks dulu sebelum dicocokkan:

```js
// src/utils/linkFilter.js

const normalizeForLinkCheck = (text) => {
  if (!text) return '';

  return text
    .toLowerCase()
    // Ubah variasi penyamaran "dot" jadi titik asli
    .replace(/\s*\[\.\]\s*/g, '.')
    .replace(/\s*\(\.\)\s*/g, '.')
    .replace(/\s*\(dot\)\s*/g, '.')
    .replace(/\s+dot\s+/g, '.')
    // Hapus spasi di sekitar titik (contoh . com -> contoh.com)
    .replace(/\s*\.\s*/g, '.')
    // Hapus karakter zero-width yang kadang dipakai untuk menyamarkan teks
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
};

module.exports = { normalizeForLinkCheck };
```

```js
// src/services/blockedLinksService.js

const BlockedLink = require('../models/BlockedLink');
const { normalizeForLinkCheck } = require('../utils/linkFilter');

// Cache in-memory — refresh tiap 2 menit, hindari query DB di setiap post
let cachedRules = [];
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000;

const refreshCache = async () => {
  const docs = await BlockedLink.find().select('pattern matchType').lean();
  cachedRules = docs.map(d => ({
    pattern: d.pattern.toLowerCase(),
    matchType: d.matchType,
  }));
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
};

const getRules = async () => {
  if (Date.now() > cacheExpiresAt) {
    await refreshCache();
  }
  return cachedRules;
};

// Konversi pattern wildcard ("promo-spam.com/click*") jadi regex aman
const patternToRegex = (pattern) => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape karakter regex spesial
    .replace(/\*/g, '.*');                  // ubah * jadi wildcard regex
  return new RegExp(escaped, 'i');
};

const matchesRule = (normalizedContent, rule) => {
  if (rule.matchType === 'pattern') {
    return patternToRegex(rule.pattern).test(normalizedContent);
  }
  // exact / default: substring match biasa
  return normalizedContent.includes(rule.pattern);
};

const containsBlockedLink = async (content) => {
  if (!content) return { blocked: false };

  const normalized = normalizeForLinkCheck(content);
  const rules = await getRules();

  const matched = rules.find(rule => matchesRule(normalized, rule));

  return matched
    ? { blocked: true, matchedPattern: matched.pattern }
    : { blocked: false };
};

// Panggil ini setiap kali ada perubahan di collection blocked_links
// (lihat bagian 6 — endpoint admin) supaya cache langsung update tanpa nunggu TTL
const invalidateCache = () => {
  cacheExpiresAt = 0;
};

module.exports = { containsBlockedLink, invalidateCache };
```

---

## 5. Integrasi ke Pembuatan Post

Pasang sebagai middleware tambahan, berjalan bersama middleware lain yang sudah
ada (cooldown, daily limit, dedup):

```js
// src/middleware/linkBlocklistCheck.js

const { containsBlockedLink } = require('../services/blockedLinksService');

const linkBlocklistCheck = async (req, res, next) => {
  const { content } = req.body;

  const result = await containsBlockedLink(content);

  if (result.blocked) {
    // Jangan sebutkan domain mana yang ketahuan — supaya user tidak belajar
    // pola deteksi dan coba menyamarkan dengan cara lain
    return res.status(400).json({
      message: 'Postingan mengandung tautan yang tidak diizinkan.'
    });
  }

  next();
};

module.exports = linkBlocklistCheck;
```

```js
// src/routes/postRoutes.js — tambahkan ke chain middleware yang sudah ada
const linkBlocklistCheck = require('../middleware/linkBlocklistCheck');

router.post(
  '/',
  requireAuth,
  postCooldown,
  dailyPostLimit,
  contentDedup,
  linkBlocklistCheck,   // <-- tambahkan di sini
  async (req, res) => {
    // ... handler buat post
  }
);
```

---

## 6. API Endpoints — Kelola Daftar Lewat Aplikasi

Endpoint ini dibatasi untuk role `dev` dan `mod` (pakai middleware `requireRole`
yang sudah ada dari sistem role).

```js
// src/routes/blockedLinksRoutes.js

const requireRole = require('../middleware/requireRole');
const BlockedLink = require('../models/BlockedLink');
const { invalidateCache } = require('../services/blockedLinksService');

// GET /api/admin/blocked-links — lihat semua pattern yang diblokir
router.get('/', requireAuth, requireRole('dev', 'mod'), async (req, res) => {
  const links = await BlockedLink.find().sort({ createdAt: -1 });
  res.json({ links });
});

// POST /api/admin/blocked-links — tambah pattern baru
router.post('/', requireAuth, requireRole('dev', 'mod'), async (req, res) => {
  let { pattern, matchType, reason } = req.body;

  if (!pattern || pattern.trim().length === 0) {
    return res.status(400).json({ message: 'Pattern wajib diisi.' });
  }

  if (!['exact', 'pattern'].includes(matchType)) {
    return res.status(400).json({ message: 'matchType harus "exact" atau "pattern".' });
  }

  pattern = pattern.trim().toLowerCase();

  try {
    const newLink = await BlockedLink.create({
      pattern,
      matchType,
      reason: reason || '',
      addedBy: req.user._id,
    });

    invalidateCache(); // Langsung aktif, tidak perlu nunggu cache TTL

    res.status(201).json({ message: 'Link berhasil diblokir.', link: newLink });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Pattern ini sudah ada di daftar blokir.' });
    }
    throw err;
  }
});

// DELETE /api/admin/blocked-links/:id — hapus pattern dari daftar
router.delete('/:id', requireAuth, requireRole('dev', 'mod'), async (req, res) => {
  await BlockedLink.findByIdAndDelete(req.params.id);
  invalidateCache();
  res.json({ message: 'Pattern berhasil dihapus dari daftar blokir.' });
});

module.exports = router;
```

```js
// src/server.js — daftarkan route
const blockedLinksRoutes = require('./routes/blockedLinksRoutes');
app.use('/api/admin/blocked-links', blockedLinksRoutes);
```

---

## 7. UI Sederhana untuk Tambah Link (Frontend — Khusus Dev/Mod)

Cukup satu halaman simpel di panel moderasi, tidak perlu kompleks:

```jsx
// web/src/pages/AdminBlockedLinks.jsx (contoh sederhana)

import { useState, useEffect } from 'react';

const AdminBlockedLinks = () => {
  const [links, setLinks] = useState([]);
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState('exact');
  const [reason, setReason] = useState('');

  const fetchLinks = async () => {
    const res = await fetch('/api/admin/blocked-links', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    setLinks(data.links);
  };

  useEffect(() => { fetchLinks(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/blocked-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ pattern, matchType, reason })
    });
    setPattern('');
    setReason('');
    fetchLinks();
  };

  const handleDelete = async (id) => {
    await fetch(`/api/admin/blocked-links/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    fetchLinks();
  };

  return (
    <div>
      <h2>Daftar Link Diblokir</h2>

      <form onSubmit={handleAdd}>
        <select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
          <option value="exact">Exact — domain/link spesifik</option>
          <option value="pattern">Pattern — link promosi dgn kode tracking (pakai *)</option>
        </select>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={
            matchType === 'pattern'
              ? 'contoh: promo-spam.com/click*'
              : 'contoh: contoh-link-jahat.com'
          }
          required
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan (opsional)"
        />
        <button type="submit">Tambah</button>
      </form>

      <ul>
        {links.map((link) => (
          <li key={link._id}>
            <code>{link.pattern}</code> ({link.matchType}) — {link.reason}
            <button onClick={() => handleDelete(link._id)}>Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminBlockedLinks;
```

Tambahkan link ke halaman ini di menu navigasi, hanya tampil untuk user dengan
`role === 'dev'` atau `role === 'mod'`.

---

## 8. Batasan yang Perlu Diketahui

- **`exact`**: pencocokan substring biasa. Kalau memblokir `contoh.com`, maka
  `subdomain.contoh.com` dan `contoh.com.fake-tld.net` juga ikut terblokir
  (karena keduanya mengandung string `contoh.com`). Untuk Anomia, ini perilaku
  yang diinginkan — lebih baik over-block daripada lolos.
- **`pattern`**: gunakan ini khusus untuk **link promosi spam** yang punya kode
  tracking/referral berbeda tiap kiriman. Cukup blokir prefix yang konsisten
  (misal `promo-spam.com/click*`), tidak perlu menambah entry baru tiap kali
  spammer ganti kode tracking-nya.
- **Tidak menangani link shortener** (bit.ly, tinyurl, dll) — link aslinya
  tersembunyi di balik shortener sehingga tidak akan terdeteksi oleh filter
  ini, baik mode `exact` maupun `pattern`. Kalau ingin mencegah ini juga, perlu
  fitur tambahan untuk resolve redirect URL sebelum dicek.
- **Cache 2 menit** berarti kalau menambah pattern lewat MongoDB shell langsung
  (bukan lewat API), perubahan baru aktif maksimal 2 menit kemudian — bukan
  instan seperti lewat endpoint API (yang langsung invalidate cache).

---

## 9. Implementation Checklist

- [ ] Buat collection `blocked_links` dengan unique index pada `pattern`
- [ ] Buat `src/utils/linkFilter.js` (fungsi normalisasi)
- [ ] Buat `src/services/blockedLinksService.js` (cache + cek exact & pattern matching)
- [ ] Buat middleware `linkBlocklistCheck.js`
- [ ] Integrasikan middleware ke route `POST /api/posts`
- [ ] Buat endpoint GET/POST/DELETE `/api/admin/blocked-links` (role dev/mod)
- [ ] Buat halaman admin sederhana di frontend untuk kelola daftar (dengan pilihan matchType)
- [ ] Tambahkan menu navigasi khusus dev/mod menuju halaman ini
- [ ] Test: posting dengan domain exact yang diblokir → harus ditolak
- [ ] Test: posting dengan link promosi yang cocok pattern (beda kode tracking) → tetap terblokir
- [ ] Test: tambah pattern baru lewat UI → langsung aktif tanpa redeploy
- [ ] Test: domain dengan variasi penyamaran (`contoh [.] com`) tetap terdeteksi
