require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const postRoutes = require('./routes/post.routes');
const tagRoutes = require('./routes/tag.routes');
const notificationRoutes = require('./routes/notification.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();
const server = require('http').createServer(app);
const { initSocket } = require('./utils/socket');
initSocket(server);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'Anomia API', status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Anomia running on http://localhost:${PORT}`));
});
