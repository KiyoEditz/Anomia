# Role & Subtitle System — Spesifikasi Implementasi

> Dokumen ini adalah skema teknis untuk sistem role moderasi pada project Anomia.
> Tiga role tersedia: Developer (tertinggi), Moderator, dan User (default).
> Role ditampilkan sebagai subtitle/badge di bawah username di seluruh UI.

---

## 1. Definisi Role

| Role | Kode | Badge UI | Deskripsi |
|---|---|---|---|
| Developer | `dev` | 🛠️ Developer | Role tertinggi. Akses penuh ke seluruh fitur moderasi dan manajemen role. |
| Moderator | `mod` | 🛡️ Moderator | Diberikan oleh Developer. Bisa hapus postingan & komentar yang melanggar. |
| User | `user` | (tidak ada badge) | Role default semua akun baru. |

---

## 2. Matriks Kemampuan Per Role

| Kemampuan | User | Moderator | Developer |
|---|---|---|---|
| Membuat postingan | ✅ | ✅ | ✅ |
| Menghapus postingan **sendiri** | ✅ | ✅ | ✅ |
| Menghapus postingan **user lain** | ❌ | ✅ | ✅ |
| Menghapus komentar **sendiri** | ✅ | ✅ | ✅ |
| Menghapus komentar **user lain** | ❌ | ✅ | ✅ |
| Melihat log moderasi | ❌ | ✅ | ✅ |
| Memberikan role Moderator | ❌ | ❌ | ✅ |
| Mencabut role Moderator | ❌ | ❌ | ✅ |
| Mensuspend akun user | ❌ | ❌ | ✅ |
| Mengakses panel admin | ❌ | ❌ | ✅ |

> **Catatan:** Role `dev` tidak bisa diberikan melalui API — hanya bisa diset
> langsung di database secara manual oleh pemilik project. Ini mencegah
> privilege escalation dari dalam aplikasi.

---

## 3. Perubahan Data Model (MongoDB)

### Tambahkan field `role` ke collection `users`

```js
{
  // ... field yang sudah ada ...
  role: {
    type: String,
    enum: ["user", "mod", "dev"],
    default: "user"
  },
  roleAssignedBy: ObjectId | null,   // userId developer yang assign role ini
  roleAssignedAt: Date | null,
}
```

### Migration — Set role default untuk semua user lama

Jalankan sekali di MongoDB Atlas shell:

```js
// Set semua user yang belum punya field role menjadi "user"
db.users.updateMany(
  { role: { $exists: false } },
  { $set: { role: "user", roleAssignedBy: null, roleAssignedAt: null } }
)
```

### Migration — Set role Developer untuk akun KiyoEditz

```js
// Jalankan manual, hanya sekali
db.users.updateOne(
  { username: "KiyoEditz" },
  {
    $set: {
      role: "dev",
      roleAssignedBy: null,    // self-assigned / owner
      roleAssignedAt: new Date()
    }
  }
)
```

---

## 4. Middleware Role Guard (Backend)

Buat middleware yang bisa dipakai di semua route yang butuh role tertentu:

```js
// src/middleware/requireRole.js

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const user = req.user; // dari middleware auth JWT yang sudah ada

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: "Kamu tidak memiliki izin untuk melakukan ini." });
    }

    next();
  };
};

module.exports = requireRole;
```

Penggunaan di route:

```js
const requireRole = require('../middleware/requireRole');

// Hanya dev dan mod yang bisa hapus postingan orang lain
router.delete('/posts/:id', requireAuth, requireRole('dev', 'mod'), deletePostHandler);

// Hanya dev yang bisa assign role
router.patch('/users/:id/role', requireAuth, requireRole('dev'), assignRoleHandler);
```

---

## 5. API Endpoints Baru

### Assign / Cabut Role (Developer only)

**PATCH** `/api/users/:userId/role`

Request body:
```json
{ "role": "mod" }
```

Response sukses:
```json
{
  "message": "Role berhasil diperbarui.",
  "user": {
    "username": "namauser",
    "role": "mod"
  }
}
```

Validasi yang harus ada di handler ini:
- Peminta harus role `dev` (sudah dijaga middleware).
- `role` yang dikirim hanya boleh `"mod"` atau `"user"` — **tidak boleh `"dev"`**.
  Developer tidak bisa dibuat lewat API, hanya lewat database langsung.
- Developer tidak bisa menurunkan/mengubah role sesama developer.

