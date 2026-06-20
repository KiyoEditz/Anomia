# Security Hardening — Spesifikasi Perbaikan Menyeluruh

> Dokumen ini mencakup perbaikan untuk semua celah keamanan yang ditemukan pada Anomia.
> Urutan implementasi mengikuti tingkat keparahan: dari yang paling kritis hingga sedang.
> Semua perbaikan harus diimplementasikan sebelum aplikasi dianggap aman untuk publik.

---

## Ringkasan Celah & Status

| # | Celah | Tingkat | Status Target |
|---|---|---|---|
| 1 | Socket.io tanpa validasi auth | 🔴 Kritis | Harus fix sekarang |
| 2 | JWT mock token diterima | 🔴 Kritis | Harus fix sekarang |
| 3 | Wildcard CORS + Authorization header di preflight | 🟠 Tinggi | Harus fix sekarang |
| 4 | Brute force login — tidak ada rate limiting | 🟠 Tinggi | Harus fix sekarang |
| 5 | Registrasi massal via IP yang sama | 🟠 Tinggi | Harus fix sekarang |
| 6 | Stored XSS — HTML mentah di post | 🟡 Sedang | Fix sebelum fitur baru |
| 7 | User enumeration via MongoDB ObjectID | 🟡 Sedang | Fix sebelum fitur baru |
| 8 | Verbose error — bocorkan detail implementasi | 🟡 Sedang | Fix sebelum fitur baru |
| 9 | MongoDB error disclosure di stack trace | 🟡 Sedang | Fix sebelum fitur baru |
| 10 | /package.json terekspos — bocorkan tech stack | 🟢 Rendah | Fix kapan sempat |

---

## FIX 1 — Socket.io Authentication

### Masalah
Koneksi Socket.io tidak memvalidasi siapa yang terhubung. Siapa pun bisa mengirim
handshake dengan `{ userId: "...", role: "dev" }` dan server langsung mempercayainya
tanpa verifikasi. Ini memungkinkan seseorang menyamar sebagai Developer atau user
mana pun.

### Perbaikan

**Install dependency:**
```bash
npm install jsonwebtoken
```

```js
// src/socket/socketAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
  try {
    // Ambil token dari handshake — dikirim client saat connect
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('SOCKET_UNAUTHORIZED: Token tidak ditemukan.'));
    }

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ambil data user terbaru dari DB — jangan percaya payload token saja
    const user = await User.findById(decoded.userId).select('_id username role');

    if (!user) {
      return next(new Error('SOCKET_UNAUTHORIZED: User tidak ditemukan.'));
    }

    // Attach user yang sudah terverifikasi ke socket
    // Role diambil dari DB, bukan dari token/payload client
    socket.user = {
      _id: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('SOCKET_UNAUTHORIZED: Sesi berakhir. Silakan login ulang.'));
    }
    return next(new Error('SOCKET_UNAUTHORIZED: Token tidak valid.'));
  }
};

module.exports = socketAuth;
```

```js
// src/socket/index.js (atau di mana Socket.io diinisialisasi)
const { Server } = require('socket.io');
const socketAuth = require('./socketAuth');
const { ALLOWED_ORIGINS } = require('../config/cors');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      credentials: true,
    },
  });

  // Pasang middleware auth SEBELUM handler apapun
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { _id, username, role } = socket.user;

    // Join ke room personal berdasarkan userId yang sudah terverifikasi DB
    socket.join(`user_${_id}`);

    console.log(`[Socket] ${username} (${role}) terhubung.`);

    socket.on('disconnect', () => {
      console.log(`[Socket] ${username} terputus.`);
    });
  });

  return io;
};

module.exports = initSocket;
```

