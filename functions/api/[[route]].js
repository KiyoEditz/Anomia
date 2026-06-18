import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { Pool } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

const app = new Hono().basePath('/api');

// Global CORS Middleware
app.use('*', cors());

// Fungsi Hash Password bawaan Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// FIX: Pindahkan instansiasi ke dalam Context Request agar I/O terisolasi dengan aman
app.use('*', async (c, next) => {
  const databaseUrl = c.env.DATABASE_URL;
  if (!databaseUrl) {
    return c.json({ error: "DATABASE_URL belum terdaftar di Environment Cloudflare!" }, 500);
  }

  // Membuat koneksi unik khusus untuk request yang sedang berjalan saat ini
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool);
  const localPrisma = new PrismaClient({ adapter });

  // Simpan ke dalam objek context Hono (c)
  c.set('prisma', localPrisma);

  try {
    await next();
  } finally {
    // Opsional: Memastikan koneksi pool ditutup dengan bersih setelah request selesai
    c.executionCtx.waitUntil(pool.end());
  }
});

// Ganti fungsi getPrisma lama Anda dengan trik pendeteksi objek context ini:
function getPrisma(ctx) {
  // Jika parameter yang dikirim adalah objek context Hono yang memiliki fungsi .get
  if (ctx && typeof ctx.get === 'function') {
    return ctx.get('prisma');
  }
  // Jika tidak, ambil dari context global aplikasi
  return app.context.prisma;
}

// Pseudonyms for Anonymous Whisper posts
const ANONYMOUS_PSEUDONYMS = [
  'Pena Misterius',
  'Siluet Malam',
  'Penjelajah Sunyi',
  'Gema Angin',
  'Bayang Senja',
  'Bisikan Malam',
  'Pembaca Sandi',
  'Pemikir Bebas',
  'Arwah Digital',
  'Kabut Pagi'
];

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

// --- Helper Functions ---

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function userToPublicJSON(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    bannerUrl: user.bannerUrl || '',
    followersCount: user.followers ? user.followers.length : 0,
    followingCount: user.following ? user.following.length : 0,
    createdAt: user.createdAt,
  };
}

function anonymizePost(post, currentUserId) {
  if (!post) return null;
  const isMine = currentUserId ? String(post.authorId) === String(currentUserId) : false;

  return {
    _id: post.id,
    id: post.id,
    content: post.content,
    embedUrl: post.embedUrl || '',
    isAnonymous: post.isAnonymous,
    anonymousName: post.anonymousName || '',
    mood: post.mood || 'default',
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    tags: post.tags || [],
    likes: (post.likedBy || []).map((u) => u.id),
    commentsCount: post._count ? post._count.comments : 0,
    isMine,
    author: post.isAnonymous ? {
      _id: 'anonim',
      id: 'anonim',
      username: 'anonim',
      displayName: post.anonymousName || 'Bisikan Misterius',
      avatarUrl: '',
      bio: 'Akun anonim di Anonimbuz.'
    } : {
      _id: post.author.id,
      id: post.author.id,
      username: post.author.username,
      displayName: post.author.displayName || post.author.username,
      avatarUrl: post.author.avatarUrl || '',
      bio: post.author.bio || ''
    }
  };
}

async function upsertTags(tagsList, prismaInstance) {
  if (!Array.isArray(tagsList) || tagsList.length === 0) return [];
  const results = [];
  for (const it of tagsList) {
    const name = (it.name || '').trim();
    const category = it.category;
    if (!name || !category) continue;
    if (!CATEGORIES.includes(category)) continue;

    const slug = slugify(name);
    if (!slug) continue;

    let tag = await prismaInstance.tag.findUnique({ where: { slug } });
    if (!tag) {
      tag = await prismaInstance.tag.create({
        data: { name, slug, category }
      });
    }
    results.push(tag);
  }
  return results;
}

// Cloudflare Workers Native Cloudinary Client via Fetch
async function uploadToCloudinary(file, folder, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Konfigurasi Cloudinary tidak lengkap di environment');
  }

  const timestamp = Math.round(new Date().getTime() / 1000);
  const signatureStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;

  // SHA-1 signature generation using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureStr);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errObj = await res.json();
    throw new Error(errObj.error?.message || 'Gagal mengunggah ke Cloudinary');
  }

  const resData = await res.json();
  return {
    secure_url: resData.secure_url,
    public_id: resData.public_id
  };
}

