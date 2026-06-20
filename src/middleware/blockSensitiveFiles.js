// Blokir eksplisit akses ke file sensitif sebagai lapisan perlindungan kedua,
// agar tech stack (daftar dependency, secret, dll) tidak bocor lewat URL publik.
const SENSITIVE_FILES = [
  '/package.json',
  '/package-lock.json',
  '/.env',
  '/.env.example',
  '/.git',
];

function blockSensitiveFiles(req, res, next) {
  if (SENSITIVE_FILES.some((file) => req.path.startsWith(file))) {
    return res.status(404).json({ error: 'Data tidak ditemukan.' });
  }
  next();
}

module.exports = blockSensitiveFiles;
