// Konversi error Mongoose/MongoDB menjadi pesan aman sebelum dikirim ke client.
// Tidak pernah membocorkan nama model, path field, atau struktur schema internal.
function handleMongoError(err) {
  // Duplicate key error (misal username sudah dipakai)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'data';
    const fieldLabel = { username: 'Username', email: 'Email' }[field] || 'Data';
    return { statusCode: 409, message: `${fieldLabel} sudah digunakan.` };
  }

  // Validation error — jangan ekspos nama field/model mentah
  if (err && err.name === 'ValidationError') {
    return { statusCode: 400, message: 'Data yang dikirim tidak valid.' };
  }

  // Cast error (misal ObjectID tidak valid) — jangan sebut "CastError" atau "_id"
  if (err && err.name === 'CastError') {
    return { statusCode: 400, message: 'Data tidak ditemukan.' };
  }

  // Tidak dikenali sebagai error Mongo yang bisa dipetakan.
  return null;
}

module.exports = handleMongoError;