```js
// Contoh logikanya di handler
const assignRoleHandler = async (req, res) => {
  const { role } = req.body;

  // Blokir assign role dev lewat API
  if (role === 'dev') {
    return res.status(403).json({ message: "Role Developer tidak bisa diassign lewat API." });
  }

  const targetUser = await User.findById(req.params.userId);

  // Blokir ubah role developer lain
  if (targetUser.role === 'dev') {
    return res.status(403).json({ message: "Role Developer tidak bisa diubah." });
  }

  await User.findByIdAndUpdate(req.params.userId, {
    role,
    roleAssignedBy: req.user._id,
    roleAssignedAt: new Date()
  });

  res.json({ message: "Role berhasil diperbarui." });
};
```

### Hapus Postingan oleh Moderator/Developer

**DELETE** `/api/posts/:postId/moderate`

Buat endpoint terpisah dari DELETE biasa milik user, agar bisa menyimpan log alasan
penghapusan dan siapa yang menghapus:

Request body:
```json
{ "reason": "Melanggar ketentuan komunitas — konten tidak pantas." }
```

Handler wajib:
1. Hapus media dari Cloudinary.
2. Set status post → `"removed_by_mod"`.
3. Catat ke collection `moderation_logs` (lihat bagian 6).
4. Kirim notifikasi ke pemilik post (tipe `moderation_removed`).

### Daftar Moderator (Developer only)

**GET** `/api/users/moderators`

Mengembalikan semua user dengan role `mod` dan `dev`, beserta info `roleAssignedBy`
dan `roleAssignedAt`. Berguna untuk panel manajemen moderator.

---

## 6. Moderation Log

Setiap aksi moderasi manual (hapus post, hapus komentar, assign role, suspend akun)
harus dicatat ke collection `moderation_logs`:

```js
{
  _id: ObjectId,
  action: String,           // "delete_post" | "delete_comment" | "assign_role" | "suspend_user"
  performedBy: ObjectId,    // userId mod/dev yang melakukan aksi
  performedByRole: String,  // snapshot role saat aksi dilakukan
  targetUserId: ObjectId,   // userId pemilik konten / yang kena aksi
  targetPostId: ObjectId | null,
  targetCommentId: ObjectId | null,
  reason: String,           // alasan yang diisi mod/dev
  createdAt: Date,
}
```

Log ini tidak bisa dihapus lewat API (append-only), agar jejak moderasi selalu transparan
dan bisa diaudit.

---

## 7. Tampilan Badge di UI (Frontend)

Badge role ditampilkan tepat di bawah atau di samping username, di semua tempat
username muncul: kartu profil, halaman profil, komentar, postingan.

```jsx
// Contoh komponen BadgeRole.jsx
const BADGE_CONFIG = {
  dev: { label: "Developer", color: "#FF6B35", icon: "🛠️" },
  mod: { label: "Moderator", color: "#4A90E2", icon: "🛡️" },
  user: null, // tidak ada badge untuk user biasa
};

const BadgeRole = ({ role }) => {
  const config = BADGE_CONFIG[role];
  if (!config) return null;

  return (
    <span style={{ color: config.color, fontSize: "0.75rem", fontWeight: 600 }}>
      {config.icon} {config.label}
    </span>
  );
};
```

Badge `dev` dan `mod` perlu jelas berbeda secara visual agar user bisa membedakan
keduanya dengan mudah. Warna dan ikon bisa disesuaikan dengan desain Anomia.

---

## 8. Implementation Checklist

- [ ] Tambah field `role`, `roleAssignedBy`, `roleAssignedAt` ke schema User
- [ ] Jalankan migration — set semua user lama ke `role: "user"`
- [ ] Jalankan migration — set KiyoEditz ke `role: "dev"` manual via MongoDB shell
- [ ] Buat middleware `requireRole(...roles)`
- [ ] Endpoint `PATCH /api/users/:userId/role` (dev only, tidak bisa assign dev)
- [ ] Endpoint `DELETE /api/posts/:postId/moderate` (mod + dev)
- [ ] Endpoint `DELETE /api/comments/:commentId/moderate` (mod + dev)
- [ ] Endpoint `GET /api/users/moderators` (dev only)
- [ ] Collection `moderation_logs` + append di setiap aksi moderasi manual
- [ ] Notifikasi ke user saat kontennya dihapus oleh moderator
- [ ] Komponen `BadgeRole` di frontend
- [ ] Tampilkan badge di: kartu profil, halaman profil, komentar, postingan
- [ ] Pastikan response API tidak pernah expose field `passwordHash` dan `role` internal
      ke user biasa yang bukan pemilik akun
