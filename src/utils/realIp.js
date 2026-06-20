function getRealIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && !first.startsWith('10.') && !first.startsWith('172.') && !first.startsWith('192.168.')) {
      return first;
    }
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

module.exports = { getRealIp };
