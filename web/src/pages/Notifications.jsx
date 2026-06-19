import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import api from '../api';

function formatRelativeTime(dateStr) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now - past;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return 'Kemarin';
  return `${diffDays} hari lalu`;
}

export default function Notifications() {
  const { setUnreadCount, socket } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  async function fetchNotifications(pageNum = 1, append = false) {
    setLoading(true);
    try {
      const r = await api.get(`/notifications?page=${pageNum}`);
      const newNotifs = r.data.notifications || [];
      if (newNotifs.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      if (append) {
        setNotifications((prev) => [...prev, ...newNotifs]);
      } else {
        setNotifications(newNotifs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications(1, false);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    };

    socket.on('new_notification', handleNewNotification);

    return () => {
      socket.off('new_notification', handleNewNotification);
    };
  }, [socket]);

  async function handleMarkAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleNotifClick(notif) {
    if (!notif.isRead) {
      try {
        await api.patch(`/notifications/${notif._id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error(e);
      }
    }
    if (notif.deepLink) {
      let targetPath = notif.deepLink;
      if (targetPath.startsWith('/post/')) {
        targetPath = targetPath.replace('/post/', '/p/');
      }
      navigate(targetPath);
    }
  }

  async function handleDeleteNotif(e, id) {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      const r = await api.get('/notifications/unread-count');
      setUnreadCount(r.data.unreadCount || 0);
    } catch (err) {
      console.error(err);
    }
  }

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  }

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>Notifikasi</h2>
        {notifications.some((n) => !n.isRead) && (
          <button className="btn-text" onClick={handleMarkAllRead}>
            Tandai semua dibaca
          </button>
        )}
      </div>

      {notifications.length === 0 && !loading && (
        <div className="center muted">Belum ada notifikasi.</div>
      )}

      <div className="notifications-list">
        {notifications.map((n) => {
          const isModeration = n.type.startsWith('moderation_');
          let notifClass = `notification-item ${n.isRead ? 'read' : 'unread'}`;
          if (isModeration) {
            notifClass += ' moderation-alert';
          }

          return (
            <div
              key={n._id}
              className={notifClass}
              onClick={() => handleNotifClick(n)}
            >
              <div className="notification-icon-container">
                {isModeration ? (
                  <span className="moderation-icon">⚠️</span>
                ) : (n.type === 'system' || n.type === 'admin') ? (
                  <div className="avatar-placeholder brand-notif">A</div>
                ) : n.senderAvatar ? (
                  <img src={n.senderAvatar} alt="avatar" className="avatar" />
                ) : (
                  <div className="avatar-placeholder">
                    {n.senderUsername ? n.senderUsername[0].toUpperCase() : 'U'}
                  </div>
                )}
              </div>

              <div className="notification-content">
                <p className="notification-message">
                  {n.senderUsername && (
                    <strong style={{ marginRight: 4 }}>@{n.senderUsername}</strong>
                  )}
                  {n.message}
                </p>
                <span className="notification-time">{formatRelativeTime(n.createdAt)}</span>
              </div>

              <div className="notification-actions">
                {n.refMediaPreview && (
                  <img src={n.refMediaPreview} className="media-preview" alt="preview" />
                )}
                {!n.isBroadcast && (
                  <button
                    className="delete-notif-btn"
                    onClick={(e) => handleDeleteNotif(e, n._id)}
                    title="Hapus"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && !loading && (
        <button className="load-more-btn" onClick={loadMore}>
          Muat Lebih Banyak
        </button>
      )}

      {loading && <div className="center">Memuat...</div>}
    </div>
  );
}
