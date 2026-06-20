# UI Redesign — Spesifikasi Implementasi

> Dokumen ini adalah panduan desain dan implementasi frontend untuk redesign UI Anomia.
> Terinspirasi dari Bluesky (navigasi, feed, layout bersih) dan Threads (interaksi post,
> tipografi ringan, komunitas/tag). Sentuhan: minimal, modern, dan punya karakter sendiri.

---

## 1. Design Language

### Filosofi
- **Quiet confidence** — tidak ramai, tidak kosong. Setiap elemen punya fungsi.
- Konten adalah bintangnya, bukan UI-nya. Frame yang baik tidak mengalihkan perhatian dari lukisannya.
- Satu aksen warna. Semua yang lain adalah netral.

### Color Palette

| Token | Hex | Penggunaan |
|---|---|---|
| `--color-bg` | `#0E0E10` | Background utama (dark mode default) |
| `--color-surface` | `#18181B` | Card, panel, bottom nav |
| `--color-surface-2` | `#232329` | Input, hover state |
| `--color-border` | `#2C2C33` | Divider, outline |
| `--color-text-primary` | `#F0F0F2` | Teks utama |
| `--color-text-secondary` | `#8A8A96` | Username, timestamp, placeholder |
| `--color-accent` | `#7C6AF7` | Tombol aktif, like terisi, badge aktif |
| `--color-accent-soft` | `#7C6AF720` | Background badge, hover accent |
| `--color-danger` | `#E05C5C` | Error, hapus, suspend |
| `--color-mod` | `#4A90E2` | Badge Moderator |
| `--color-dev` | `#FF6B35` | Badge Developer |

> Light mode: tukar `--color-bg` ke `#F8F8FA`, `--color-surface` ke `#FFFFFF`,
> `--color-surface-2` ke `#F2F2F5`, teks balik ke dark. Accent tetap sama.

### Typography

| Peran | Font | Weight | Size |
|---|---|---|---|
| Display (nama app, heading) | `Inter` | 700 | 20–24px |
| Body (konten post) | `Inter` | 400 | 15px / line-height 1.6 |
| Username | `Inter` | 600 | 14px |
| Secondary (handle, waktu, counter) | `Inter` | 400 | 13px |
| Badge / Label | `Inter` | 700 | 11px uppercase |

Gunakan `font-feature-settings: "cv05", "cv11"` untuk karakter `a` dan `g` yang lebih
humanis — membedakan dari tampilan default Inter yang terasa terlalu teknikal.

---

## 2. Layout Global

```
┌─────────────────────────────────┐
│         TOP BAR (sticky)        │  ← Logo center, aksi kiri/kanan
├──────────────┬──────────────────┤
│  TAB: Untuk  │  TAB: Mengikuti  │  ← Underline aktif accent
├──────────────┴──────────────────┤
│                                 │
│        CREATE POST BAR          │  ← Avatar + placeholder
│─────────────────────────────────│
│                                 │
│          POST CARD              │
│          POST CARD              │
│          POST CARD              │
│          ...                    │
│                                 │
└─────────────────────────────────┘
         BOTTOM NAV BAR            ← 5 tab, icon + label aktif
```

### Top Bar
- Tinggi: 52px, `backdrop-filter: blur(16px)` agar transparan saat scroll.
- Logo/nama app: center, font 18px bold.
- Kiri: ikon hamburger (buka drawer profil/setting) atau ikon kembali saat di sub-halaman.
- Kanan: ikon search atau ikon notifikasi tergantung halaman.
- Tidak ada warna solid — background mengikuti warna halaman dengan blur.

### Bottom Navigation Bar
- 5 tab: **Beranda | Jelajah | Buat | Notifikasi | Profil**
- Tab aktif: ikon filled + label kecil berwarna accent.
- Tab nonaktif: ikon outline + tanpa label.
- Badge notifikasi: titik merah kecil di sudut ikon, angka hanya tampil untuk < 100.
- Tombol **Buat** di tengah: lebih besar, berbentuk lingkaran dengan background accent —
  mirip FAB (Floating Action Button) yang terintegrasi ke navbar.

---

## 3. Komponen Utama

### 3a. Post Card

```
┌─────────────────────────────────────┐
│ [Avatar]  Username   🛠️ Dev  · 4j   │
│           @handle                   │
│                                     │
│  Teks konten postingan di sini...   │
│  #hashtag terdeteksi otomatis       │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Preview media (img/video)    │  │
│  └───────────────────────────────┘  │
│                                     │
│  ♡ 24   💬 8   ↻ 3   ↗ Bagikan    │
└─────────────────────────────────────┘
```

Detail setiap baris:
- **Header**: Avatar (40px, rounded-full, support GIF), nama display bold, badge role
  (kalau ada), separator titik · , timestamp relatif.
- **Handle** (`@username`): di bawah nama display, warna secondary.
- **Konten teks**: render markdown ringan — bold, italic, dan deteksi `@mention` + `#hashtag`
  otomatis jadi link berwarna accent.