async function destroyCloudinaryAsset(publicId, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || !publicId) return;

  const timestamp = Math.round(new Date().getTime() / 1000);
  const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureStr);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData
    });
  } catch (e) {
    console.error('Cloudinary destroy failed:', e);
  }
}

// --- Middlewares ---

const authRequired = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Token tidak ditemukan' }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    // FIX: Membaca .id atau .userId jika .sub bernilai kosong
    const targetId = payload.sub || payload.id || payload.userId;
    if (!targetId) {
      return c.json({ error: 'Struktur payload token rusak' }, 401);
    }
    c.set('userId', targetId);
    await next();
  } catch (e) {
    return c.json({ error: 'Token tidak valid' }, 401);
  }
};

const authOptional = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = await verify(token, c.env.JWT_SECRET);
      const targetId = payload.sub || payload.id || payload.userId;
      if (targetId) {
        c.set('userId', targetId);
      }
    } catch (e) { }
  }
  await next();
};

// --- Routes ---

// JWT Signing Helper
async function signToken(userId, secret) {
  return await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, secret);
}

// Auth Routes
app.post('/auth/register', async (c) => {
  const prismaInstance = getPrisma(c);
  const { username, password, displayName } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'username dan password wajib diisi' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'password minimal 6 karakter' }, 400);
  }

  const existing = await prismaInstance.user.findUnique({ where: { username } });
  if (existing) {
    return c.json({ error: 'username sudah dipakai' }, 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await prismaInstance.user.create({
    data: {
      username,
      passwordHash,
      displayName: displayName || username,
    }
  });

  // FIX: Membuat token menggunakan fungsi 'sign' Hono asli dengan parameter lengkap
  const jwtPayload = {
    sub: user.id,
    id: user.id,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // Berlaku 7 hari
  };
  const token = await sign(jwtPayload, c.env.JWT_SECRET);

  return c.json({ token, user: userToPublicJSON(user) }, 201);
});

app.post('/auth/login', async (c) => {
  const prismaInstance = getPrisma(c);
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'username dan password wajib diisi' }, 400);
  }

  const user = await prismaInstance.user.findUnique({
    where: { username },
    include: { followers: true, following: true }
  });
  if (!user) {
    return c.json({ error: 'username atau password salah' }, 401);
  }

  const incomingHash = await hashPassword(password);
  const isPasswordValid = (incomingHash === user.passwordHash);
  if (!isPasswordValid) {
    return c.json({ error: 'username atau password salah' }, 401);
  }

  // FIX: Sinkronisasi pembuatan token menggunakan format payload yang sama dengan Register
  const jwtPayload = {
    sub: user.id,
    id: user.id,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // Berlaku 7 hari
  };
  const token = await sign(jwtPayload, c.env.JWT_SECRET);

  return c.json({ token, user: userToPublicJSON(user) });
});

app.get('/auth/me', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const user = await prismaInstance.user.findUnique({
    where: { id: userId },
    include: { followers: true, following: true }
  });
  if (!user) {
    return c.json({ error: 'User tidak ditemukan' }, 404);
  }
  return c.json({ user: userToPublicJSON(user) });
});

// User Routes
app.get('/users/:username', async (c) => {
  const prismaInstance = getPrisma(c);
  const user = await prismaInstance.user.findUnique({
    where: { username: c.req.param('username') },
    include: { followers: true, following: true }
  });
  if (!user) {
    return c.json({ error: 'User tidak ditemukan' }, 404);
  }
  return c.json({ user: userToPublicJSON(user) });
});

app.patch('/users/me', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const { displayName, bio } = await c.req.json();
  const update = {};
  if (displayName !== undefined) update.displayName = String(displayName).slice(0, 50);
  if (bio !== undefined) update.bio = String(bio).slice(0, 280);

  const user = await prismaInstance.user.update({
    where: { id: userId },
    data: update,
    include: { followers: true, following: true }
  });
  return c.json({ user: userToPublicJSON(user) });
});

