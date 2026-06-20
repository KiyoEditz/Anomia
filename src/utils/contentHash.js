const crypto = require('crypto');

const normalizeContent = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')        // Hapus spasi ganda
    .replace(/[^\w\s]/g, '');    // Hapus tanda baca
};

const hashContent = (text) => {
  const normalized = normalizeContent(text);
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

module.exports = { hashContent, normalizeContent };
