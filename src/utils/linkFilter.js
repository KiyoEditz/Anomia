const normalizeForLinkCheck = (text) => {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/\s*\[\.\]\s*/g, '.')
    .replace(/\s*\(\.\)\s*/g, '.')
    .replace(/\s*\(dot\)\s*/g, '.')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s*\.\s*/g, '.')
    .replace(/[​-‍﻿]/g, '');
};

module.exports = { normalizeForLinkCheck };