- **Media**: rasio 4:3 untuk foto, 16:9 untuk video, rounded-lg, lazy-load.
  Video: autoplay muted saat masuk viewport, tap untuk suara.
- **Action bar**: Like | Komentar | Repost | Bagikan — semua icon outline, angka di samping.
  Like aktif: ikon hati filled warna accent, angka berubah dengan animasi spring kecil.

Separator antar card: bukan border card, tapi divider tipis (`1px solid --color-border`)
di bawah action bar — terasa lebih ringan dari card berbingkai.

---

### 3b. Create Post Bar (di atas feed)

```
┌─────────────────────────────────────┐
│ [Avatar] Apa yang ingin kamu bagikan?  [📷] [🖼] │
└─────────────────────────────────────┘
```

- Tap di area teks → buka modal/halaman buat post fullscreen.
- Dua ikon di kanan: kamera (ambil foto/video langsung) dan galeri (pilih dari galeri).

---

### 3c. Modal Buat Post (Fullscreen)

```
┌─────────────────────────────────────┐
│  ✕ Batal          Kirim →           │  ← Tombol Kirim disabled sampai ada konten
│─────────────────────────────────────│
│ [Avatar]                            │
│                                     │
│  Textarea autosize...               │
│  (tidak ada border, terasa prose)   │
│                                     │
│  [Preview media kalau sudah dipilih]│
│                                     │
│─────────────────────────────────────│
│ [📷] [🖼] [#] [@]    140/500 chars │  ← Toolbar bawah + counter karakter
└─────────────────────────────────────┘
```

Saat menekan Kirim:
- Tombol berubah jadi spinner + disabled.
- Progress bar tipis di atas modal menunjukkan progres upload.
- Teks berubah menjadi status: "Mengunggah..." → "Memeriksa..." → "Memposting..." →
  sukses (modal tutup, post muncul di feed dengan animasi slide-in dari atas).
- User **tidak melihat kata "moderasi" atau "tinjauan"** — flow terasa seperti upload normal.

---

### 3d. Halaman Jelajah (Explorer)

```
┌─────────────────────────────────────┐
│     🔍 Cari postingan, user...      │  ← Search bar sticky
│─────────────────────────────────────│
│  🔥 Trending   👤 Akun   🏷 Tag    │  ← Filter chip
│─────────────────────────────────────│
│                                     │
│  POST CARD                          │
│  POST CARD                          │
│  ...                                │
└─────────────────────────────────────┘
```

- Search bar aktif saat ketik → tampilkan result real-time.
- Filter chip: **Trending** (default, sort by engagement), **Akun** (cari user),
  **Tag** (cari hashtag).
- Trending tag: tampil sebagai chip horizontal scrollable di atas feed sebelum
  search bar digunakan, berisi 5–10 hashtag populer.

---

### 3e. Halaman Profil

```
┌─────────────────────────────────────┐
│  ← Kembali                          │
│ ┌─────────────────────────────────┐ │
│ │         Banner (3:1 ratio)      │ │
│ └─────────────────────────────────┘ │
│      [Avatar 72px] ← overlap banner │
│                                     │
│  Nama Display   🛠️ Dev             │
│  @username                          │
│  Bio teks di sini...               │
│                                     │
│  128 Mengikuti   1.2K Pengikut     │
│                                     │
│  [ Ikuti / Mengikuti ] [ Pesan ]   │
│─────────────────────────────────────│
│  Postingan  |  Balasan  |  Media   │  ← Tab konten profil
│─────────────────────────────────────│
│  POST CARD                          │
│  ...                                │
└─────────────────────────────────────┘
```

Avatar overlap banner: `margin-top: -36px` dari tepi bawah banner, border
`3px solid --color-bg` agar terlihat memisah dari banner.

---

### 3f. Panel Notifikasi (Halaman)

```
┌─────────────────────────────────────┐
│  Notifikasi          Tandai semua ✓ │
│─────────────────────────────────────│
│ [🔴] @ari menyukai postinganmu · 2m │  ← Dot merah = belum baca
│ [Avatar] @budi mengomentari...· 5m  │
│ [⚠️] Postinganmu telah dihapus · 1j │  ← Notif moderasi, warna danger
│ [🔔] Anomia: Selamat datang! · 1h   │  ← Notif sistem, ikon brand
└─────────────────────────────────────┘
```

- Unread: background sedikit lebih terang (`--color-surface-2`) + dot accent.
- Sudah dibaca: background normal, tanpa dot.
- Notif moderasi/sistem: ikon khusus menggantikan avatar.

---

## 4. Fitur Tambahan yang Perlu Diimplementasi

### Fitur Sosial Umum

