# Notification System — Spesifikasi Implementasi

> Dokumen ini adalah skema teknis untuk sistem notifikasi pada project Anomia.
> Mencakup: notifikasi mention user, komentar pada postingan, pelanggaran konten,
> serta notifikasi sistem/admin. Dirancang menyerupai sistem notifikasi sosial media
> pada umumnya (Instagram, TikTok, Twitter/X).

---

## 1. Tipe-Tipe Notifikasi

| Kode Tipe | Deskripsi | Contoh Pesan |
|---|---|---|
| `mention` | User disebut di postingan atau komentar | "@budi menyebutmu di sebuah postingan" |
| `comment` | Ada yang mengomentari postingan milik user | "@sinta mengomentari postinganmu" |
| `comment_reply` | Ada yang membalas komentar user | "@dimas membalas komentarmu" |
| `comment_like` | Ada yang menyukai komentar user | "@rani menyukai komentarmu" |
| `post_like` | Ada yang menyukai postingan user | "@ari menyukai postinganmu" |
| `moderation_removed` | Postingan dihapus karena melanggar ketentuan | "Postinganmu telah dihapus karena melanggar ketentuan komunitas." |
| `moderation_warning` | Peringatan sebelum atau setelah pelanggaran | "Ini adalah peringatan resmi untuk akunmu." |
| `moderation_suspended` | Akun disuspend oleh sistem/admin | "Akunmu telah disuspend. Pelajari lebih lanjut." |
| `system` | Notifikasi umum dari sistem/admin | "Selamat datang di Anomia! 🎉" |
| `admin` | Pesan khusus dari admin (personal / broadcast) | "Hei, ada pembaruan penting untuk akunmu." |

---

## 2. Data Model (MongoDB)

### Collection: `notifications`

```js
{
  _id: ObjectId,

  // Penerima notifikasi
  recipientId: ObjectId,          // userId penerima

  // Pengirim (opsional — null untuk notifikasi sistem/admin/moderasi)
  senderId: ObjectId | null,      // userId yang memicu notifikasi (yg mention, komen, dsb)
  senderUsername: String | null,  // Di-snapshot saat dibuat, agar tidak berubah kalau user ganti username
  senderAvatar: String | null,    // URL avatar snapshot

  // Tipe dan konten
  type: String,                   // Salah satu kode tipe dari tabel di atas
  message: String,                // Teks notifikasi yang ditampilkan ke user
  deepLink: String | null,        // URL tujuan saat notifikasi diklik, misal "/post/abc123"

  // Referensi konteks (opsional, untuk deeplink & preview)
  refPostId: ObjectId | null,     // ID post yang bersangkutan
  refCommentId: ObjectId | null,  // ID komentar yang bersangkutan
  refMediaPreview: String | null, // URL thumbnail media (untuk preview di notifikasi)

  // Status
  isRead: Boolean,                // Default: false
  readAt: Date | null,

  // Broadcast dari admin (flag khusus)
  isBroadcast: Boolean,           // true = notifikasi ini dikirim ke semua user

  createdAt: Date,
}
```

### Index yang disarankan:
```js
// Untuk query notifikasi satu user, sorted terbaru dulu
{ recipientId: 1, createdAt: -1 }

// Untuk count unread badge
{ recipientId: 1, isRead: 1 }
```

---

## 3. Alur Tiap Jenis Notifikasi

### 3a. Mention (@username)

```
User A menulis komentar/postingan berisi "@userB"
        │
        ▼
Backend parse teks, deteksi semua token yang diawali "@"
        │
        ▼
Cek database: username yang dimention valid & akunnya aktif?
        │
   ┌────┴────┐
   TIDAK    YA
   │         │
  skip      Buat dokumen notifikasi tipe "mention"
             Kirim real-time ke userB via Socket.io / SSE
```

Parsing mention perlu menyaring duplikat (kalau sama username disebut 2x dalam satu teks,
tetap hanya 1 notifikasi) dan tidak membuat notifikasi untuk self-mention (mention ke
username sendiri).

---

### 3b. Komentar & Reply

```
User B mengomentari Post milik User A
        │
        ▼
Simpan komentar ke collection "comments"
        │
        ▼
Buat notifikasi tipe "comment" untuk User A (pemilik post)
        │
        ▼
Apakah komentar ini reply ke komentar User C?
   ┌────┴────┐
   TIDAK    YA
   │         │
  selesai   Buat notifikasi tipe "comment_reply" untuk User C
```

Catatan: Jangan buat notifikasi untuk user yang berkomentar pada postingannya sendiri
(self-comment pada post sendiri tidak perlu notifikasi ke diri sendiri).

---

### 3c. Notifikasi Moderasi (otomatis dari sistem)

```
Thorough scan selesai → hasil: FLAGGED
        │
        ▼
Hapus media dari Cloudinary
Ubah status post → "removed"
        │
        ▼
Buat notifikasi tipe "moderation_removed"
senderId: null (pengirim adalah sistem)
deepLink: "/community-guidelines"

Tambah strike ke user:
  strike 1 → "moderation_warning" notifikasi
  strike 2 → "moderation_warning" notifikasi (lebih tegas)
  strike 3 → suspend akun, notifikasi "moderation_suspended"
```

---

### 3d. Notifikasi Sistem & Admin

Dua sub-jenis:

**Personal** — hanya ke satu user tertentu:
```js
{
  recipientId: ObjectId("..."),   // target user tertentu
  senderId: null,
  type: "admin",
  isBroadcast: false,
  message: "Akunmu telah diverifikasi sebagai akun resmi.",
  deepLink: "/settings/account"
}
```