```js
// Di sisi frontend — kirim token saat connect
import { io } from 'socket.io-client';

const token = localStorage.getItem('token'); // atau dari state/cookie

const socket = io(import.meta.env.VITE_API_URL, {
  auth: { token },
  withCredentials: true,
});

socket.on('connect_error', (err) => {
  if (err.message.includes('SOCKET_UNAUTHORIZED')) {
    // Token expired atau tidak valid — redirect ke halaman login
    window.location.href = '/login';
  }
});
```

---

## FIX 2 — JWT Validation yang Ketat

### Masalah
Middleware auth tidak memvalidasi token dengan benar, sehingga token palsu/mock
bisa diterima. Ini membuka akses ke semua endpoint yang seharusnya terlindungi.

### Perbaikan

**Langkah 0 — Pastikan JWT_SECRET kuat:**
```bash
# Generate secret acak yang kuat (jalankan sekali, simpan di .env dan Render env vars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Tempel hasilnya ke `JWT_SECRET` di Render environment variables. Ganti yang lama
sekarang juga — semua token yang diterbitkan dengan secret lama akan otomatis invalid.

```js
// src/middleware/requireAuth.js — GANTI VERSI LAMA SEPENUHNYA

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    // 1. Ambil token dari header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Token tidak ditemukan.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ message: 'Unauthorized: Token tidak valid.' });
    }

    // 2. Verifikasi kriptografi token — ini yang sering dilewatkan
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],     // Hanya izinkan algoritma yang kita gunakan
      issuer: 'anomia',          // Harus cocok dengan issuer saat token dibuat
    });

    // 3. Cek apakah userId di dalam token memang ada di database
    // Jangan percaya payload token 100% — selalu cross-check ke DB
    const user = await User.findById(decoded.userId).select(
      '_id username role email avatarUrl'
    );

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized: User tidak ditemukan.' });
    }

    // 4. Attach user ke request — role diambil dari DB, bukan dari token
    req.user = user;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesi berakhir. Silakan login ulang.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Unauthorized: Token tidak valid.' });
    }
    if (err.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'Unauthorized: Token belum aktif.' });
    }
    console.error('[Auth Error]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
};

module.exports = requireAuth;
```

```js
// src/utils/generateToken.js — pastikan token dibuat dengan issuer yang sesuai

const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
  return jwt.sign(
    { userId: userId.toString() },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      algorithm: 'HS256',
      issuer: 'anomia',  // Harus cocok dengan verifikasi di atas
    }
  );
};

module.exports = generateToken;
```

---

## FIX 3 — CORS: Origin Spesifik & Blokir Authorization di Preflight

### Masalah
Dua celah sekaligus di konfigurasi CORS:
1. Wildcard `*` mengizinkan domain mana pun membaca response API.
2. `Authorization` header diizinkan di CORS preflight — artinya website lintas domain
   bisa mengirim JWT token user ke API kamu tanpa sepengetahuan user (cross-origin
   token theft / CSRF via CORS).

### Perbaikan

```js
// src/config/cors.js
const ALLOWED_ORIGINS = [
  'http://localhost:5173',              // Development
  'http://localhost:4173',              // Vite preview
  'https://anomia.pages.dev',          // Cloudflare Pages (ganti dengan domain asli)
  'https://anomia-2lh.pages.dev',      // Subdomain Cloudflare Pages jika berbeda
  // Tambahkan custom domain di sini jika sudah punya
];

// Untuk Socket.io — export terpisah agar bisa dipakai di initSocket
module.exports = { ALLOWED_ORIGINS };
```

```js
// src/server.js — ganti konfigurasi cors yang lama
const cors = require('cors');
const { ALLOWED_ORIGINS } = require('./config/cors');

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (Postman, mobile app, curl)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Ditolak dari origin: ${origin}`);
    return callback(new Error(`Origin tidak diizinkan oleh CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // Eksplisit — jangan biarkan browser kirim Authorization dari origin asing
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Jangan expose header sensitif ke browser lintas domain
  exposedHeaders: [],
}));

