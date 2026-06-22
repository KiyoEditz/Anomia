# Anomia 🚀
Social media REST API & Web client. Dirancang dengan arsitektur Node.js/Express/MongoDB Atlas di backend, real-time communication via Socket.io, dan React + Vite + Vanilla CSS di frontend.

Proyek ini telah diperkuat dengan berbagai subsistem modern seperti sistem Role & Moderasi manual, Pembatasan Posting (Anti-Spam), Filter Tautan Terlarang (Link Blocklist), Pipeline Moderasi Media Otomatis, Sistem Notifikasi Real-time, Algoritma Rekomendasi Feed, dan berbagai langkah Pengerasan Keamanan (Security Hardening).

---

## 📌 Daftar Isi
1. [Fitur Unggulan](#-fitur-unggulan)
2. [Struktur Repositori](#-struktur-repositori)
3. [Panduan Instalasi & Setup](#-panduan-instalasi--setup)
4. [Konfigurasi Environment Variables (.env)](#-konfigurasi-environment-variables-env)
5. [Daftar Lengkap Endpoint API](#-daftar-lengkap-endpoint-api)
6. [Skema Database & MongoDB Index](#-skema-database--mongodb-index)
7. [Teknologi yang Digunakan](#-teknologi-yang-digunakan)

---

## ✨ Fitur Unggulan

### 1. 🛡️ Sistem Role & Moderasi Manual
Mendukung klasifikasi peran pengguna untuk menjaga kenyamanan komunitas:
*   **Developer (`dev`)**: Akses penuh ke seluruh panel manajemen, konfigurasi tautan diblokir, penetapan peran moderator, penangguhan akun (suspension), serta aksi moderasi.
*   **Moderator (`mod`)**: Dapat menghapus postingan atau komentar yang melanggar ketentuan komunitas secara langsung.
*   **User**: Peran default bagi pengguna baru.
*   **Fitur Tambahan**: Aksi moderasi mencatat log secara append-only di collection `moderation_logs` untuk audit transparansi. Badge peran (`dev` / `mod`) ditampilkan secara visual di UI menggunakan komponen `BadgeRole`.

### 2. 📊 Algoritma Feed "Untuk Kamu" & "Terbaru"
Feed beranda memiliki dua mode:
*   **Untuk Kamu (Rekomendasi Berbasis Skor)**: Postingan diurutkan menggunakan formula *weighted scoring*:
    $$\text{Skor} = (\text{Engagement} \times W_{eng}) + (\text{Recency} \times W_{rec}) + (\text{Afinitas} \times W_{aff})$$
    *   *Engagement*: Likes (bobot 1) + Komentar (bobot 2) + Reposts (bobot 3).
    *   *Recency (Peluruhan Waktu)*: Meluruh logaritmik $\frac{1}{(\text{umur\_post\_jam} + 2)^{1.5}}$ agar konten baru tetap kompetitif.
    *   *Afinitas (Personalisasi)*: Tambahan skor jika user mem-follow author (+5), author mem-follow user (+3), atau pernah berinteraksi dalam 7 hari terakhir (+2).
    *   *Cold Start*: User baru tanpa following mendapat boost bobot engagement (1.5) agar feed tetap ramai.
    *   *Diversity Guard*: Mencegah satu akun mendominasi feed (maksimal 2 postingan beruntun dari author yang sama).
    *   *Caching*: In-memory cache per user dengan TTL 5 menit untuk efisiensi performa database.
*   **Terbaru (Kronologis)**: Menampilkan postingan terbaru dari akun yang diikuti + diri sendiri. Dilengkapi polling banner *"X postingan baru"* real-time tanpa mengganggu scroll position.

### 3. 🛑 Post Limitation & Anti-Spam (Defense-in-Depth)
Mencegah serangan bot dan scripted posting sebelum request menyentuh database melalui 6 lapisan perlindungan:
1.  **IP Rate Limiter**: Membatasi request global (max 200/15 menit) dan request posting (max 10/menit per IP).
2.  **Auth Verification**: Validasi JWT token.
3.  **Cooldown Antar Post**: Pengguna wajib menunggu minimal 30 detik sebelum bisa membuat postingan berikutnya.
4.  **Daily Post Limit**: Batasan harian posting (postingan ke-30 memicu notifikasi peringatan, postingan ke-50 memicu blokir posting harian).
5.  **Deduplication**: Mencegah spam konten yang identik/mirip dalam waktu 24 jam menggunakan enkripsi SHA-256 hash.
6.  **Bot Behavior Detection**: Akun otomatis ditangguhkan (suspend) sementara selama 60 menit jika terdeteksi melakukan posting sangat cepat secara beruntun (*rapid post streak*).

### 4. 🔗 Filter Tautan Terlarang (Link Blocklist)
Mencegah penyebaran link promosi atau phishing secara dinamis:
*   Aturan disimpan di database (`blocked_links`) sehingga dapat diperbarui secara instan lewat API (atau shell MongoDB) tanpa perlu deploy ulang kode.
*   Mendukung dua tipe pencocokan:
    *   `exact`: substring match (misalnya `spam-site.net`).
    *   `pattern`: wildcard matching dengan tanda `*` di akhir untuk memblokir tautan dengan kode pelacakan dinamis (misalnya `promo-spam.com/click*`).
*   Menggunakan fungsi normalisasi teks untuk mendeteksi penyamaran tautan (seperti `contoh [.] com`, `contoh(dot)com`, zero-width characters).
*   Dilengkapi in-memory caching (TTL 2 menit) untuk mencegah overhead database.

### 5. 📸 Pipeline Moderasi Media Otomatis
Penyaringan media (gambar/video) sensitif atau berbahaya menggunakan dua lapis verifikasi:
*   **Quick Scan (Synchronous)**: Berjalan sebelum media dipublikasikan.
    *   *Gambar*: Dipindai langsung via AWS Rekognition `DetectModerationLabels` (atau simulasi jika kredensial kosong).
    *   *Video*: Mengekstrak frame sample pada awal, tengah, dan akhir durasi (menggunakan `ffmpeg`), lalu memindai tiap frame.
    *   *Fail-closed*: Jika API moderasi mengalami timeout atau down, postingan default ditolak.
*   **Thorough Scan (Asynchronous)**: Berjalan di background setelah postingan dipublikasikan menggunakan Cloudinary moderation add-on atau AWS Rekognition Video. Hasil dikirim via callback ke webhook `/api/webhooks/moderation`.
*   **Aksi Pelanggaran**: Media dihapus dari Cloudinary, status postingan diubah menjadi `removed` (menampilkan placeholder transparan), strike ditambahkan ke akun pengguna (3 strike memicu pemblokiran akun/auto-suspend), dan pengguna mendapatkan notifikasi pelanggaran.

### 6. 💬 Sistem Notifikasi Real-time
Notifikasi sosial yang interaktif dan instan:
*   **Tipe Notifikasi**: Menyertakan `mention`, `comment`, `comment_reply`, `comment_like`, `post_like`, `moderation_removed`, `moderation_warning`, `moderation_suspended`, `system`, dan `admin` (broadcast/personal).
*   **Real-time Delivery**: Didistribusikan instan tanpa refresh halaman menggunakan **Socket.io** dengan pembagian room per user ID.
*   **Broadcast tracking**: Menggunakan collection `broadcast_reads` untuk mencatat siapa saja yang telah membaca notifikasi pengumuman global sistem.

### 7. 🔒 Pengerasan Keamanan (Security Hardening)
Perbaikan celah keamanan kritis secara menyeluruh:
*   **Socket.io Authentication**: Middleware Socket.io memverifikasi token JWT saat jabat tangan (handshake) dan mengambil data peran (role) terbaru langsung dari database (bukan mempercayai client).
*   **JWT Strict Verification**: Penegakan algoritma tunggal (`HS256`), pencocokan issuer (`anomia`), dan pengecekan keberadaan pengguna di database.
*   **CORS Hardening**: Membatasi domain asal (allowed origins) dan memblokir Authorization header pada preflight OPTIONS request untuk mencegah cross-origin token theft.
*   **Auth Rate Limiter**: Login dibatasi maksimal 8 kali gagal per IP per hari (mencegah brute force), registrasi dibatasi maksimal 3 akun per IP per jam (mencegah mass registration).
*   **Stored XSS Prevention**: Seluruh konten input dibersihkan dari tag HTML menggunakan library `sanitize-html` sebelum masuk database.
*   **Penyembunyian MongoDB ObjectID**: Menggunakan helper formatting untuk menyembunyikan string ObjectID mentah dari response API publik (menggunakan username atau representasi string terenkripsi).
*   **Safe Error Handling**: Error verbose di-log secara lokal di server console. Client hanya menerima pesan error generik terstandardisasi untuk mencegah pengintaian (reconnaissance) teknologi stack.
*   **File Filtering**: Memblokir akses langsung ke berkas sensitif proyek seperti `/package.json`, `/package-lock.json`, `/.env`, dan `/.git`.

---

## 📂 Struktur Repositori

```
Anomia/
├── documentation/             # Berkas spesifikasi teknis dan desain sistem
├── src/                       # Backend (Node.js, Express, Socket.io, MongoDB)
│   ├── config/                # Konfigurasi database, CORS, dan limitasi
│   ├── controllers/           # Logika bisnis endpoint API
│   ├── middleware/            # Auth, rate limiter, sanitasi, dan validasi
│   ├── models/                # Schema Mongoose (MongoDB)
│   ├── routes/                # Pemetaan endpoint HTTP
│   ├── services/              # Layanan logika (feed, blocklist, post limits)
│   ├── utils/                 # Utilities (Socket.io, date, sanitasi, moderasi)
│   └── server.js              # Entry point backend
└── web/                       # Frontend (React + Vite + Vanilla CSS)
    ├── src/
    │   ├── components/        # Reusable UI (PostCard, Composer, BadgeRole)
    │   ├── pages/             # Pages (Explore, Feed, Admin, Notifications)
    │   ├── App.jsx            # Router dan struktur aplikasi utama
    │   ├── api.js             # Konfigurasi Axios Client
    │   ├── auth.jsx           # Auth Context & Provider
    │   └── styles.css         # Styling global aplikasi
    └── index.html             # HTML Shell
```

---

## ⚙️ Panduan Instalasi & Setup

### Prasyarat
*   Node.js versi LTS (v18+)
*   MongoDB Atlas Account
*   Cloudinary Account
*   AWS Account (Opsional - untuk moderasi media riil)
*   `ffmpeg` terinstall pada sistem OS (jika ingin melakukan ekstraksi video frame lokal)

### 1. Setup Backend
1.  Masuk ke direktori root proyek:
    ```bash
    npm install
    ```
2.  Salin file konfigurasi environment variable:
    ```bash
    cp .env.example .env
    ```
3.  Isi variabel di dalam `.env` (lihat panduan [Environment Variables](#-konfigurasi-environment-variables-env)).
4.  Jalankan server dalam mode development:
    ```bash
    npm run dev
    ```
    Backend akan berjalan pada `http://localhost:3000`.

### 2. Setup Frontend
1.  Masuk ke direktori frontend `web`:
    ```bash
    cd web
    npm install
    ```
2.  Jalankan Vite development server:
    ```bash
    npm run dev
    ```
    Aplikasi web dapat diakses pada `http://localhost:5173`.
    *Catatan: Dev server Vite sudah dikonfigurasi untuk mem-proxy request `/api/*` langsung ke `http://localhost:3000` (silakan lihat berkas `web/vite.config.js`).*

---

## 🔑 Konfigurasi Environment Variables (.env)

Buat file `.env` di root direktori proyek dengan variabel-variabel berikut:

| Variabel | Deskripsi | Contoh / Default |
| :--- | :--- | :--- |
| `PORT` | Port server backend | `3000` |
| `MONGODB_URI` | Connection string cluster MongoDB Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/anomia` |
| `JWT_SECRET` | Kunci enkripsi token JWT (Disarankan 64-character hex) | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Durasi kedaluwarsa token JWT | `7d` |
| `CLOUDINARY_CLOUD_NAME` | Cloud Name dari dashboard Cloudinary | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | API Key dari dashboard Cloudinary | `your-api-key` |
| `CLOUDINARY_API_SECRET`| API Secret dari dashboard Cloudinary | `your-api-secret` |
| `MODERATION_WEBHOOK_URL`| URL callback webhook moderasi Cloudinary | `https://yourdomain.com/api/webhooks/moderation` |
| `AWS_ACCESS_KEY_ID` | Access Key AWS (Opsional) | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY`| Secret Key AWS (Opsional) | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | Wilayah regional AWS (Opsional) | `us-east-1` |

*Jika kredensial AWS dikosongkan, backend otomatis beralih ke **Simulation Mode** (moderasi simulasi via keyword "nsfw", "violence", dan "test-flagged" pada konten deskripsi).*

---

## 🛣️ Daftar Lengkap Endpoint API

### 🔐 Otentikasi (`/api/auth`)
*   `POST /api/auth/register` — Registrasi pengguna baru. (Rate limit: max 3/jam per IP)
*   `POST /api/auth/login` — Login pengguna. (Rate limit: max 8 salah/hari per IP)
*   `GET  /api/auth/me` — Mengambil data profil pengguna yang sedang login. (Auth)

### 👤 Pengguna (`/api/users`)
*   `GET    /api/users/:username` — Mengambil profil publik pengguna berdasarkan username.
*   `PATCH  /api/users/me` — Memperbarui profil sendiri (displayName, bio). (Auth)
*   `POST   /api/users/me/avatar` — Upload foto profil avatar. (Auth, Multipart `file`)
*   `POST   /api/users/me/banner` — Upload foto banner halaman profil. (Auth, Multipart `file`)
*   `GET    /api/users/search` — Mencari pengguna berdasarkan substring username/displayName.
*   `POST   /api/users/:username/follow` — Mengikuti pengguna. (Auth)
*   `DELETE /api/users/:username/follow` — Batal mengikuti pengguna. (Auth)
*   `GET    /api/users/moderators` — Menampilkan daftar mod & dev. (Auth, Dev Only)
*   `GET    /api/users/moderation-logs` — Menampilkan log histori moderasi. (Auth, Mod/Dev Only)
*   `PATCH  /api/users/:userId/role` — Mengubah peran pengguna (hanya bisa mod/user). (Auth, Dev Only)
*   `PATCH  /api/users/:userId/suspend` — Menangguhkan atau membuka blokir akun pengguna. (Auth, Dev Only)

### 📝 Postingan (`/api/posts`)
*   `POST   /api/posts` — Membuat postingan baru. (Auth, Cooldown, Daily limits, Dedup, Blocklist Check. Multipart: `content`, `tags`, `file` opsional)
*   `GET    /api/posts` — Mengambil seluruh postingan publik (Mendukung filter tag AND/NOT dan query penelusuran).
*   `GET    /api/posts/feed` — (Legacy) Feed postingan kronologis dari following. (Auth)
*   `GET    /api/posts/bookmarks` — Mengambil daftar postingan yang disimpan (bookmarks). (Auth)
*   `GET    /api/posts/user/:username` — Mengambil semua postingan milik user tertentu.
*   `GET    /api/posts/:id` — Detail postingan.
*   `POST   /api/posts/:id/like` — Menyukai postingan. (Auth)
*   `DELETE /api/posts/:id/like` — Batal menyukai postingan. (Auth)
*   `POST   /api/posts/:id/bookmark` — Menyimpan postingan ke bookmark. (Auth)
*   `DELETE /api/posts/:id/bookmark` — Hapus postingan dari bookmark. (Auth)
*   `POST   /api/posts/:id/repost` — Melakukan repost postingan. (Auth)
*   `DELETE /api/posts/:id/repost` — Batal repost postingan. (Auth)
*   `POST   /api/posts/:id/quote` — Quote postingan (repost dengan tambahan teks). (Auth)
*   `DELETE /api/posts/:id` — Menghapus postingan sendiri. (Auth)
*   `DELETE /api/posts/:id/moderate` — Menghapus postingan orang lain secara paksa dengan menyertakan alasan. (Auth, Mod/Dev Only)

### 💬 Komentar (`/api/posts/:id/comments` & `/api/comments`)
*   `GET    /api/posts/:id/comments` — Mengambil seluruh komentar di postingan.
*   `POST   /api/posts/:id/comments` — Mengomentari postingan. (Auth)
*   `DELETE /api/posts/:id/comments/:commentId` — Menghapus komentar sendiri. (Auth)
*   `POST   /api/posts/:id/comments/:commentId/like` — Menyukai komentar. (Auth)
*   `DELETE /api/posts/:id/comments/:commentId/like` — Batal menyukai komentar. (Auth)
*   `GET    /api/comments/user/:username` — Daftar komentar yang ditulis oleh user tertentu.
*   `DELETE /api/comments/:commentId/moderate` — Menghapus komentar secara paksa oleh moderator. (Auth, Mod/Dev Only)

### 🏷️ Tag & Kategori (`/api/tags`)
*   `GET  /api/tags` — Autocomplete pencarian tag berdasarkan query pencarian dan kategori.
*   `GET  /api/tags/categories` — Menampilkan seluruh kategori tag yang valid.
*   `GET  /api/tags/popular` — Menampilkan tag terpopuler berdasarkan frekuensi penggunaan.
*   `GET  /api/tags/:slug` — Mengambil detail tag dan postingan yang menggunakannya.
*   `POST /api/tags` — Membuat tag baru. (Auth)

### 🔔 Notifikasi (`/api/notifications`)
*   `GET    /api/notifications` — Mengambil daftar notifikasi pengguna. (Auth)
*   `GET    /api/notifications/unread-count` — Mengambil jumlah notifikasi belum dibaca. (Auth)
*   `PATCH  /api/notifications/read-all` — Menandai semua notifikasi sebagai telah dibaca. (Auth)
*   `PATCH  /api/notifications/:id/read` — Menandai satu notifikasi sebagai telah dibaca. (Auth)
*   `DELETE /api/notifications/:id` — Menghapus notifikasi. (Auth)
*   `POST   /api/notifications/admin` — Mengirim notifikasi broadcast global atau personal. (Auth, Admin/Dev Only)

### 📊 Beranda Feed Rekomendasi (`/api/feed`)
*   `GET  /api/feed/for-you` — Feed rekomendasi personal "Untuk Kamu" berbasis skor. (Auth)
*   `GET  /api/feed/recent` — Feed terbaru dari akun-akun yang diikuti. (Auth)
*   `GET  /api/feed/recent/check-new` — Mengecek jumlah post baru sejak timestamp tertentu (polling banner). (Auth)

### 🔗 Administrasi Blocklist (`/api/admin/blocked-links`)
*   `GET    /api/admin/blocked-links` — Melihat daftar seluruh link terblokir. (Auth, Mod/Dev Only)
*   `POST   /api/admin/blocked-links` — Menambahkan domain/pattern diblokir baru. (Auth, Mod/Dev Only)
*   `DELETE /api/admin/blocked-links/:id` — Menghapus domain/pattern dari daftar blokir. (Auth, Mod/Dev Only)

### ⚓ Webhooks (`/api/webhooks`)
*   `POST /api/webhooks/moderation` — Webhook callback Cloudinary untuk menerima hasil verifikasi media (Thorough Scan).

---

## 🗃️ Skema Database & MongoDB Index

Demi performa kueri yang optimal pada MongoDB, index berikut telah dipasang pada model data:

```javascript
// Model Post
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ userId: 1, contentHash: 1 });

// Model PostLimit
postLimitSchema.index({ userId: 1, date: 1 }, { unique: true });
postLimitSchema.index({ date: 1 }, { expireAfterSeconds: 604800 }); // TTL Auto-delete 7 hari

// Model BlockedLink
blockedLinkSchema.index({ pattern: 1 }, { unique: true });

// Model Notification
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
```

---

## 🛠️ Teknologi yang Digunakan

### 🖥️ Backend (Server-Side)
*   **Runtime Environment**: Node.js
*   **Framework**: Express.js
*   **Real-time Protocol**: Socket.io
*   **Database ORM**: Mongoose (MongoDB Atlas)
*   **Media Hosting & Moderasi**: Cloudinary SDK
*   **AI Media Moderation**: `@aws-sdk/client-rekognition` (AWS SDK v3)
*   **Video Processing Utility**: `ffmpeg` (Frame Extraction)
*   **Kriptografi & Token**: `bcrypt` (Password Hashing), `jsonwebtoken` (JWT)
*   **Pengamanan & Pembatasan**: `helmet` (Security headers), `express-rate-limit` (API Rate Limiter), `sanitize-html` (XSS Sanitizer)

### 🎨 Frontend (Client-Side)
*   **Library**: React (v18)
*   **Build Tool**: Vite
*   **Routing**: React Router DOM (v6)
*   **API Client**: Axios (dengan interceptors untuk otomatis menyematkan header JWT)
*   **Real-time Communication**: Socket.io-client
*   **Styling**: Vanilla CSS (CSS Variables)

---

## 📘 Dokumentasi Tambahan

Untuk detail spesifikasi arsitektur yang mendalam, silakan baca dokumentasi teknis yang terletak di folder [documentation](file:///d:/Anomia/documentation):
*   [ROLE_SYSTEM_README.md](file:///d:/Anomia/documentation/ROLE_SYSTEM_README.md) - Detail arsitektur sistem peran (roles) dan penangguhan pengguna.
*   [POST_LIMITATION_README.md](file:///d:/Anomia/documentation/POST_LIMITATION_README.md) - Alur pembatasan spam postingan (daily limit & cooldown).
*   [LINK_BLOCKLIST_README.md](file:///d:/Anomia/documentation/LINK_BLOCKLIST_README.md) - Logika pemblokiran link spam dinamis.
*   [MODERATION_PIPELINE_README.md](file:///d:/Anomia/documentation/MODERATION_PIPELINE_README.md) - Cara kerja quick scan & thorough scan moderasi media.
*   [NOTIFICATION_SYSTEM_README.md](file:///d:/Anomia/documentation/NOTIFICATION_SYSTEM_README.md) - Spesifikasi model notifikasi dan pengiriman real-time Socket.io.
*   [FEED_ALGORITHM_README.md](file:///d:/Anomia/documentation/FEED_ALGORITHM_README.md) - Formula skor feed "Untuk Kamu", cold-start, dan diversity guard.
*   [SECURITY_HARDENING_README.md](file:///d:/Anomia/documentation/SECURITY_HARDENING_README.md) - Panduan perbaikan celah keamanan dan pengerasan sistem.
*   [UI_REDESIGN_README.md](file:///d:/Anomia/documentation/UI_REDESIGN_README.md) - Panduan perancangan antarmuka visual baru.
