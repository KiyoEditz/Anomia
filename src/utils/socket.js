const { Server } = require('socket.io');

let io = null;
const userSockets = new Map(); // userId string -> Set of socketIds

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId || socket.handshake.auth?.userId;

    if (userId) {
      socket.join(`user_${userId}`);
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      console.log(`User connected via socket: ${userId} (socket.id: ${socket.id})`);
    }

    socket.on('register', (data) => {
      const regUserId = data?.userId;
      if (regUserId) {
        socket.join(`user_${regUserId}`);
        if (!userSockets.has(regUserId)) {
          userSockets.set(regUserId, new Set());
        }
        userSockets.get(regUserId).add(socket.id);
        console.log(`User registered socket event: ${regUserId} (socket.id: ${socket.id})`);
      }
    });

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