app.post('/users/me/avatar', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file) {
    return c.json({ error: 'File tidak ditemukan' }, 400);
  }

  const user = await prismaInstance.user.findUnique({ where: { id: userId } });
  const oldPublicId = user.avatarPublicId;

  try {
    const result = await uploadToCloudinary(file, 'anomia/avatars', c.env);
    const updated = await prismaInstance.user.update({
      where: { id: userId },
      data: {
        avatarUrl: result.secure_url,
        avatarPublicId: result.public_id
      },
      include: { followers: true, following: true }
    });

    if (oldPublicId) await destroyCloudinaryAsset(oldPublicId, c.env);
    return c.json({ user: userToPublicJSON(updated) });
  } catch (e) {
    return c.json({ error: e.message || 'Upload gagal' }, 400);
  }
});

app.post('/users/me/banner', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file) {
    return c.json({ error: 'File tidak ditemukan' }, 400);
  }

  const user = await prismaInstance.user.findUnique({ where: { id: userId } });
  const oldPublicId = user.bannerPublicId;

  try {
    const result = await uploadToCloudinary(file, 'anomia/banners', c.env);
    const updated = await prismaInstance.user.update({
      where: { id: userId },
      data: {
        bannerUrl: result.secure_url,
        bannerPublicId: result.public_id
      },
      include: { followers: true, following: true }
    });

    if (oldPublicId) await destroyCloudinaryAsset(oldPublicId, c.env);
    return c.json({ user: userToPublicJSON(updated) });
  } catch (e) {
    return c.json({ error: e.message || 'Upload gagal' }, 400);
  }
});

app.post('/users/:username/follow', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const target = await prismaInstance.user.findUnique({
    where: { username: c.req.param('username') }
  });
  if (!target) return c.json({ error: 'User tidak ditemukan' }, 404);
  if (target.id === userId) {
    return c.json({ error: 'Tidak bisa follow diri sendiri' }, 400);
  }

  await prismaInstance.user.update({
    where: { id: userId },
    data: {
      following: { connect: { id: target.id } }
    }
  });
  return c.json({ ok: true });
});

app.delete('/users/:username/follow', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const target = await prismaInstance.user.findUnique({
    where: { username: c.req.param('username') }
  });
  if (!target) return c.json({ error: 'User tidak ditemukan' }, 404);

  await prismaInstance.user.update({
    where: { id: userId },
    data: {
      following: { disconnect: { id: target.id } }
    }
  });
  return c.json({ ok: true });
});

// Post Routes
app.post('/posts', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const { content, embedUrl, isAnonymous, mood } = await c.req.json();
  let { tags } = await c.req.json().catch(() => ({}));
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = []; }
  }

  if (!content || !content.trim()) {
    return c.json({ error: 'content tidak boleh kosong' }, 400);
  }

  const tagDocs = Array.isArray(tags) ? await upsertTags(tags, prismaInstance) : [];
  const anonName = isAnonymous
    ? ANONYMOUS_PSEUDONYMS[Math.floor(Math.random() * ANONYMOUS_PSEUDONYMS.length)]
    : '';

  const post = await prismaInstance.post.create({
    data: {
      authorId: userId,
      content,
      embedUrl: embedUrl || '',
      isAnonymous: !!isAnonymous,
      anonymousName: anonName,
      mood: mood || 'default',
      tags: {
        connect: tagDocs.map((t) => ({ id: t.id }))
      }
    },
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });

  // Increment tag usage count
  if (tagDocs.length > 0) {
    await prismaInstance.tag.updateMany({
      where: { id: { in: tagDocs.map((t) => t.id) } },
      data: { usageCount: { increment: 1 } }
    });
  }

  return c.json({ post: anonymizePost(post, userId) }, 201);
});

