import { Link } from 'react-router-dom';
import { useState } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import TagPill from './TagPill.jsx';

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

  return (
    <article className="card">
      <div className="post-meta">
        <Link to={`/u/${post.author.username}`} className="post-author">
          <Avatar user={post.author} size={36} />
          <strong>{post.author.displayName || post.author.username}</strong>
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
      <div className="post-actions">
        <button className="ghost" onClick={toggleLike} disabled={!user || busy}>
          {liked ? '♥' : '♡'} {likes.length}
        </button>
        <Link to={`/p/${post._id}`}>
          <button className="ghost">💬 {post.commentsCount || 0}</button>
        </Link>
        {mine && <button className="danger" onClick={handleDelete}>Hapus</button>}
      </div>
    </article>
  );
}
