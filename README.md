# Anomia

Social media REST API + web client. Backend Node.js/Express/MongoDB Atlas dengan autentikasi bcrypt + JWT, frontend React + Vite. Mendukung post, follow, like, komentar, dan sistem tag berkategori dengan filter multi-tag (AND/NOT) dan halaman jelajah.

## Struktur Repo

```
src/        backend (Express API)
web/        frontend (React + Vite)
```

## Setup

### 1. Backend

```
npm install
cp .env.example .env       # lalu isi MONGODB_URI & JWT_SECRET
npm run dev                # nodemon → http://localhost:3000
```

Variabel `.env`:
- `PORT` — default `3000`
- `MONGODB_URI` — connection string MongoDB Atlas (Cluster → Connect → Drivers)
- `JWT_SECRET` — string acak panjang (mis. `openssl rand -hex 32`)
- `JWT_EXPIRES_IN` — masa berlaku token, default `7d`
- `CLOUDINARY_CLOUD_NAME` — dari dashboard Cloudinary (Settings → Account)
- `CLOUDINARY_API_KEY` — dari dashboard Cloudinary
- `CLOUDINARY_API_SECRET` — dari dashboard Cloudinary

### 2. Frontend

```
cd web
npm install
npm run dev                # vite → http://localhost:5173
```

Dev server Vite sudah meneruskan `/api/*` ke `http://localhost:3000` (lihat `web/vite.config.js`). Tidak perlu file `.env` terpisah untuk frontend.

## Mendapatkan MongoDB Atlas URI

1. Buat akun di https://www.mongodb.com/atlas, buat cluster gratis (M0).
2. Database Access → tambahkan user (username + password).
3. Network Access → Add IP → `0.0.0.0/0` (atau IP Anda).
4. Cluster → Connect → Drivers → copy URI, ganti `<username>` & `<password>`.

## Endpoint API

### Auth
- `POST /api/auth/register` — body: `{ username, password, displayName? }`
- `POST /api/auth/login` — body: `{ username, password }`
- `GET  /api/auth/me` — header: `Authorization: Bearer <token>`

### Users
- `GET    /api/users/:username`
- `PATCH  /api/users/me` (auth) — body: `{ displayName?, bio? }`
- `POST   /api/users/me/avatar` (auth) — multipart `file` (image, max 20MB)
- `POST   /api/users/me/banner` (auth) — multipart `file` (image, max 20MB)
- `POST   /api/users/:username/follow` (auth)
- `DELETE /api/users/:username/follow` (auth)

### Posts
- `POST   /api/posts` (auth) — JSON body `{ content, tags?: [{ name, category }] }`, atau multipart `content`, `tags` (JSON-string), `file` (image/video, max 20MB)
- `GET    /api/posts` — list semua post, dukung filter tag (lihat di bawah)
- `GET    /api/posts/feed` (auth) — post dari diri sendiri + yang di-follow, dukung filter tag
- `GET    /api/posts/user/:username`
- `GET    /api/posts/:id`
- `POST   /api/posts/:id/like` (auth)
- `DELETE /api/posts/:id/like` (auth)
- `DELETE /api/posts/:id` (auth, hanya pemilik)

### Comments
- `GET    /api/posts/:id/comments`
- `POST   /api/posts/:id/comments` (auth) — body: `{ content }`
- `DELETE /api/posts/:id/comments/:commentId` (auth, hanya pemilik)

### Tags
- `GET  /api/tags?category=&search=` — autocomplete tag (limit 20)
- `GET  /api/tags/categories` — daftar kategori valid
- `GET  /api/tags/popular` — top tag berdasarkan `usageCount`
- `GET  /api/tags/:slug?page=&sort=popular|recent` — detail tag + post yang memakainya
- `POST /api/tags` (auth) — body: `{ name, category }`

## Sistem Tag

Tag dikelompokkan ke beberapa kategori: `genre`, `character`, `artist`, `group`, `language`, `format`.

Filter post via query string:
- `?tags=a,b,c` — post wajib punya SEMUA tag tersebut (AND)
- `?exclude=d,e` — post wajib TIDAK punya tag tersebut
- `?q=tag:"romance" -tag:"horror"` — syntax pencarian; bisa dicampur dengan `tags`/`exclude`
- `?page=N` — pagination (limit 20 per halaman)

Berlaku pada `GET /api/posts` dan `GET /api/posts/feed`. Detail lengkap di `tags_system.md`.

## Cloudinary

Image & video di-upload via backend (Express + multer in-memory) ke Cloudinary, lalu URL hasil disimpan di MongoDB. Folder: `anomia/avatars`, `anomia/banners`, `anomia/posts`. Asset lama otomatis dihapus saat user mengganti avatar/banner atau menghapus post.

1. Daftar gratis di https://cloudinary.com.
2. Dashboard → Account Details → copy `Cloud Name`, `API Key`, `API Secret` ke `.env`.
3. Batas upload default backend: 20MB per file.

## Struktur Backend

```
src/
  config/db.js              koneksi MongoDB
  models/                   User, Post, Comment, Tag
  controllers/              auth, user, post, comment, tag
  routes/                   mapping endpoint
  middleware/auth.js        verifikasi JWT
  utils/tags.js             upsert tag, parsing query tag
  server.js                 entry point
```

## Struktur Frontend

```
web/src/
  api.js                    axios client
  auth.jsx                  context auth (token + user)
  App.jsx                   router utama
  pages/                    Login, Register, Feed, Profile,
                            PostDetail, Explore, TagPage
  components/               Composer, PostCard, TagPill
  styles.css
```
