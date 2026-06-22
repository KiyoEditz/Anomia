const BOT_USER_AGENT_SIGNATURES = [
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'axios',
  'node-fetch',
  'node-http',
  'got/',
  'superagent',
  'postman',
  'insomnia',
  'httpie',
  'java/',
  'okhttp',
  'php/',
  'ruby',
  'go-http-client',
  'libcurl',
  'scrapy',
  'mechanize',
];

const SUSPICIOUS_UA_PATTERNS = [
  /^mozilla\/5\.0$/i,
  /bot|crawler|spider|scraper/i,
];

const isBotUserAgent = (userAgent) => {
  if (!userAgent) return true;

  const ua = userAgent.toLowerCase();

  if (BOT_USER_AGENT_SIGNATURES.some(sig => ua.includes(sig))) return true;
  if (SUSPICIOUS_UA_PATTERNS.some(pattern => pattern.test(userAgent))) return true;

  return false;
};

module.exports = { isBotUserAgent };
