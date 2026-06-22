# Bot Detection & Request Fingerprinting — Spesifikasi Implementasi

> Dokumen ini mencakup sistem deteksi bot dan request otomatis (script) berlapis
> untuk Anomia. Kombinasi tiga lapisan: Cloudflare Turnstile (captcha invisible),
> request fingerprinting (deteksi header/signature script), dan honeypot field.
> Tidak ada satu metode yang 100% sempurna — kekuatan ada di kombinasinya.

---

## 1. Gambaran Sistem Berlapis

```
Request masuk ke endpoint sensitif (login, register, buat post)
        │
        ▼
[Layer 1] Cloudflare Turnstile Token Verification
        │ Token tidak ada / tidak valid → 403
        │ (token digenerate di browser, tidak bisa dibuat oleh script biasa)
        ▼
[Layer 2] Request Fingerprint Check
        │ User-Agent menunjukkan curl/axios/python-requests/dll → 403
        │ Header browser wajib tidak ada / tidak konsisten → 403
        ▼
[Layer 3] Honeypot Field Check
        │ Field tersembunyi terisi → bot terdeteksi → 403 pura-pura sukses
        ▼
Request diteruskan ke handler asli (login, register, buat post, dll)
```

---

## 2. Layer 1 — Cloudflare Turnstile (Captcha Invisible)

### Mengapa Turnstile, bukan reCAPTCHA?

Karena kamu sudah pakai Cloudflare Pages, Turnstile adalah pilihan paling natural:
- **Gratis** tanpa batas request (berbeda dengan reCAPTCHA enterprise)
- **Invisible by default** — user tidak melihat kotak centang, tidak ada gangguan UX
- Turnstile menganalisis sinyal browser secara pasif (TLS fingerprint, JS environment,
  timing, dll) dan memutuskan apakah request berasal dari manusia nyata
- Terintegrasi langsung dengan infrastruktur Cloudflare yang sudah kamu pakai

### Setup Turnstile

1. Buka Cloudflare Dashboard → Turnstile → Add Site
2. Pilih tipe widget: **"Managed"** (Cloudflare putuskan sendiri kapan tampilkan
   challenge) atau **"Invisible"** (tidak pernah tampil, analisis di background)
3. Salin **Site Key** (untuk frontend) dan **Secret Key** (untuk backend)
4. Tambahkan ke environment variable:
   - Frontend: `VITE_TURNSTILE_SITE_KEY=...`
   - Backend (Render env vars): `TURNSTILE_SECRET_KEY=...`

### Integrasi Frontend (React)

```bash
npm install @marsidev/react-turnstile
```

```jsx
// web/src/components/TurnstileWidget.jsx
import { Turnstile } from '@marsidev/react-turnstile';

const TurnstileWidget = ({ onSuccess, onError }) => {
  return (
    <Turnstile
      siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
      onSuccess={onSuccess}        // callback dapat token string
      onError={onError}
      options={{
        theme: 'dark',             // sesuai dark mode Anomia
        size: 'invisible',         // tidak terlihat user
      }}
    />
  );
};

export default TurnstileWidget;
```

```jsx
// Penggunaan di form login / register / buat post
import { useState } from 'react';
import TurnstileWidget from '../components/TurnstileWidget';

const LoginPage = () => {
  const [turnstileToken, setTurnstileToken] = useState(null);

  const handleSubmit = async () => {
    if (!turnstileToken) {
      return; // Tunggu Turnstile selesai verifikasi
    }

    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        turnstileToken,  // Kirim token ke backend untuk diverifikasi
      })
    });
  };

  return (
    <>
      {/* Form fields ... */}
      <TurnstileWidget
        onSuccess={(token) => setTurnstileToken(token)}
        onError={() => setTurnstileToken(null)}
      />
      <button onClick={handleSubmit}>Login</button>
    </>
  );
};
```

### Verifikasi Token di Backend

```js
// src/utils/verifyTurnstile.js

const verifyTurnstileToken = async (token, clientIp) => {
  if (!token) return false;

  const formData = new FormData();
  formData.append('secret', process.env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  formData.append('remoteip', clientIp); // opsional tapi disarankan

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: formData }
  );

  const result = await response.json();
  return result.success === true;
};

module.exports = { verifyTurnstileToken };
```

