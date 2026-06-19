const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Kamu tidak memiliki izin untuk melakukan ini.' });
    }

    next();
  };
};

module.exports = requireRole;