// Tangani OPTIONS preflight secara eksplisit
// Ini mencegah Authorization header bocor ke domain yang tidak diizinkan
app.options('*', cors());
```

---

## FIX 4 — Brute Force Login & Rate Limiting Registrasi

### Masalah
Tidak ada pembatasan percobaan login — penyerang bisa mencoba ribuan kombinasi
password secara otomatis (brute force). Selain itu, tidak ada pembatasan registrasi
per IP, sehingga satu orang bisa membuat ratusan akun dengan script.

### Perbaikan

**Install dependency:**
```bash
npm install express-rate-limit
```

```js
// src/middleware/authRateLimiter.js
const rateLimit = require('express-rate-limit');

// --- Brute Force Login ---
// Maks 8 percobaan login per IP per hari
const loginLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,  // 24 jam
  max: 8,
  skipSuccessfulRequests: true,    // Login berhasil tidak dihitung sebagai percobaan
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,   // Batasi per IP
  handler: (req, res) => {
    console.warn(`[Security] Brute force terdeteksi dari IP: ${req.ip}`);
    return res.status(429).json({
      message: 'Terlalu banyak percobaan login. Coba lagi besok.',
      retryAfter: '24 jam',
    });
  },
});

// --- Registrasi Massal ---
// Maks 3 akun baru per IP dalam 1 jam
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 jam
  max: 3,
  skipSuccessfulRequests: false,   // Registrasi berhasil pun dihitung
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    console.warn(`[Security] Registrasi massal dari IP: ${req.ip}`);
    return res.status(429).json({
      message: 'Terlalu banyak akun dibuat dari jaringan ini. Coba lagi dalam 1 jam.',
    });
  },
});

module.exports = { loginLimiter, registerLimiter };
```

```js
// src/routes/authRoutes.js — pasang limiter ke route yang sesuai
const { loginLimiter, registerLimiter } = require('../middleware/authRateLimiter');

// Login: maks 8x salah per IP per hari
router.post('/login', loginLimiter, loginHandler);

// Register: maks 3 akun per IP per jam
router.post('/register', registerLimiter, registerHandler);
```

**Catatan penting tentang IP di Render:**
Karena Render menggunakan proxy/load balancer, `req.ip` secara default mengembalikan
IP internal Render, bukan IP asli user. Tambahkan ini di `server.js` agar `req.ip`
berisi IP asli:

```js
// src/server.js — tambahkan SEBELUM middleware lain
app.set('trust proxy', 1); // Percayai satu level proxy (Render)
```

---

## FIX 5 — Stored XSS — HTML Mentah di Post

### Masalah
Server menyimpan HTML mentah dari input user ke MongoDB tanpa sanitasi.
Meskipun React melindungi via rendering default, penggunaan `dangerouslySetInnerHTML`
di mana pun di frontend akan langsung memicu XSS.

### Perbaikan

**Install dependency:**
```bash
npm install sanitize-html
```

```js
// src/utils/sanitize.js
const sanitizeHtml = require('sanitize-html');

// Konfigurasi ketat: strip SEMUA HTML dari konten post
// User tidak boleh inject tag apapun — konten murni teks
const sanitizePostContent = (content) => {
  if (!content || typeof content !== 'string') return '';

  return sanitizeHtml(content, {
    allowedTags: [],        // Tidak ada tag HTML yang diizinkan
    allowedAttributes: {},  // Tidak ada atribut yang diizinkan
    disallowedTagsMode: 'discard',
  }).trim();
};

