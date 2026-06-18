const multer = require('multer');

const ALLOWED_MIME = /^(image|video)\//;

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      const err = new Error('File harus berupa gambar atau video');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

exports.uploadSingle = (field) => upload.single(field);