```js
// src/middleware/turnstileCheck.js

const { verifyTurnstileToken } = require('../utils/verifyTurnstile');

const turnstileCheck = async (req, res, next) => {
  const token = req.body.turnstileToken;
  const clientIp = req.ip;

  const isHuman = await verifyTurnstileToken(token, clientIp);

  if (!isHuman) {
    return res.status(403).json({ message: 'Verifikasi gagal. Coba lagi.' });
  }

  next();
};

module.exports = turnstileCheck;
```

---

## 3. Layer 2 — Request Fingerprinting

Deteksi request yang datang dari script (curl, axios, python-requests, Postman, dll)
berdasarkan dua sinyal: User-Agent dan kelengkapan header browser.

### 3a. User-Agent Blocklist

```js
// src/utils/botSignatures.js

// Substring User-Agent yang identik dengan script/tool otomatis
const BOT_USER_AGENT_SIGNATURES = [
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'axios',
  'node-fetch',
  'node-http',
  'got/',
  'superagent',
  'postman',
  'insomnia',
  'httpie',
  'java/',
  'okhttp',
  'php/',
  'ruby',
  'go-http-client',
  'libcurl',
  'scrapy',
  'mechanize',
];

// User-Agent yang mengaku browser tapi polanya mencurigakan
const SUSPICIOUS_UA_PATTERNS = [
  /^mozilla\/5\.0$/i,              // Terlalu generik, tidak ada detail browser
  /bot|crawler|spider|scraper/i,   // Keyword bot umum
];

const isBotUserAgent = (userAgent) => {
  if (!userAgent) return true; // Tidak ada User-Agent = hampir pasti bot/script

  const ua = userAgent.toLowerCase();

  if (BOT_USER_AGENT_SIGNATURES.some(sig => ua.includes(sig))) return true;
  if (SUSPICIOUS_UA_PATTERNS.some(pattern => pattern.test(userAgent))) return true;

  return false;
};

module.exports = { isBotUserAgent };
```

### 3b. Browser Header Fingerprint

Browser asli selalu mengirim header tertentu yang script biasa tidak kirimkan.
Ini jauh lebih sulit dipalsukan daripada User-Agent karena butuh pengetahuan spesifik:

```js
// src/utils/headerFingerprint.js

// Header yang SELALU ada di request dari browser modern (Chrome/Firefox/Safari)
const REQUIRED_BROWSER_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
];

// Header sec-fetch-* hanya dikirim oleh browser modern dalam request yang
// dipicu oleh user (fetch/XHR dari frontend). Script tidak mengirim ini secara default.
const SEC_FETCH_HEADERS = [
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
];

const analyzeHeaderFingerprint = (headers) => {
  const issues = [];

  // Cek header wajib browser
  const missingRequired = REQUIRED_BROWSER_HEADERS.filter(h => !headers[h]);
  if (missingRequired.length > 0) {
    issues.push(`missing_headers: ${missingRequired.join(', ')}`);
  }

  // Cek konsistensi Accept header
  // Browser asli selalu punya Accept yang spesifik, bukan */*
  const accept = headers['accept'] || '';
  if (accept === '*/*' || accept === '') {
    issues.push('generic_accept');
  }

  // Cek Accept-Language — browser selalu punya, script sering tidak
  if (!headers['accept-language']) {
    issues.push('missing_accept_language');
  }

  // Cek sec-fetch headers — kalau semua tidak ada, besar kemungkinan script
  const hasSomSecFetch = SEC_FETCH_HEADERS.some(h => headers[h]);
  if (!hasSomSecFetch) {
    issues.push('missing_sec_fetch');
  }

  return {
    isLikelyBot: issues.length >= 2, // threshold: 2+ masalah = bot
    issues,
  };
};

module.exports = { analyzeHeaderFingerprint };
```

### 3c. Middleware Gabungan Fingerprint

