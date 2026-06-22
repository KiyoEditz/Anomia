const honeypotCheck = (req, res, next) => {
  const honeypotValue = req.body._hp;

  if (honeypotValue && honeypotValue.trim().length > 0) {
    console.warn('[Honeypot] Bot terdeteksi:', {
      ip: req.ip,
      path: req.path,
      time: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Berhasil.' });
  }

  next();
};

module.exports = honeypotCheck;