// Konfigurasi lebih longgar untuk bio user (jika ingin izinkan bold/italic)
const sanitizeBio = (bio) => {
  if (!bio || typeof bio !== 'string') return '';

  return sanitizeHtml(bio, {
    allowedTags: ['b', 'i', 'em', 'strong'],  // Hanya formatting dasar
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
};

module.exports = { sanitizePostContent, sanitizeBio };
```

```js
// Di handler POST /api/posts — sanitasi sebelum disimpan ke DB
const { sanitizePostContent } = require('../utils/sanitize');

const createPostHandler = async (req, res) => {
  let { content } = req.body;

  // Sanitasi wajib sebelum menyentuh DB
  content = sanitizePostContent(content);

  // Validasi setelah sanitasi — konten bisa jadi kosong setelah HTML di-strip
  if (!content && !req.file) {
    return res.status(400).json({ message: 'Postingan tidak boleh kosong.' });
  }

  const post = await Post.create({
    userId: req.user._id,
    content,
    // ... field lain
  });

  res.status(201).json({ post });
};
```

```js
// Di handler update profil — sanitasi bio juga
const { sanitizeBio } = require('../utils/sanitize');

const updateProfileHandler = async (req, res) => {
  const { bio, displayName } = req.body;

  await User.findByIdAndUpdate(req.user._id, {
    bio: sanitizeBio(bio),
    displayName: sanitizePostContent(displayName), // display name: teks saja
  });

  res.json({ message: 'Profil berhasil diperbarui.' });
};
```

**Tambahan di frontend** — Pastikan tidak ada penggunaan `dangerouslySetInnerHTML`
untuk konten yang berasal dari user. Cari di seluruh codebase:
```bash
# Jalankan di folder web/src
grep -r "dangerouslySetInnerHTML" src/
```
Jika ada, ganti dengan rendering teks biasa menggunakan children prop React.

---

## FIX 6 — Sembunyikan MongoDB ObjectID dari Response Publik

### Masalah
MongoDB ObjectID (`_id`) terekspos di semua response API publik (profil, postingan, dll).
Karena polanya dapat diprediksi (berisi timestamp + machine ID), ini memudahkan
penyerang melakukan enumerasi untuk menemukan semua akun yang terdaftar.

### Perbaikan

**Strategi:** gunakan `username` sebagai identifier publik untuk profil dan user,
bukan `_id`. Untuk postingan, bisa tetap pakai ID tapi ubah ke format yang
tidak mengekspos struktur internal MongoDB.

```js
// src/utils/formatUser.js
// Gunakan fungsi ini di SEMUA response API yang menyertakan data user

const formatUserPublic = (user) => ({
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  bannerUrl: user.bannerUrl,
  bio: user.bio,
  role: user.role,
  followersCount: user.followers?.length || 0,
  followingCount: user.following?.length || 0,
  createdAt: user.createdAt,
  // _id TIDAK dimasukkan ke response publik
});

const formatUserPrivate = (user) => ({
  ...formatUserPublic(user),
  email: user.email,
  // _id hanya untuk response ke pemilik akun sendiri, tidak pernah ke user lain
});

module.exports = { formatUserPublic, formatUserPrivate };
```

```js
// Contoh penggunaan di route profil publik
const { formatUserPublic } = require('../utils/formatUser');

// GET /api/users/:username — profil publik, pakai username bukan _id
router.get('/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username });

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  // Kirim hanya field publik yang aman
  res.json({ user: formatUserPublic(user) });
});
```

```js
// src/utils/formatPost.js
// Untuk response postingan — tidak expose _id MongoDB mentah

const { formatUserPublic } = require('./formatUser');

const formatPost = (post) => ({
  id: post._id.toString(),    // Convert ke string, tapi pertimbangkan UUID ke depannya
  content: post.content,
  mediaUrl: post.mediaUrl,
  mediaType: post.mediaType,
  author: post.userId ? formatUserPublic(post.userId) : null,
  likesCount: post.likes?.length || 0,
  commentsCount: post.commentsCount || 0,
  createdAt: post.createdAt,
  // userId (ObjectID mentah) TIDAK diekspos
});

module.exports = { formatPost };
```

**Tambahan — Pastikan route profil tidak bisa diakses via ObjectID:**
```js
// Tolak request yang coba akses profil via format ObjectID (24 hex chars)
const isObjectId = (str) => /^[a-f\d]{24}$/i.test(str);

router.get('/:identifier', async (req, res) => {
  if (isObjectId(req.params.identifier)) {
    // Jangan berikan informasi apapun — pura-pura tidak ditemukan
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  // Lanjut cari berdasarkan username
});
```

---

## FIX 7 — Pesan Error Verbose: Bocorkan Detail Implementasi

### Masalah
Pesan error yang dikirim ke client membocorkan detail teknis internal — misalnya
pesan error mentah dari bcrypt, nama library, atau detail validasi yang seharusnya
hanya untuk debugging. Ini memudahkan penyerang memetakan stack teknologi dan
mencari celah yang spesifik untuk versi library yang digunakan.

### Perbaikan

**Prinsip:** pesan error ke client harus selalu generik dan konsisten. Detail
teknis lengkap hanya boleh masuk ke log server (`console.error`), tidak pernah
ke response JSON.

```js
// src/middleware/errorHandler.js
// Pasang sebagai middleware terakhir di server.js (setelah semua route)

const errorHandler = (err, req, res, next) => {
  // Log detail lengkap HANYA ke server console — tidak pernah ke response
  console.error('[Error]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Tentukan status code yang sesuai, tapi pesan ke client selalu generik
  const statusCode = err.statusCode || 500;

  const safeMessages = {
    400: 'Permintaan tidak valid.',
    401: 'Unauthorized.',
    403: 'Akses ditolak.',
    404: 'Data tidak ditemukan.',
    409: 'Terjadi konflik data.',
    429: 'Terlalu banyak permintaan.',
    500: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.',
  };

  res.status(statusCode).json({
    message: safeMessages[statusCode] || safeMessages[500],
    // TIDAK menyertakan: err.message asli, err.stack, nama library, query DB
  });
};

module.exports = errorHandler;
```

```js
// src/server.js — pasang PALING TERAKHIR, setelah semua app.use(route) lain
const errorHandler = require('./middleware/errorHandler');

// ... semua routes di sini ...

app.use(errorHandler); // Harus paling bawah
```

**Audit semua handler auth** — cari pola seperti ini dan ganti:

```js
// ❌ SEBELUM — membocorkan detail bcrypt/implementasi
try {
  const isMatch = await bcrypt.compare(password, user.passwordHash);
} catch (err) {
  return res.status(500).json({ message: err.message }); // bocor!
}

// ✅ SESUDAH — pesan generik, detail asli hanya di log
try {
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    // Pesan login gagal harus SAMA baik karena email tidak ada maupun password salah
    // Supaya tidak bisa dipakai untuk menebak email mana yang terdaftar
    return res.status(401).json({ message: 'Email atau password salah.' });
  }
} catch (err) {
  console.error('[Login Error]', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
}
```

---

## FIX 8 — MongoDB Error Disclosure di Stack Trace

### Masalah
Saat terjadi error dari Mongoose/MongoDB (misalnya validation error, duplicate key),
error mentah yang dikirim ke client menyebutkan nama model, nama field, bahkan
struktur schema internal — informasi yang seharusnya tidak pernah keluar dari server.

### Perbaikan

```js
// src/utils/handleMongoError.js
// Konversi error Mongoose/MongoDB jadi pesan aman sebelum dikirim ke client

const handleMongoError = (err) => {
  // Duplicate key error (misal username/email sudah dipakai)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'data';
    const fieldLabel = { username: 'Username', email: 'Email' }[field] || 'Data';
    return { statusCode: 409, message: `${fieldLabel} sudah digunakan.` };
  }

  // Validation error — ambil pesan yang sudah didefinisikan di schema,
  // BUKAN nama model atau path field mentah
  if (err.name === 'ValidationError') {
    return { statusCode: 400, message: 'Data yang dikirim tidak valid.' };
  }

  // Cast error (misal ObjectID tidak valid) — jangan sebut "CastError" atau "_id"
  if (err.name === 'CastError') {
    return { statusCode: 400, message: 'Data tidak ditemukan.' };
  }

  // Default — tidak dikenali, anggap server error generik
  return { statusCode: 500, message: 'Terjadi kesalahan pada server.' };
};

module.exports = handleMongoError;
```

```js
// Penggunaan di handler, lalu teruskan ke errorHandler global (FIX 7)
const handleMongoError = require('../utils/handleMongoError');

const registerHandler = async (req, res, next) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json({ message: 'Registrasi berhasil.' });
  } catch (err) {
    console.error('[Register Error]', err); // Detail asli tetap di log server
    const { statusCode, message } = handleMongoError(err);
    return res.status(statusCode).json({ message });
  }
};
```

**Pastikan juga** `NODE_ENV=production` diset di Render environment variables —
beberapa library (termasuk Express secara default) menampilkan stack trace
lengkap di response saat `NODE_ENV` bukan `production`.

---

## FIX 9 — `/package.json` Terekspos Publik

### Masalah
File `package.json` backend bisa diakses langsung lewat URL publik, membocorkan
seluruh daftar dependency beserta versinya (React 18, Vite 5, dll). Ini memudahkan
penyerang mencari CVE/exploit yang cocok dengan versi spesifik yang dipakai.

### Perbaikan

Penyebab paling umum: folder backend di-serve sebagai static files tanpa
pengecualian, atau `express.static()` mengarah ke root folder yang masih
berisi `package.json`.

```js
// src/server.js

