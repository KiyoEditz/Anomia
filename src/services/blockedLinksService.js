const BlockedLink = require('../models/BlockedLink');
const { normalizeForLinkCheck } = require('../utils/linkFilter');

let cachedRules = [];
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000;

const refreshCache = async () => {
  const docs = await BlockedLink.find().select('pattern matchType').lean();
  cachedRules = docs.map(d => ({
    pattern: d.pattern.toLowerCase(),
    matchType: d.matchType,
  }));
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
};

const getRules = async () => {
  if (Date.now() > cacheExpiresAt) {
    await refreshCache();
  }
  return cachedRules;
};

const patternToRegex = (pattern) => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
};

const matchesRule = (normalizedContent, rule) => {
  if (rule.matchType === 'pattern') {
    return patternToRegex(rule.pattern).test(normalizedContent);
  }
  return normalizedContent.includes(rule.pattern);
};

const containsBlockedLink = async (content) => {
  if (!content) return { blocked: false };

  const normalized = normalizeForLinkCheck(content);
  const rules = await getRules();

  const matched = rules.find(rule => matchesRule(normalized, rule));

  return matched
    ? { blocked: true, matchedPattern: matched.pattern }
    : { blocked: false };
};

const invalidateCache = () => {
  cacheExpiresAt = 0;
};

module.exports = { containsBlockedLink, invalidateCache };
