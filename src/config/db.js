const mongoose = require('mongoose');
const dns = require('dns');

if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI belum di-set di .env');
  }
  await mongoose.connect(uri);
  console.log('MongoDB Atlas terhubung');
}

module.exports = connectDB;
