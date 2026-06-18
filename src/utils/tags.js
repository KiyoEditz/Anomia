const Tag = require('../models/Tag');

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveTagSlugs(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const norm = [...new Set(slugs.map((s) => slugify(s)).filter(Boolean))];
  if (norm.length === 0) return [];
  const found = await Tag.find({ slug: { $in: norm } }).select('_id slug');
  return found;
}

async function upsertTags(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (const it of items) {
    const name = (it.name || '').trim();
    const category = it.category;
    if (!name || !category) continue;
    if (!Tag.schema.path('category').enumValues.includes(category)) continue;
    const slug = slugify(name);
    if (!slug) continue;
    let tag = await Tag.findOne({ slug });
    if (!tag) {
      tag = await Tag.create({ name, slug, category });
    }
    out.push(tag);
  }
  return out;
}

function parseTagQuery(qs) {
  const include = [];
  const exclude = [];
  const re = /(-?)tag:"([^"]+)"/g;
  let m;
  while ((m = re.exec(qs || '')) !== null) {
    (m[1] === '-' ? exclude : include).push(slugify(m[2]));
  }
  return { include: include.filter(Boolean), exclude: exclude.filter(Boolean) };
}

function splitCsv(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => slugify(s))
    .filter(Boolean);
}

module.exports = { slugify, resolveTagSlugs, upsertTags, parseTagQuery, splitCsv };