// Helper to filter tags for lists
function buildPrismaTagQuery(tagsCsv, excludeCsvParam, searchQ) {
  const parseTagQuery = (qs) => {
    const include = [];
    const exclude = [];
    const re = /(-?)tag:"([^"]+)"/g;
    let m;
    while ((m = re.exec(qs || '')) !== null) {
      (m[1] === '-' ? exclude : include).push(slugify(m[2]));
    }
    return { include: include.filter(Boolean), exclude: exclude.filter(Boolean) };
  };

  const fromQuery = parseTagQuery(searchQ);
  const includeCsv = (tagsCsv || '').split(',').map((s) => slugify(s)).filter(Boolean);
  const excludeCsv = (excludeCsvParam || '').split(',').map((s) => slugify(s)).filter(Boolean);

  const include = [...new Set([...includeCsv, ...fromQuery.include])];
  const exclude = [...new Set([...excludeCsv, ...fromQuery.exclude])];

  const andConditions = [];
  if (include.length > 0) {
    include.forEach((slug) => {
      andConditions.push({ tags: { some: { slug } } });
    });
  }
  if (exclude.length > 0) {
    andConditions.push({ tags: { none: { slug: { in: exclude } } } });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

app.get('/posts', authOptional, async (c) => {
  const prismaInstance = getPrisma(c);
  const currentUserId = c.get('userId');
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = 20;

  const tagFilter = buildPrismaTagQuery(
    c.req.query('tags'),
    c.req.query('exclude'),
    c.req.query('q')
  );

  const posts = await prismaInstance.post.findMany({
    where: tagFilter,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });

  const anonymized = posts.map((p) => anonymizePost(p, currentUserId));
  return c.json({ posts: anonymized, page });
});

app.get('/posts/feed', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');

  const me = await prismaInstance.user.findUnique({
    where: { id: userId },
    select: { following: { select: { id: true } } }
  });
  const followingIds = me.following.map((u) => u.id);
  const authorIds = [...followingIds, userId];

  const tagFilter = buildPrismaTagQuery(
    c.req.query('tags'),
    c.req.query('exclude'),
    c.req.query('q')
  );

  const posts = await prismaInstance.post.findMany({
    where: {
      ...tagFilter,
      authorId: { in: authorIds }
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });

  const anonymized = posts.map((p) => anonymizePost(p, userId));
  return c.json({ posts: anonymized });
});

app.get('/posts/user/:username', authOptional, async (c) => {
  const prismaInstance = getPrisma(c);
  const currentUserId = c.get('userId');
  const user = await prismaInstance.user.findUnique({
    where: { username: c.req.param('username') }
  });
  if (!user) return c.json({ error: 'User tidak ditemukan' }, 404);

  const query = { authorId: user.id };
  if (user.id !== currentUserId) {
    query.isAnonymous = false;
  }

  const posts = await prismaInstance.post.findMany({
    where: query,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });

  const anonymized = posts.map((p) => anonymizePost(p, currentUserId));
  return c.json({ posts: anonymized });
});

app.get('/posts/:id', authOptional, async (c) => {
  const prismaInstance = getPrisma(c);
  const currentUserId = c.get('userId');
  const post = await prismaInstance.post.findUnique({
    where: { id: c.req.param('id') },
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });
  if (!post) return c.json({ error: 'Post tidak ditemukan' }, 404);
  return c.json({ post: anonymizePost(post, currentUserId) });
});

app.post('/posts/:id/like', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const postId = c.req.param('id');

  const post = await prismaInstance.post.findUnique({ where: { id: postId } });
  if (!post) return c.json({ error: 'Post tidak ditemukan' }, 404);

  await prismaInstance.post.update({
    where: { id: postId },
    data: {
      likedBy: { connect: { id: userId } }
    }
  });
  return c.json({ ok: true });
});

app.delete('/posts/:id/like', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const postId = c.req.param('id');

  const post = await prismaInstance.post.findUnique({ where: { id: postId } });
  if (!post) return c.json({ error: 'Post tidak ditemukan' }, 404);

  await prismaInstance.post.update({
    where: { id: postId },
    data: {
      likedBy: { disconnect: { id: userId } }
    }
  });
  return c.json({ ok: true });
});

app.delete('/posts/:id', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const postId = c.req.param('id');

  const post = await prismaInstance.post.findUnique({
    where: { id: postId },
    include: { tags: true }
  });
  if (!post) return c.json({ error: 'Post tidak ditemukan' }, 404);
  if (post.authorId !== userId) {
    return c.json({ error: 'Bukan post milik Anda' }, 403);
  }

  const tagIds = post.tags.map((t) => t.id);

  // Delete comments and the post
  await prismaInstance.post.delete({ where: { id: postId } });

  // Decrement tag usages
  if (tagIds.length > 0) {
    await prismaInstance.tag.updateMany({
      where: { id: { in: tagIds } },
      data: { usageCount: { decrement: 1 } }
    });
  }

  return c.json({ ok: true });
});

