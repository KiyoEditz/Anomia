import { Link } from 'react-router-dom';
import { useState } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import TagPill from './TagPill.jsx';
import BadgeRole from './BadgeRole.jsx';

function Avatar({ user, size = 40 }) {
  const initial = (user.displayName || user.username || '?').charAt(0).toUpperCase();
  if (user.avatarUrl) {
    return <img className="avatar-img" src={user.avatarUrl} alt={user.username} style={{ width: size, height: size }} />;
  }
  return <div className="avatar-placeholder" style={{ width: size, height: size }}>{initial}</div>;
}

export default function PostCard({ post, onDeleted }) {
  const { user } = useAuth();
  const [likes, setLikes] = useState(post.likes || []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');
  const liked = user && likes.some((id) => String(id) === String(user.id));
  const mine = user && post.author && String(post.author._id || post.author.id) === String(user.id);

  async function toggleLike() {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (liked) {
        await api.delete(`/posts/${post._id}/like`);
        setLikes(likes.filter((id) => String(id) !== String(user.id)));
      } else {
        await api.post(`/posts/${post._id}/like`);
        setLikes([...likes, user.id]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus post ini?')) return;
    await api.delete(`/posts/${post._id}`);
    onDeleted && onDeleted(post._id);
  }

  async function handleModerateDelete() {
    if (!reason.trim()) {
      alert('Alasan wajib diisi!');
      return;
    }
    try {
      await api.delete(`/posts/${post._id}/moderate`, { data: { reason } });
      onDeleted && onDeleted(post._id);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus postingan');
    }
  }

  return (
    <article className="card">
      <div className="post-meta">
        <Link to={`/u/${post.author.username}`} className="post-author">
          <Avatar user={post.author} size={36} />
          <strong>{post.author.displayName || post.author.username}</strong>
          <BadgeRole role={post.author.role} />
        </Link>
        <span>@{post.author.username}</span>
        <span>·</span>
        <Link to={`/p/${post._id}`} className="muted">
          {new Date(post.createdAt).toLocaleString()}
        </Link>
      </div>
      <div className="post-content">{post.content}</div>
      {post.mediaUrl && (
        <div className="post-media">
          {post.mediaType === 'video' ? (
            <video src={post.mediaUrl} controls preload="metadata" />
          ) : (
            <img src={post.mediaUrl} loading="lazy" alt="" />
          )}
        </div>
      )}
      {post.tags && post.tags.length > 0 && (
        <div className="tags">
          {post.tags.map((t) => <TagPill key={t._id || t.id} tag={t} />)}
        </div>
      )}
      <div className="post-actions" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <button className="ghost" onClick={toggleLike} disabled={!user || busy}>
          {liked ? '♥' : '♡'} {likes.length}
        </button>
        <Link to={`/p/${post._id}`}>
          <button className="ghost">💬 {post.commentsCount || 0}</button>
        </Link>
        {mine ? (
          <button className="danger" onClick={handleDelete}>Hapus</button>
        ) : (user && (user.role === 'mod' || user.role === 'dev') && (
          confirmDelete ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '240px' }}>
              <input 
                type="text" 
                placeholder="Alasan hapus..." 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                style={{ fontSize: '13px', padding: '6px 10px', height: 'auto', flex: 1, minHeight: 'auto', margin: 0 }}
              />
              <button className="danger" onClick={handleModerateDelete} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '4px' }}>Ya</button>
              <button className="ghost" onClick={() => setConfirmDelete(false)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '4px' }}>Batal</button>
            </div>
          ) : (
            <button className="danger mod-action-btn" onClick={() => setConfirmDelete(true)}>Hapus (Mod)</button>
          )
        ))}
      </div>
    </article>
  );
}
