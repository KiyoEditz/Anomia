const Notification = require('../models/Notification');
const BroadcastRead = require('../models/BroadcastRead');
const User = require('../models/User');
const { createNotification } = require('../utils/notification');

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({
      $or: [
        { recipientId: req.userId },
        { isBroadcast: true },
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get read markers for broadcast notifications on this page
    const broadcastIds = notifications.filter((n) => n.isBroadcast).map((n) => n._id);
    const reads = await BroadcastRead.find({
      userId: req.userId,
      broadcastId: { $in: broadcastIds },
    });
    const readBroadcastSet = new Set(reads.map((r) => r.broadcastId.toString()));

    const results = notifications.map((notif) => {
      const json = notif.toJSON();
      if (json.isBroadcast) {
        json.isRead = readBroadcastSet.has(json._id.toString());
      }
      return json;
    });

    res.json({ notifications: results, page });
  } catch (e) {
    next(e);
  }
};

exports.unreadCount = async (req, res, next) => {
  try {
    const directUnread = await Notification.countDocuments({ recipientId: req.userId, isRead: false });

    // Count unread broadcast notifications
    const broadcasts = await Notification.find({ isBroadcast: true }).select('_id');
    const broadcastIds = broadcasts.map((b) => b._id);
    const readsCount = await BroadcastRead.countDocuments({
      userId: req.userId,
      broadcastId: { $in: broadcastIds },
    });
    const broadcastUnread = Math.max(0, broadcastIds.length - readsCount);

    res.json({ unreadCount: directUnread + broadcastUnread });
  } catch (e) {
    next(e);
  }
};

exports.read = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });

    if (notification.isBroadcast) {
      await BroadcastRead.updateOne(
        { userId: req.userId, broadcastId: notification._id },
        { $set: { readAt: new Date() } },
        { upsert: true }
      );
    } else {
      if (!notification.recipientId.equals(req.userId)) {
        return res.status(403).json({ error: 'Akses ditolak' });
      }
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.readAll = async (req, res, next) => {
  try {
    // 1. Mark all direct notifications as read
    await Notification.updateMany(
      { recipientId: req.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // 2. Mark all broadcast notifications as read
    const broadcasts = await Notification.find({ isBroadcast: true }).select('_id');
    const broadcastIds = broadcasts.map((b) => b._id);

    const reads = await BroadcastRead.find({
      userId: req.userId,
      broadcastId: { $in: broadcastIds },
    }).select('broadcastId');
    const readIdsSet = new Set(reads.map((r) => r.broadcastId.toString()));
    const unreadBroadcastIds = broadcastIds.filter((id) => !readIdsSet.has(id.toString()));

    if (unreadBroadcastIds.length > 0) {
      const docsToInsert = unreadBroadcastIds.map((id) => ({
        userId: req.userId,
        broadcastId: id,
      }));
      await BroadcastRead.insertMany(docsToInsert, { ordered: false }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });

    if (notification.isBroadcast) {
      return res.status(400).json({ error: 'Tidak dapat menghapus notifikasi broadcast global' });
    }

    if (!notification.recipientId.equals(req.userId)) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    await notification.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.createAdminNotification = async (req, res, next) => {
  try {
    const { recipientId, type, message, deepLink } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Pesan wajib diisi' });
    }

    const isBroadcast = !recipientId;
    const notification = await createNotification({
      recipientId: isBroadcast ? null : recipientId,
      senderId: null, // sent by system/admin
      type: type || (isBroadcast ? 'system' : 'admin'),
      message,
      deepLink,
      isBroadcast,
    });

    res.status(201).json({ notification });
  } catch (e) {
    next(e);
  }
};
