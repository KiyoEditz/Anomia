const { Server } = require('socket.io');
const socketAuth = require('../middleware/socketAuth');
const { ALLOWED_ORIGINS } = require('../config/cors');

let io = null;
const userSockets = new Map(); // userId string -> Set of socketIds

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Pasang middleware auth SEBELUM handler apapun — hanya koneksi terverifikasi
  // yang boleh lanjut. userId tidak lagi dipercaya dari query/payload client.
  io.use(socketAuth);

  io.on('connection', (socket) => {
    // Identitas diambil dari socket.user yang sudah diverifikasi DB di middleware.
    const userId = socket.user._id;

    socket.join(`user_${userId}`);
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    console.log(
      `[Socket] ${socket.user.username} (${socket.user.role}) terhubung (socket.id: ${socket.id})`
    );

    socket.on('disconnect', () => {
      // Find and remove from map
      for (const [uid, sockets] of userSockets.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(uid);
          }
          console.log(`User disconnected socket: ${uid} (socket.id: ${socket.id})`);
          break;
        }
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, data) {
  if (io) {
    const userIdStr = userId.toString();
    io.to(`user_${userIdStr}`).emit(event, data);
  }
}

function emitBroadcast(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitBroadcast,
};
