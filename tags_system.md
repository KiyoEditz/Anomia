# Fitur: Sistem Tag Berkategori dengan Filter Multi-Tag

## Ringkasan

Sistem tagging untuk konten dengan tag yang dikelompokkan ke dalam beberapa kategori (mirip pendekatan nhentai.net / asmr.one). Pengguna bisa menelusuri konten lewat tag, memfilter dengan kombinasi beberapa tag (AND/NOT), dan melihat tag dikelompokkan rapi per kategori di halaman detail konten.

## Data Model

```
tags
- id
- name
- slug
- category        (genre | character | artist | group | language | format)
- usage_count     (jumlah konten yang memakai tag ini)

content
- id
- title
- ...field lain sesuai domain aplikasi

content_tags                 (pivot, many-to-many)
- content_id
- tag_id

tag_aliases                  (opsional, untuk normalisasi penulisan)
- alias_name
- canonical_tag_id
```

Catatan:
- `usage_count` di-update tiap kali relasi `content_tags` ditambah/dihapus (lewat trigger, job, atau increment manual) supaya tidak perlu COUNT(*) tiap kali menampilkan tag populer.
- Kategori tag disimpan sebagai enum/string di tabel `tags`, bukan tabel terpisah, kecuali butuh atribut tambahan per kategori (misalnya urutan tampil, warna label).

## API Endpoints

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/tags?category=genre&search=roman` | Autocomplete tag, bisa difilter per kategori |
| GET | `/content?tags=romance,comedy&exclude=horror&sort=popular&page=1` | List konten dengan filter multi-tag |
| GET | `/tags/:slug` | Detail tag + list konten yang memakainya (paginated) |
| GET | `/content/:id` | Detail konten, termasuk tag-tag yang dikelompokkan per kategori |

## Search / Filter Syntax

- `tag:"romance"` → konten wajib punya tag ini
- `-tag:"horror"` → konten wajib TIDAK punya tag ini
- Bisa digabung banyak tag sekaligus, hasil akhirnya adalah interseksi (AND) dari semua tag wajib, dikurangi tag yang dikecualikan
- Query string sederhana di endpoint list: `?tags=a,b,c&exclude=d,e`

## UI / UX

- **Halaman detail konten**: tag ditampilkan dikelompokkan per kategori, masing-masing kategori punya label dan warna/ikon berbeda agar mudah dipindai.
- **Klik tag** → redirect ke halaman tag (`/tags/:slug`).
- **Search box**: autocomplete saat mengetik, menampilkan nama tag + kategori + usage_count.
- **Halaman tag**: grid/list konten, dengan opsi sort (terbaru, terpopuler) dan pagination.
- **Filter panel** (opsional): checkbox per kategori untuk include/exclude tag tanpa perlu mengetik syntax manual.

## Performa

- Index komposit pada `content_tags(tag_id, content_id)` dan `content_tags(content_id, tag_id)`.
- Cache untuk daftar tag populer dan kombinasi filter yang sering diakses (misalnya Redis dengan key berdasarkan hash kombinasi tag).
- Untuk query interseksi banyak tag, pertimbangkan strategi: ambil content_id dari tag dengan usage_count terkecil dulu, baru filter dengan tag lainnya (mengurangi jumlah baris yang diproses).

## Task untuk Implementasi

1. Buat migrasi database untuk tabel `tags`, `content_tags`, `tag_aliases`.
2. Buat model/relasi many-to-many antara `content` dan `tags`.
3. Implementasi endpoint autocomplete tag dengan filter kategori.
4. Implementasi endpoint list konten dengan parsing query filter (`tags`, `exclude`, `sort`, `page`).
5. Implementasi parsing syntax `tag:"..."` dan `-tag:"..."` di search box (jika search bar mendukung syntax manual).
6. Buat komponen UI tag berkategori di halaman detail konten.
7. Buat halaman tag (`/tags/:slug`) dengan grid hasil + pagination.
8. Tambahkan index database yang disebutkan di bagian Performa.
9. (Opsional) Tambahkan job/trigger untuk update `usage_count` otomatis.
