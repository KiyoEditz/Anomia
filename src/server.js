require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const postRoutes = require('./routes/post.routes');
const tagRoutes = require('./routes/tag.routes');
const commentRoutes = require('./routes/comment.routes');
const notificationRoutes = require('./routes/notification.routes');
const webhookRoutes = require('./routes/webhook.routes');
const adminRoutes = require('./routes/admin.routes');
const { ALLOWED_ORIGINS } = require('./config/cors');
const blockSensitiveFiles = require('./middleware/blockSensitiveFiles');
const errorHandler = require('./middleware/errorHandler');

const { globalLimiter } = require('./middleware/ipRateLimiter');

const app = express();

app.set('trust proxy', true);

const server = require('http').createServer(app);
const { initSocket } = require('./utils/socket');
initSocket(server);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(blockSensitiveFiles);
app.use(globalLimiter);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    console.warn(`[CORS] Ditolak dari origin: ${origin}`);
    return callback(new Error(`Origin tidak diizinkan oleh CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: [],
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'Anomia API', status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const { startCleanupJob } = require('./utils/cleanup');

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Anomia running on http://localhost:${PORT}`);
    startCleanupJob();
  });
});