```js
// src/middleware/requestFingerprint.js

const { isBotUserAgent } = require('../utils/botSignatures');
const { analyzeHeaderFingerprint } = require('../utils/headerFingerprint');

const requestFingerprint = (options = {}) => {
  const {
    blockBots = true,     // Blokir langsung jika terdeteksi bot
    logOnly = false,      // Mode audit: hanya log, tidak blokir (untuk masa transisi)
  } = options;

  return (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const fingerprint = analyzeHeaderFingerprint(req.headers);
    const botUA = isBotUserAgent(userAgent);

    const isSuspicious = botUA || fingerprint.isLikelyBot;

    if (isSuspicious) {
      // Log selalu — berguna untuk audit
      console.warn('[BotDetect]', {
        ip: req.ip,
        path: req.path,
        userAgent,
        issues: fingerprint.issues,
        botUA,
        time: new Date().toISOString(),
      });

      if (!logOnly && blockBots) {
        // Jangan bocorkan alasan spesifik — respons generik
        return res.status(403).json({ message: 'Akses ditolak.' });
      }
    }

    next();
  };
};

module.exports = requestFingerprint;
```

---

## 4. Layer 3 — Honeypot Field

Honeypot adalah field input tersembunyi yang tidak terlihat oleh user tapi akan
diisi oleh bot yang otomatis mengisi semua field form. Simpel, tidak butuh library,
dan sangat efektif untuk bot sederhana.

### Frontend — Tambahkan Field Tersembunyi ke Semua Form

```jsx
// Tambahkan ke SEMUA form: login, register, buat post

const [honeypot, setHoneypot] = useState('');

{/* Field ini disembunyikan via CSS — user tidak melihat, bot mengisinya */}
<input
  type="text"
  name="website"            // Nama yang terdengar "normal" agar bot ikut mengisi
  value={honeypot}
  onChange={(e) => setHoneypot(e.target.value)}
  tabIndex={-1}             // Tidak bisa di-tab oleh keyboard user asli
  autoComplete="off"
  style={{
    position: 'absolute',
    left: '-9999px',        // Di luar layar, tidak terlihat
    width: '1px',
    height: '1px',
    opacity: 0,
  }}
/>
```

```jsx
// Kirim honeypot value ke backend
body: JSON.stringify({
  email,
  password,
  turnstileToken,
  _hp: honeypot,    // Nama field honeypot di payload
})
```

### Backend — Cek Honeypot

```js
// src/middleware/honeypotCheck.js

const honeypotCheck = (req, res, next) => {
  const honeypotValue = req.body._hp;

  // Field honeypot harus SELALU kosong
  // Kalau terisi, hampir pasti bot yang mengisi semua field otomatis
  if (honeypotValue && honeypotValue.trim().length > 0) {
    console.warn('[Honeypot] Bot terdeteksi:', {
      ip: req.ip,
      path: req.path,
      time: new Date().toISOString(),
    });

    // PENTING: Jangan beri error nyata — pura-pura sukses agar bot tidak tahu terdeteksi
    // Bot yang tahu terdeteksi akan mencoba teknik lain
    // Dengan pura-pura sukses, bot mengira berhasil dan tidak mencoba bypass
    return res.status(200).json({ message: 'Berhasil.' }); // Respons palsu
  }

  next();
};

module.exports = honeypotCheck;
```

---

## 5. Integrasi ke Routes

```js
// src/routes/authRoutes.js

const turnstileCheck = require('../middleware/turnstileCheck');
const requestFingerprint = require('../middleware/requestFingerprint');
const honeypotCheck = require('../middleware/honeypotCheck');

// Login
router.post('/login',
  requestFingerprint({ blockBots: true }),  // Layer 2 — fingerprint
  honeypotCheck,                            // Layer 3 — honeypot
  loginLimiter,                             // Rate limit (dari Security Hardening)
  turnstileCheck,                           // Layer 1 — Turnstile (terakhir karena butuh async)
  loginHandler
);

// Register
router.post('/register',
  requestFingerprint({ blockBots: true }),
  honeypotCheck,
  registerLimiter,
  turnstileCheck,
  registerHandler
);

// Buat Post
router.post('/posts',
  requireAuth,
  requestFingerprint({ blockBots: true }),
  honeypotCheck,
  postCooldown,
  dailyPostLimit,
  contentDedup,
  linkBlocklistCheck,
  turnstileCheck,        // Opsional untuk buat post — pertimbangkan UX
  createPostHandler
);
```

