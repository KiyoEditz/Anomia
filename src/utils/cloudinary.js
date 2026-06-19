const cloudinary = require('../config/cloudinary');

function uploadBuffer(buffer, { folder, resourceType = 'auto', moderation, notificationUrl, ...extraOptions } = {}) {
  return new Promise((resolve, reject) => {
    const options = { folder, resource_type: resourceType, ...extraOptions };
    if (moderation) options.moderation = moderation;
    if (notificationUrl) options.notification_url = notificationUrl;

    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function destroyAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (e) {
    console.error('Cloudinary destroy gagal:', publicId, e.message);
  }
}

module.exports = { uploadBuffer, destroyAsset };