// ❌ SEBELUM — kalau static folder mengarah ke root project
app.use(express.static(path.join(__dirname, '..'))); // bahaya — expose semua file

// ✅ SESUDAH — hanya serve folder build frontend yang memang publik
// (jika backend juga serve frontend statis — biasanya tidak perlu jika pakai Cloudflare Pages)
app.use(express.static(path.join(__dirname, '../web/dist')));
```

Tambahan — blokir eksplisit akses ke file sensitif, sebagai lapisan perlindungan kedua:

```js
// src/middleware/blockSensitiveFiles.js
const SENSITIVE_FILES = [
  '/package.json',
  '/package-lock.json',
  '/.env',
  '/.env.example',
  '/.git',
];

const blockSensitiveFiles = (req, res, next) => {
  if (SENSITIVE_FILES.some((file) => req.path.startsWith(file))) {
    return res.status(404).json({ message: 'Data tidak ditemukan.' });
  }
  next();
};

module.exports = blockSensitiveFiles;
```

```js
// src/server.js — pasang di awal, sebelum static middleware
const blockSensitiveFiles = require('./middleware/blockSensitiveFiles');
app.use(blockSensitiveFiles);
```

**Verifikasi cepat setelah deploy:**
```bash
curl https://anomia.onrender.com/package.json
# Harus mengembalikan 404, bukan isi package.json
```

---

## Security Headers Tambahan (Bonus)

Pasang header HTTP keamanan di semua response untuk perlindungan ekstra:

```bash
npm install helmet
```

```js
// src/server.js — pasang paling atas, sebelum middleware lain
const helmet = require('helmet');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Izinkan CDN load media
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      mediaSrc: ["'self'", 'https://res.cloudinary.com'],
      connectSrc: ["'self'", 'https://anomia.onrender.com'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
```

---

## Checklist Verifikasi Setelah Implementasi

### Test manual yang harus dilakukan:

**JWT:**
- [ ] Coba request ke endpoint protected tanpa token → harus dapat 401
- [ ] Coba dengan token palsu/random string → harus dapat 401
- [ ] Coba dengan token yang sudah expired → harus dapat 401 dengan pesan "sesi berakhir"
- [ ] Login normal → harus berhasil dan token bekerja

**Socket.io:**
- [ ] Coba connect Socket.io tanpa token di auth → harus dapat error SOCKET_UNAUTHORIZED
- [ ] Coba connect dengan token palsu → harus ditolak
- [ ] Coba connect dengan token valid → harus berhasil, join room userId yang benar
- [ ] Pastikan `socket.user.role` diambil dari DB, bukan dari payload yang dikirim client

**CORS:**
- [ ] Buka browser console di domain yang tidak diizinkan, coba fetch ke API → harus CORS error
- [ ] Request dari Cloudflare Pages → harus berhasil
- [ ] Request dari localhost:5173 → harus berhasil

**XSS:**
- [ ] Coba buat post dengan konten `<script>alert('xss')</script>` → harus disimpan sebagai teks kosong atau teks tanpa tag
- [ ] Coba inject `<img src=x onerror=alert(1)>` → harus di-strip

**User Enumeration:**
- [ ] Akses `/api/users/6a32ca5fbd6aa0a1591b4888` → harus dapat 404
- [ ] Akses `/api/users/KiyoEditz` → harus berhasil
- [ ] Response profil publik tidak boleh mengandung `_id`, `passwordHash`, `email`

**Brute Force Login:**
- [ ] Coba login salah 9 kali berturut-turut dari IP yang sama dalam 1 hari → percobaan
      ke-9 harus dapat 429 dengan pesan "Coba lagi besok"
- [ ] Login yang berhasil tidak ikut menghabiskan kuota 8x percobaan
- [ ] `app.set('trust proxy', 1)` sudah dipasang agar `req.ip` mendeteksi IP asli, bukan IP Render

**Registrasi Massal:**
- [ ] Coba daftar akun ke-4 dari IP yang sama dalam waktu 1 jam → harus dapat 429
- [ ] Registrasi dari IP berbeda tidak saling memengaruhi kuota

**Verbose Error:**
- [ ] Trigger error 500 (misal matikan koneksi MongoDB sementara) → response tidak boleh
      mengandung `err.stack`, nama library, atau detail bcrypt
- [ ] Login dengan email tidak terdaftar vs password salah → pesan error harus identik
      ("Email atau password salah"), tidak boleh beda supaya tidak bisa dipakai menebak email terdaftar

**MongoDB Error Disclosure:**
- [ ] Registrasi dengan username yang sudah dipakai → pesan harus "Username sudah digunakan",
      bukan raw MongoDB duplicate key error
- [ ] Akses endpoint dengan ID format salah → pesan generik, bukan "CastError" atau nama field Mongoose

**Package.json Exposed:**
- [ ] `curl https://anomia.onrender.com/package.json` → harus 404, bukan isi file

---

## Urutan Implementasi yang Disarankan

```
Hari 1 (Kritis):
1. Ganti JWT_SECRET dengan yang baru dan kuat → deploy ke Render
2. Implementasi requireAuth.js yang baru
3. Implementasi socketAuth.js + integrasi ke initSocket
4. Pasang loginLimiter (8x/hari per IP) di route /login

Hari 2 (Tinggi):
5. Update konfigurasi CORS ke allowed origins spesifik + blokir preflight Authorization lintas origin
6. Pasang registerLimiter (3 akun/jam per IP) di route /register
7. Pasang app.set('trust proxy', 1) agar req.ip akurat di Render
8. Install dan konfigurasi helmet

Hari 3 (Sedang):
9. Install sanitize-html, buat utils/sanitize.js, terapkan di semua handler input user
10. Buat formatUserPublic dan formatPost, terapkan ke semua route
11. Pasang errorHandler global + handleMongoError, audit semua try-catch yang expose err.message
12. Blokir akses /package.json dan file sensitif lain

Hari 4:
13. Set NODE_ENV=production di Render environment variables
14. Jalankan semua checklist verifikasi
15. Monitor log Render selama 24 jam pertama setelah deploy
```

> ⚠️ Mengganti JWT_SECRET akan otomatis logout SEMUA user yang sedang login.
> Ini adalah efek samping yang diharapkan — semua token lama menjadi invalid.
> Lakukan di waktu traffic rendah dan beri tahu user jika perlu.