**Broadcast** — ke seluruh user (misal: pengumuman maintenance, fitur baru):
```js
{
  recipientId: null,              // null berarti semua user
  senderId: null,
  type: "system",
  isBroadcast: true,
  message: "Anomia akan maintenance pada Minggu, 22 Juni pukul 02.00 WIB.",
  deepLink: null
}
```

Untuk broadcast: backend bisa menyimpan satu dokumen dengan `isBroadcast: true` dan
`recipientId: null`, lalu saat user membuka notifikasi, query menyertakan broadcast
global yang belum dibaca user itu (cek via collection terpisah `broadcast_reads`).

---

## 4. API Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/notifications` | Ambil daftar notifikasi milik user yang sedang login (paginasi, newest first) |
| GET | `/api/notifications/unread-count` | Jumlah notifikasi yang belum dibaca (untuk badge) |
| PATCH | `/api/notifications/:id/read` | Tandai satu notifikasi sebagai sudah dibaca |
| PATCH | `/api/notifications/read-all` | Tandai semua notifikasi user sebagai sudah dibaca |
| DELETE | `/api/notifications/:id` | Hapus satu notifikasi |
| POST | `/api/admin/notifications` | (Admin only) Kirim notifikasi personal atau broadcast |

---

## 5. Real-Time Delivery

Gunakan **Socket.io** (atau SSE sebagai alternatif lebih ringan) agar notifikasi muncul
instan tanpa user perlu refresh halaman.

### Alur Socket.io:
```
User login → Frontend buka socket connection ke backend
                         │
                         ▼
              Backend register socket ke room berdasarkan userId
              (misal: socket.join(`user_${userId}`))
                         │
                         ▼
              Saat ada notifikasi baru untuk userId itu:
              io.to(`user_${userId}`).emit('new_notification', { ...notifData })
                         │
                         ▼
              Frontend terima event → tampilkan badge +1 dan
              masukkan notifikasi baru ke atas daftar
```

Untuk broadcast: `io.emit('new_notification', { ...notifData })` tanpa filter room,
semua client yang terkoneksi terima.

---

## 6. UI / UX Behavior (Referensi Frontend)

- **Badge angka** di icon notifikasi menampilkan jumlah unread. Angka di-cap di "99+"
  agar tidak overflow di layar kecil.
- **Daftar notifikasi** menampilkan avatar sender, teks notifikasi, preview thumbnail
  media (kalau ada), dan waktu relatif ("2 menit lalu", "kemarin").
- Tap/klik notifikasi → otomatis tandai sebagai read + navigasi ke deepLink.
- Tombol "Tandai semua sudah dibaca" di header panel notifikasi.
- Notifikasi moderasi (`moderation_*`) tampil dengan **ikon peringatan** dan warna
  berbeda (misal merah/oranye) agar mudah dibedakan dari notifikasi sosial biasa.
- Notifikasi sistem/admin tampil dengan **ikon Anomia** (bukan avatar user), karena
  senderId-nya null.
- Grup notifikasi sejenis yang datang dekat waktunya bisa di-aggregate untuk menghindari
  spam: "**@ari** dan **3 orang lainnya** menyukai postinganmu" — ini opsional, bisa
  diimplementasi di tahap lanjut.

---

## 7. Grouping & Aggregasi (Opsional — Fase Lanjut)

Untuk menghindari banjir notifikasi dari aksi yang sama di satu konten:

```
Like ke-1 → notif individual "@ari menyukai postinganmu"
Like ke-2 (dalam 1 jam) → update notif sebelumnya:
  "@ari dan @budi menyukai postinganmu"
Like ke-5+ → "@ari dan 4 orang lainnya menyukai postinganmu"
```

Implementasinya: cek apakah sudah ada notifikasi tipe dan refPostId yang sama,
dibuat dalam window waktu tertentu (misal 1 jam), yang belum dibaca oleh penerima.
Kalau ada → update dokumen itu, jangan buat dokumen baru.

---

## 8. Retention & Cleanup

- Notifikasi yang sudah dibaca lebih dari **30 hari** bisa dihapus otomatis (cron job).
- Notifikasi yang belum dibaca tidak dihapus otomatis — kecuali untuk akun yang
  sudah dihapus/nonaktif.
- Untuk broadcast: simpan collection `broadcast_reads` berisi `{ userId, broadcastId, readAt }`
  sebagai penanda user mana saja yang sudah membaca broadcast tertentu.

---

## 9. Implementation Checklist

- [ ] Buat collection `notifications` dengan index yang disarankan
- [ ] Buat collection `broadcast_reads`
- [ ] Fungsi helper `createNotification(data)` — semua trigger notifikasi pakai ini
- [ ] Parser mention pada create-post dan create-comment
- [ ] Trigger notifikasi pada: komentar baru, reply komentar, like post, like komentar, mention
- [ ] Trigger notifikasi pada: moderasi removed, warning, suspended
- [ ] Endpoint GET/PATCH/DELETE untuk notifikasi user
- [ ] Endpoint POST admin (proteksi role admin)
- [ ] Integrasi Socket.io untuk real-time delivery
- [ ] Frontend: badge unread count (polling atau socket event)
- [ ] Frontend: panel daftar notifikasi (paginasi infinite scroll)
- [ ] Frontend: mark as read saat klik + navigasi deepLink
- [ ] Frontend: tampilan khusus untuk notifikasi moderasi
- [ ] Frontend: tampilan khusus notifikasi sistem/admin (ikon brand)
- [ ] Cron job cleanup notifikasi lama
