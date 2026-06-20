const sanitizeHtml = require('sanitize-html');

// Konfigurasi ketat: strip SEMUA HTML dari konten.
// User tidak boleh inject tag apapun — konten murni teks.
function sanitizePostContent(content) {
  if (!content || typeof content !== 'string') return '';

  return sanitizeHtml(content, {
    allowedTags: [], // Tidak ada tag HTML yang diizinkan
    allowedAttributes: {}, // Tidak ada atribut yang diizinkan
    disallowedTagsMode: 'discard',
  }).trim();
}

// Konfigurasi lebih longgar untuk bio user — izinkan formatting dasar saja.
function sanitizeBio(bio) {
  if (!bio || typeof bio !== 'string') return '';

  return sanitizeHtml(bio, {
    allowedTags: ['b', 'i', 'em', 'strong'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

module.exports = { sanitizePostContent, sanitizeBio };
