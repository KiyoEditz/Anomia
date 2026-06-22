const router = require('express').Router();
const { authRequired } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const BlockedLink = require('../models/BlockedLink');
const { invalidateCache } = require('../services/blockedLinksService');

router.get('/', authRequired, requireRole('dev', 'mod'), async (req, res) => {
  const links = await BlockedLink.find().sort({ createdAt: -1 });
  res.json({ links });
});

router.post('/', authRequired, requireRole('dev', 'mod'), async (req, res) => {
  let { pattern, matchType, reason } = req.body;

  if (!pattern || pattern.trim().length === 0) {
    return res.status(400).json({ message: 'Pattern wajib diisi.' });
  }

  if (!['exact', 'pattern'].includes(matchType)) {
    return res.status(400).json({ message: 'matchType harus "exact" atau "pattern".' });
  }

  pattern = pattern.trim().toLowerCase();

  try {
    const newLink = await BlockedLink.create({
      pattern,
      matchType,
      reason: reason || '',
      addedBy: req.user._id,
    });

    invalidateCache();

    res.status(201).json({ message: 'Link berhasil diblokir.', link: newLink });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Pattern ini sudah ada di daftar blokir.' });
    }
    throw err;
  }
});

router.delete('/:id', authRequired, requireRole('dev', 'mod'), async (req, res) => {
  await BlockedLink.findByIdAndDelete(req.params.id);
  invalidateCache();
  res.json({ message: 'Pattern berhasil dihapus dari daftar blokir.' });
});

module.exports = router;
