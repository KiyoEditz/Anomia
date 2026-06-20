import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import api from '../api';
import { IconNotification, IconShield, IconTrash } from '../components/Icons.jsx';

function formatRelativeTime(dateStr) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now - past;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Baru saja';
  if (diffMins < 60) return `${diffMins}m lalu`;
  if (diffHours < 24) return `${diffHours}j lalu`;
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

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="notifications-container">
      {/* Header */}
      <div className="notifications-header">
        <h2>Notifikasi</h2>
        {hasUnread && (
          <button className="profile-btn" style={{ fontSize: '13px', padding: '6px 12px' }} onClick={handleMarkAllRead}>
            Tandai semua dibaca
          </button>
        )}
      </div>

      {notifications.length === 0 && !loading && (
        <div className="center">
          <IconNotification size={48} className="muted" style={{ marginBottom: 16 }} />
          <h3>Belum ada notifikasi</h3>
          <p style={{ marginTop: 8 }}>Notifikasi seperti Like, Komentar, Repost, atau sebutan Anda akan muncul di sini.</p>
        </div>
      )}

      {/* Notifications List */}
      <div className="notifications-list">
        {notifications.map((n) => {
          const isModeration = n.type.startsWith('moderation_');
          const isSystem = n.type === 'system' || n.type === 'admin';
          
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
              {/* Unread Accent Dot */}
              {!n.isRead && <div className="notification-dot"></div>}

              {/* Notification Icon/Avatar */}
              <div className="notification-icon-container">
                {isModeration ? (
                  <div className="avatar-placeholder" style={{ background: 'rgba(224, 92, 92, 0.12)', color: 'var(--color-danger)', border: '1px solid rgba(224, 92, 92, 0.3)' }}>
                    ⚠️
                  </div>
                ) : isSystem ? (
                  <div className="avatar-placeholder" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                    📢
                  </div>
                ) : n.senderAvatar ? (
                  <img src={n.senderAvatar} alt="avatar" className="avatar-img" />
                ) : (
                  <div className="avatar-placeholder">
                    {n.senderUsername ? n.senderUsername[0].toUpperCase() : 'U'}
                  </div>
                )}
              </div>

              {/* Message Details */}
              <div className="notification-content">
                <p className="notification-message">
                  {n.senderUsername && !isSystem && !isModeration && (
                    <strong style={{ marginRight: 4 }}>@{n.senderUsername}</strong>
                  )}
                  {n.message}
                </p>
                <span className="notification-time">{formatRelativeTime(n.createdAt)}</span>
              </div>

              {/* Actions & Preview */}
              <div className="notification-actions" onClick={(e) => e.stopPropagation()}>
                {n.refMediaPreview && (
                  <img src={n.refMediaPreview} className="notification-media-preview" alt="preview" />
                )}
                {!n.isBroadcast && (
                  <button
                    className="delete-notif-btn"
                    onClick={(e) => handleDeleteNotif(e, n._id)}
                    title="Hapus notifikasi"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && !loading && (
        <button className="load-more-btn" onClick={loadMore}>
          Muat lebih banyak
        </button>
      )}

      {loading && <div className="center">Memuat notifikasi...</div>}
    </div>
  );
}
