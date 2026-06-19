# Content Moderation Pipeline — Spesifikasi Implementasi

> Dokumen ini adalah skema teknis untuk fitur moderasi konten otomatis pada project Anomia.
> Tujuan: menyaring konten berbahaya/melanggar ketentuan (NSFW, kekerasan, dll) tanpa mengganggu
> pengalaman upload pengguna normal. Dari sisi user, proses ini terlihat seperti upload biasa.

## 1. Tujuan

- Mencegah konten melanggar (NSFW, kekerasan eksplisit, dll) tayang ke publik.
- UX tetap mulus: user hanya melihat progress upload normal, tidak ada label
  "sedang ditinjau" / "pending review" yang terlihat.
- Dua lapis scan:
  1. **Quick Pre-Publish Scan** — cepat, berjalan sebelum post tayang ke publik.
  2. **Thorough Post-Publish Scan** — menyeluruh, berjalan di background setelah post tayang,
     untuk menangkap kasus yang lolos dari quick scan.
- Konten yang lolos quick scan tapi kemudian terindikasi berbahaya oleh thorough scan akan
  otomatis dihapus + user pemilik diberi notifikasi.

## 2. Non-Goals

- Bukan pengganti penuh human moderation — tetap perlu jalur manual override / appeal untuk
  kasus false positive.
- Tidak menjamin akurasi 100%. Sistem ini adalah lapisan pertahanan berlapis (defense in depth),
  bukan satu-satunya penjamin keamanan konten.

## 3. Alur Proses (High-Level Flow)

```
[User isi deskripsi + pilih media] 
        │
        ▼
[Tekan "Kirim"] ──► Frontend kirim file ke backend: POST /api/posts (multipart/form-data)
        │
        ▼
[Backend terima file] ──► simpan sementara (buffer / temp file)
        │                  (UI tetap tampil sebagai progress upload biasa)
        ▼
[QUICK SCAN] ── gambar: cek langsung 1 file
              ── video: ekstrak beberapa frame sample (awal/tengah/akhir), cek tiap frame
        │
   ┌────┴────┐
   ▼         ▼
FLAGGED     CLEAN
   │         │
   ▼         ▼
Tolak,    Upload ke Cloudinary ──► simpan post (status: published) ──► tampil ke publik
pesan         │
generik       ▼
        [THOROUGH SCAN — async, background]
        gambar: re-check / cross-provider
        video: full frame-by-frame (Cloudinary moderation add-on / Rekognition Video job)
              │
        ┌─────┴─────┐
        ▼           ▼
      CLEAN       FLAGGED
        │           │
   (tidak ada    Hapus dari Cloudinary, ubah status post → removed,
    aksi)        kirim notifikasi ke user, tambah strike ke akun
```

## 4. Komponen yang Dibutuhkan

| Komponen | Fungsi |
|---|---|
| `POST /api/posts` | Endpoint upload utama. Terima multipart file dari frontend. |
| Quick Scan Service | Panggilan sinkron ke moderation API, target selesai dalam hitungan detik. |
| Frame Sampler (video) | Ekstrak beberapa frame dari video (mis. pakai ffmpeg) untuk quick scan. |
| Cloudinary Upload Service | Forward file ke Cloudinary setelah lolos quick scan. |
| Thorough Scan Service | Job async penuh: Cloudinary moderation add-on (`aws_rek` / `google_video_moderation`) dengan `notification_url`, atau panggilan langsung ke Rekognition Video. |
| `POST /api/webhooks/moderation` | Terima callback hasil thorough scan dari Cloudinary, update status post. |
| Notification Service | Kirim notifikasi in-app/email saat post dihapus. |
| Strike Counter | Hitung pelanggaran per user, trigger suspend otomatis setelah N kali. |

## 5. Pilihan API Moderasi

- **Quick Scan (sinkron, cepat):** AWS Rekognition `DetectModerationLabels` atau Google Vision
  `SafeSearchDetection` — dipanggil langsung dari backend, hasil dalam 1-3 detik per gambar/frame.
- **Thorough Scan (async, menyeluruh):** Cloudinary moderation add-on (`aws_rek` untuk gambar,
  `google_video_moderation` atau Rekognition Video Moderation untuk video) — berjalan otomatis
  setelah asset tersimpan di Cloudinary, hasil dikirim lewat webhook.

## 6. Data Model (MongoDB — collection `posts`)

```js
{
  _id: ObjectId,
  userId: ObjectId,
  description: String,
  mediaType: "text" | "image" | "video",
  mediaUrl: String | null,        // Cloudinary secure_url, null sebelum upload selesai
  status: "published" | "removed",
  quickScan: { provider: String, result: String, score: Number, checkedAt: Date },
  thoroughScan: { provider: String, status: "pending"|"approved"|"rejected", score: Number, checkedAt: Date },
  removedReason: String | null,
  createdAt: Date,
  updatedAt: Date
}
```

Collection tambahan `moderation_logs` — audit trail semua hasil scan (termasuk yang ditolak di
quick scan, walau tidak pernah jadi post), untuk keperluan deteksi repeat offender.

## 7. Strike / Repeat Offender Handling

- Setiap pelanggaran (dari quick scan atau thorough scan) menambah 1 strike ke akun user.
- Setelah strike ke-N (misal 3), akun otomatis disuspend sementara atau butuh review manual
  sebelum bisa upload lagi.

## 8. Notifikasi ke User

Saat post dihapus oleh thorough scan, kirim notifikasi singkat dan jelas — tanpa menjelaskan
detail teknis algoritma scanner (skor, kategori spesifik), cukup:

> "Postingan kamu dihapus karena melanggar ketentuan komunitas. Lihat ketentuan komunitas kami
> di [link] atau ajukan banding jika menurutmu ini keliru."

## 9. Constraint Penting

- **Fail-closed, bukan fail-open**: kalau quick scan API timeout/error, default behavior adalah
  MENOLAK publish (jangan auto-approve). Lebih baik user diminta upload ulang daripada konten
  tidak terverifikasi lolos karena layanan scan sedang down.
- **Target waktu quick scan**: usahakan < 5 detik untuk gambar, dan untuk video cukup proses
  beberapa frame sample (bukan seluruh video) agar tetap cepat.
- **Validasi ukuran upload lewat backend**: karena alur ini mengirim file ke server dulu
  (bukan langsung ke Cloudinary), perlu ditest langsung di production apakah Render bisa
  menangani body request hingga 20MB tanpa kendala di level proxy — Render tidak mempublikasikan
  limit resmi untuk ini.
- **Jangan expose detail hasil scan** ke response API yang diterima frontend/user — cukup pesan
  generik ketika ditolak, supaya user yang coba-coba tidak bisa menebak cara melewati scanner
  dari feedback yang didapat.
- File yang ditolak di quick scan disimpan sementara di lokasi terisolasi (untuk investigasi/audit)
  lalu dihapus otomatis setelah periode tertentu (misal 30 hari).

## 10. Implementation Checklist

- [ ] Endpoint `POST /api/posts` menerima multipart upload
- [ ] Modul quick scan (gambar langsung, video via frame sampling)
- [ ] Integrasi upload ke Cloudinary setelah quick scan lolos
- [ ] Setup Cloudinary moderation add-on / Rekognition Video job untuk thorough scan
- [ ] Endpoint webhook `POST /api/webhooks/moderation`
- [ ] Update status post + hapus media dari Cloudinary kalau thorough scan flagged
- [ ] Notification service (in-app/email)
- [ ] Strike counter & auto-suspend logic
- [ ] Collection `moderation_logs` untuk audit trail
- [ ] Fail-safe handling saat API moderasi down/timeout
