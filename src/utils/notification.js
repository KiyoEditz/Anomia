const Notification = require('../models/Notification');
const User = require('../models/User');
const { emitToUser, emitBroadcast } = require('./socket');

async function createNotification(data) {
  const {
    recipientId,
    senderId,
    type,
    message,
    deepLink = null,
    refPostId = null,
    refCommentId = null,
    refMediaPreview = null,
    isBroadcast = false,
  } = data;

  // Prevent self-notifications for non-broadcasts
  if (!isBroadcast && recipientId && senderId && recipientId.toString() === senderId.toString()) {
    return null;
  }

  let senderUsername = null;
  let senderAvatar = null;

  if (senderId) {
    const sender = await User.findById(senderId);
    if (sender) {
      senderUsername = sender.username;
      senderAvatar = sender.avatarUrl || null;
    }
  }

  const notification = await Notification.create({
    recipientId: isBroadcast ? null : recipientId,
    senderId,
    senderUsername,
    senderAvatar,
    type,
    message,
    deepLink,
    refPostId,
    refCommentId,
    refMediaPreview,
    isBroadcast,
  });

  const responseData = {
    id: notification._id,
    recipientId: notification.recipientId,
    senderId: notification.senderId,
    senderUsername: notification.senderUsername,
    senderAvatar: notification.senderAvatar,
    type: notification.type,
    message: notification.message,
    deepLink: notification.deepLink,
    refPostId: notification.refPostId,
    refCommentId: notification.refCommentId,
    refMediaPreview: notification.refMediaPreview,
    isRead: notification.isRead,
    isBroadcast: notification.isBroadcast,
    createdAt: notification.createdAt,
  };

  if (isBroadcast) {
    emitBroadcast('new_notification', responseData);
  } else if (recipientId) {
    emitToUser(recipientId, 'new_notification', responseData);
  }

  return notification;
}

module.exports = {
  createNotification,
};