// Comment Routes
app.get('/posts/:id/comments', async (c) => {
  const prismaInstance = getPrisma(c);
  const comments = await prismaInstance.comment.findMany({
    where: { postId: c.req.param('id') },
    orderBy: { createdAt: 'asc' },
    include: { author: true }
  });
  return c.json({ comments });
});

app.post('/posts/:id/comments', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const postId = c.req.param('id');
  const { content } = await c.req.json();

  if (!content || !content.trim()) {
    return c.json({ error: 'content tidak boleh kosong' }, 400);
  }

  const post = await prismaInstance.post.findUnique({ where: { id: postId } });
  if (!post) return c.json({ error: 'Post tidak ditemukan' }, 404);

  const comment = await prismaInstance.comment.create({
    data: {
      content,
      postId,
      authorId: userId
    },
    include: { author: true }
  });

  return c.json({ comment }, 201);
});

app.delete('/posts/:id/comments/:commentId', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const userId = c.get('userId');
  const commentId = c.req.param('commentId');

  const comment = await prismaInstance.comment.findUnique({ where: { id: commentId } });
  if (!comment) return c.json({ error: 'Comment tidak ditemukan' }, 404);
  if (comment.authorId !== userId) {
    return c.json({ error: 'Bukan comment milik Anda' }, 403);
  }
  if (comment.postId !== c.req.param('id')) {
    return c.json({ error: 'Comment tidak cocok dengan post' }, 400);
  }

  await prismaInstance.comment.delete({ where: { id: commentId } });
  return c.json({ ok: true });
});

// Tag Routes
app.get('/tags/categories', (c) => {
  return c.json({ categories: CATEGORIES });
});

app.get('/tags', async (c) => {
  const prismaInstance = getPrisma(c);
  const category = c.req.query('category');
  const search = c.req.query('search');

  const where = {};
  if (category) where.category = category;
  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive'
    };
  }

  const tags = await prismaInstance.tag.findMany({
    where,
    orderBy: [
      { usageCount: 'desc' },
      { name: 'asc' }
    ],
    take: 20
  });
  return c.json({ tags });
});

app.get('/tags/popular', async (c) => {
  const prismaInstance = getPrisma(c);
  const tags = await prismaInstance.tag.findMany({
    where: { usageCount: { gt: 0 } },
    orderBy: { usageCount: 'desc' },
    take: 30
  });
  return c.json({ tags });
});

app.get('/tags/:slug', authOptional, async (c) => {
  const prismaInstance = getPrisma(c);
  const currentUserId = c.get('userId');
  const slug = c.req.param('slug').toLowerCase();
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = 20;
  const sort = c.req.query('sort');

  const tag = await prismaInstance.tag.findUnique({ where: { slug } });
  if (!tag) return c.json({ error: 'Tag tidak ditemukan' }, 404);

  const posts = await prismaInstance.post.findMany({
    where: {
      tags: {
        some: { id: tag.id }
      }
    },
    orderBy: sort === 'popular' ? [
      { likedBy: { _count: 'desc' } },
      { createdAt: 'desc' }
    ] : [
      { createdAt: 'desc' }
    ],
    skip: (page - 1) * limit,
    take: limit,
    include: {
      author: true,
      tags: true,
      likedBy: { select: { id: true } },
      _count: { select: { comments: true } }
    }
  });

  const anonymized = posts.map((p) => anonymizePost(p, currentUserId));
  return c.json({ tag, posts: anonymized, page });
});

app.post('/tags', authRequired, async (c) => {
  const prismaInstance = getPrisma(c);
  const { name, category } = await c.req.json();
  if (!name || !category) {
    return c.json({ error: 'name dan category wajib diisi' }, 400);
  }

  const tags = await upsertTags([{ name, category }], prismaInstance);
  if (tags.length === 0) {
    return c.json({ error: 'Gagal membuat tag (cek kategori valid)' }, 400);
  }
  return c.json({ tag: tags[0] }, 201);
});

// Export Cloudflare Pages onRequest handler
export const onRequest = handle(app);
