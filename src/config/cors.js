// Daftar origin yang diizinkan mengakses API & Socket.io.
// Tambahkan custom domain produksi di sini jika sudah punya.
const ALLOWED_ORIGINS = [
  'http://localhost:5173', // Development (Vite dev server)
  'http://localhost:4173', // Vite preview
  'https://anomia.pages.dev', // Cloudflare Pages
  'https://anomia-2lh.pages.dev', // Subdomain Cloudflare Pages jika berbeda
];

// Tambahan origin dari environment variable (comma-separated), opsional.
// Berguna untuk menambah domain produksi tanpa mengubah kode.
if (process.env.EXTRA_ALLOWED_ORIGINS) {
  for (const origin of process.env.EXTRA_ALLOWED_ORIGINS.split(',')) {
    const trimmed = origin.trim();
    if (trimmed && !ALLOWED_ORIGINS.includes(trimmed)) {
      ALLOWED_ORIGINS.push(trimmed);
    }
  }
}

module.exports = { ALLOWED_ORIGINS };