| Fitur | Deskripsi |
|---|---|
| **Like / Suka** | Toggle, animasi spring saat klik, counter real-time |
| **Komentar** | Nested reply satu level (reply ke komentar), mention otomatis |
| **Repost** | Dua opsi: Repost langsung atau Quote Post (embed post + tambah komentar sendiri) |
| **Bagikan** | Share ke clipboard URL / native share sheet mobile |
| **Bookmark** | Simpan post ke koleksi pribadi, halaman Tersimpan di profil |
| **Follow / Unfollow** | Tombol dengan state Ikuti / Mengikuti / Saling Ikuti |
| **Hashtag** | Klik hashtag → halaman feed berisi semua post dengan tag itu |
| **Mention** | Klik @username → ke halaman profil user tersebut |
| **Block / Report** | Di menu ··· tiap post / profil user |

### Fitur Feed

| Fitur | Deskripsi |
|---|---|
| **Tab Untuk Kamu** | Algoritma: engagement tertinggi + user yang diikuti |
| **Tab Mengikuti** | Hanya postingan dari akun yang diikuti, urutan kronologis |
| **Infinite scroll** | Load lebih banyak saat mendekati bawah halaman |
| **Pull to refresh** | Tarik ke bawah untuk muat postingan baru |
| **New posts indicator** | Banner kecil di atas "X postingan baru" saat ada update — tap untuk scroll ke atas |

### Fitur Moderasi (Terlihat oleh Mod/Dev)

| Fitur | Deskripsi |
|---|---|
| **Menu moderasi** | Di menu ··· post: tambahkan opsi "Hapus (Mod)" khusus untuk mod/dev |
| **Alasan hapus** | Modal kecil minta alasan singkat sebelum konfirmasi hapus |
| **Label pelanggaran** | Post yang dihapus berubah jadi placeholder "Postingan ini dihapus oleh moderator" alih-alih hilang total — lebih transparan |

---

## 5. Micro-interactions & Animasi

Semua animasi harus ringan dan fungsional — bukan sekadar dekorasi:

- **Like**: ikon hati scale-up 1.3 → bounce kembali ke 1, durasi 300ms.
- **Post baru masuk feed**: slide-in dari atas + fade, durasi 250ms.
- **Modal buat post**: slide-up dari bawah, durasi 300ms ease-out.
- **Tab switch**: konten fade antar tab, bukan slide (lebih tenang).
- **Bottom nav**: ikon tab aktif scale 1.1 saat dipilih, transition 150ms.
- **Skeleton loader**: placeholder abu-abu beranimasi shimmer saat konten dimuat.
- Hormati `prefers-reduced-motion`: semua animasi off kalau user aktifkan opsi ini.

---

## 6. Responsive & Mobile-First

Anomia diakses terutama dari mobile, maka:

- Semua layout didesain untuk lebar 360–430px terlebih dahulu.
- Touch target minimal 44×44px untuk semua tombol interaktif.
- Bottom nav hanya untuk mobile. Di desktop (>768px): ganti dengan sidebar kiri.
- Font size tidak pernah di bawah 13px di mobile.
- Video di feed: tidak pernah autoplay dengan suara — selalu muted, user tap untuk audio.

---

## 7. Implementation Checklist

**Desain sistem:**
- [ ] Definisikan CSS variables token warna dan tipografi (bagian 1)
- [ ] Setup dark/light mode toggle (localStorage + `prefers-color-scheme`)

**Komponen:**
- [ ] Top Bar (sticky, blur background)
- [ ] Bottom Navigation Bar (5 tab, badge notifikasi, tombol buat di tengah)
- [ ] Post Card (avatar, header, teks dengan mention/hashtag, media, action bar)
- [ ] Create Post Bar (di atas feed)
- [ ] Modal Buat Post fullscreen (progress bar, status upload invisible moderation)
- [ ] Skeleton loader untuk Post Card
- [ ] Badge Role (`Dev`, `Mod`) di semua tempat nama muncul

**Halaman:**
- [ ] Feed (tab Untuk Kamu + Mengikuti, infinite scroll, pull-to-refresh)
- [ ] Jelajah/Explorer (search, filter chip, trending tag)
- [ ] Profil (banner + avatar overlap, tab Postingan/Balasan/Media)
- [ ] Notifikasi (daftar, unread state, tandai semua)
- [ ] Halaman Komentar (nested reply, mention)
- [ ] Halaman Hashtag (feed berisi semua post dengan tag tersebut)
- [ ] Halaman Tersimpan/Bookmark

**Fitur interaktif:**
- [ ] Like dengan animasi
- [ ] Repost + Quote Post
- [ ] Bookmark
- [ ] Follow/Unfollow dengan state
- [ ] Block/Report di menu ···
- [ ] New posts indicator banner
- [ ] Hashtag clickable → halaman hashtag
- [ ] Mention clickable → halaman profil

**Moderasi UI:**
- [ ] Opsi "Hapus (Mod)" di menu ··· khusus role mod/dev
- [ ] Modal alasan hapus
- [ ] Placeholder post dihapus yang transparan
