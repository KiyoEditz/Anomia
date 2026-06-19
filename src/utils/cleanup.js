const Notification = require('../models/Notification');
const BroadcastRead = require('../models/BroadcastRead');

async function cleanupOldNotifications() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // 1. Delete direct notifications that are read and older than 30 days
    const resultDirect = await Notification.deleteMany({
      isBroadcast: false,
      isRead: true,
      readAt: { $lt: thirtyDaysAgo }
    });
    
    // 2. Delete broadcast reads older than 30 days
    const resultBroadcastReads = await BroadcastRead.deleteMany({
      readAt: { $lt: thirtyDaysAgo }
    });

    console.log(`[Cleanup] Deleted ${resultDirect.deletedCount} old direct notifications.`);
    console.log(`[Cleanup] Deleted ${resultBroadcastReads.deletedCount} old broadcast read markers.`);
  } catch (error) {
    console.error('[Cleanup] Error running notification cleanup:', error);
  }
}

function startCleanupJob() {
  // Run on startup after a 5-second delay to ensure database connection is established
  setTimeout(cleanupOldNotifications, 5000);

  // Run every 24 hours
  setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000);
}

module.exports = {
  cleanupOldNotifications,
  startCleanupJob
};
