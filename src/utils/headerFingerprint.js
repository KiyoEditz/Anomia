const REQUIRED_BROWSER_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
];

const SEC_FETCH_HEADERS = [
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
];

const analyzeHeaderFingerprint = (headers) => {
  const issues = [];

  const missingRequired = REQUIRED_BROWSER_HEADERS.filter(h => !headers[h]);
  if (missingRequired.length > 0) {
    issues.push(`missing_headers: ${missingRequired.join(', ')}`);
  }

  const accept = headers['accept'] || '';
  if (accept === '*/*' || accept === '') {
    issues.push('generic_accept');
  }

  if (!headers['accept-language']) {
    issues.push('missing_accept_language');
  }

  const hasSecFetch = SEC_FETCH_HEADERS.some(h => headers[h]);
  if (!hasSecFetch) {
    issues.push('missing_sec_fetch');
  }

  return {
    isLikelyBot: issues.length >= 2,
    issues,
  };
};

module.exports = { analyzeHeaderFingerprint };