> **Catatan untuk buat post:** menambahkan Turnstile ke setiap post bisa terasa
> mengganggu karena dijalankan berkali-kali dalam satu sesi. Pertimbangkan hanya
> pakai fingerprint + honeypot untuk buat post, dan simpan Turnstile hanya untuk
> login dan register.

---

## 6. Mode Audit (Sebelum Aktif Blokir)

Untuk deployment awal, sangat disarankan jalankan fingerprint dalam mode `logOnly`
selama 2–3 hari untuk lihat berapa banyak request legitimate yang mungkin salah
terdeteksi sebagai bot (false positive) sebelum aktif diblokir:

```js
// Sementara — audit dulu tanpa blokir
router.post('/login',
  requestFingerprint({ blockBots: false, logOnly: true }),
  // ...
);
```

Monitor log Render dan lihat apakah ada user asli yang muncul di `[BotDetect]`.
Kalau ada, sesuaikan threshold di `analyzeHeaderFingerprint` sebelum aktifkan
`blockBots: true`.

---

## 7. Keterbatasan yang Perlu Diketahui

Tidak ada sistem bot detection yang 100% sempurna. Ini yang bisa dan tidak bisa
dicegah oleh sistem ini:

| Jenis Bot/Penyerang | Bisa Dicegah? |
|---|---|
| curl / wget / python-requests standar | ✅ Ya — User-Agent terdeteksi |
| axios / node-fetch tanpa modifikasi | ✅ Ya — header tidak lengkap |
| Postman tanpa custom header | ✅ Ya — User-Agent terdeteksi |
| Bot sederhana yang isi form otomatis | ✅ Ya — honeypot terisi |
| Penyerang yang spoof User-Agent | ⚠️ Sebagian — header fingerprint masih cek sisanya |
| Headless browser (Puppeteer, Playwright) | ⚠️ Sulit — terlihat seperti browser asli |
| Penyerang yang salin semua header browser | ❌ Tidak bisa terdeteksi oleh fingerprint |
| Bot yang solve Turnstile (jasa manusia) | ❌ Tidak — ini dibayar manusia asli |

Kenyataannya: sebagian besar spammer dan bot yang menyerang website skala Anomia
**tidak** sampai level headless browser atau spoof header — terlalu mahal effort-nya.
Sistem berlapis ini cukup untuk menghentikan 95%+ serangan umum.

---

## 8. Implementation Checklist

**Cloudflare Turnstile:**
- [ ] Daftar site di Cloudflare Dashboard → Turnstile
- [ ] Simpan `VITE_TURNSTILE_SITE_KEY` di frontend env dan `TURNSTILE_SECRET_KEY` di Render env vars
- [ ] Install `@marsidev/react-turnstile` di frontend
- [ ] Tambahkan `TurnstileWidget` ke form login dan register
- [ ] Buat `verifyTurnstile.js` dan middleware `turnstileCheck.js` di backend

**Request Fingerprinting:**
- [ ] Buat `utils/botSignatures.js` (User-Agent blocklist)
- [ ] Buat `utils/headerFingerprint.js` (header consistency check)
- [ ] Buat middleware `requestFingerprint.js` (mode logOnly dulu 2-3 hari)
- [ ] Pantau log `[BotDetect]` — cek false positive
- [ ] Aktifkan `blockBots: true` setelah yakin tidak ada false positive signifikan

**Honeypot:**
- [ ] Tambahkan field honeypot tersembunyi ke semua form (login, register, buat post)
- [ ] Buat middleware `honeypotCheck.js`
- [ ] Pastikan response honeypot yang terisi selalu pura-pura sukses (bukan error)

**Integrasi:**
- [ ] Pasang semua middleware ke route login dan register
- [ ] Pastikan `app.set('trust proxy', 1)` sudah ada (untuk `req.ip` yang akurat)
- [ ] Test dari curl → harus diblokir
- [ ] Test dari browser normal → harus tetap bisa login/register
- [ ] Test honeypot: isi field `_hp` secara manual → harus dapat respons sukses palsu
