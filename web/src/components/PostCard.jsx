import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth.jsx';
import BadgeRole from './BadgeRole.jsx';
import {
  IconHeart,
  IconComment,
  IconRepost,
  IconBookmark,
  IconShare,
  IconTrash,
  IconClose
} from './Icons.jsx';

function formatRelativeTime(dateStr) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now - past;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Baru saja';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}j`;
  if (diffDays === 1) return 'Kemarin';
  return `${diffDays}h`;
}

function PostAvatar({ user, size = 40 }) {
  const initial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img className="avatar-img" src={user.avatarUrl} alt={user.username} style={{ width: size, height: size }} />;
  }
  return <div className="avatar-placeholder" style={{ width: size, height: size }}>{initial}</div>;
}

// Light markdown + @mention + #hashtag parser
function parsePostContent(text) {
  if (!text) return '';
  const regex = /(\*\*.*?\*\*|\*.*?\*|@[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+)/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('@')) {
      const username = part.slice(1);
      return <Link key={i} to={`/u/${username}`} onClick={(e) => e.stopPropagation()}>{part}</Link>;
    }
    if (part.startsWith('#')) {
      const slug = part.slice(1).toLowerCase();
      return <Link key={i} to={`/tag/${slug}`} onClick={(e) => e.stopPropagation()}>{part}</Link>;
    }
    return part;
  });
}

export default function PostCard({ post, onDeleted }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If this is a direct repost (content is empty, and it has repostOf)
  const isDirectRepost = post.repostOf && !post.content;
  const originalPost = isDirectRepost ? post.repostOf : post;

  // States bound to the target post (either the post itself or the original post if reposted)
  const [likes, setLikes] = useState(originalPost?.likes || []);
  const [reposts, setReposts] = useState(originalPost?.reposts || []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');
  
  // Dropdown States
  const [showRepostDropdown, setShowRepostDropdown] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [quoteContent, setQuoteContent] = useState('');
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const repostRef = useRef(null);
  const shareRef = useRef(null);
  const videoRef = useRef(null);
  const [videoMuted, setVideoMuted] = useState(true);

  // Sync liked & bookmarked states
  const liked = user && likes.some((id) => String(id) === String(user.id || user._id));
  const reposted = user && reposts.some((id) => String(id) === String(user.id || user._id));
  const mine = user && originalPost?.author && String(originalPost.author._id || originalPost.author.id || originalPost.author) === String(user.id || user._id);

  useEffect(() => {
    if (user && user.bookmarks) {
      setIsBookmarked(user.bookmarks.some((id) => String(id) === String(originalPost?._id)));
    }
  }, [user, originalPost]);

  // Video Autoplay Observer
  useEffect(() => {
    if (!videoRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const clickOutside = (e) => {
      if (repostRef.current && !repostRef.current.contains(e.target)) {
        setShowRepostDropdown(false);
      }
      if (shareRef.current && !shareRef.current.contains(e.target)) {
        setShowShareDropdown(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  if (!originalPost || originalPost.status === 'removed') {
    return null;
  }

  // Handle Moderator Removed post state
  if (originalPost.status === 'removed_by_mod') {
    return (
      <div className="card-wrap">
        <article className="card" style={{ opacity: 0.6, fontStyle: 'italic', padding: '16px' }}>
          <div style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚫 Postingan ini dihapus oleh moderator. Alasan: {originalPost.removedReason || 'Melanggar ketentuan komunitas.'}</span>
          </div>
        </article>
        <div className="post-divider"></div>
      </div>
    );
  }

  async function toggleLike() {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (liked) {
        await api.delete(`/posts/${originalPost._id}/like`);
        setLikes(likes.filter((id) => String(id) !== String(user.id || user._id)));
      } else {
        await api.post(`/posts/${originalPost._id}/like`);
        setLikes([...likes, user.id || user._id]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleBookmark() {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (isBookmarked) {
        await api.delete(`/posts/${originalPost._id}/bookmark`);
        setIsBookmarked(false);
        if (user.bookmarks) {
          user.bookmarks = user.bookmarks.filter((id) => String(id) !== String(originalPost._id));
        }
      } else {
        await api.post(`/posts/${originalPost._id}/bookmark`);
        setIsBookmarked(true);
        if (user.bookmarks) {
          user.bookmarks.push(originalPost._id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRepostDirect() {
    if (!user || busy) return;
    setBusy(true);
    setShowRepostDropdown(false);
    try {
      if (reposted) {
        await api.delete(`/posts/${originalPost._id}/repost`);
        setReposts(reposts.filter((id) => String(id) !== String(user.id || user._id)));
      } else {
        const res = await api.post(`/posts/${originalPost._id}/repost`);
        setReposts([...reposts, user.id || user._id]);
        // Trigger a custom event to inject the new repost in the feed if current page is Home
        window.dispatchEvent(new CustomEvent('new-post-created', { detail: res.data.post }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuoteSubmit(e) {
    e.preventDefault();
    if (!quoteContent.trim() || quoteBusy) return;
    setQuoteBusy(true);
    try {
      const res = await api.post(`/posts/${originalPost._id}/quote`, { content: quoteContent });
      setQuoteContent('');
      setIsQuoteOpen(false);
      window.dispatchEvent(new CustomEvent('new-post-created', { detail: res.data.post }));
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mengirim kutipan');
    } finally {
      setQuoteBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus post ini?')) return;
    try {
      await api.delete(`/posts/${post._id}`);
      onDeleted && onDeleted(post._id);
    } catch (err) {
      alert('Gagal menghapus post');
    }
  }

  async function handleModerateDelete() {
    if (!reason.trim()) {
      alert('Alasan wajib diisi!');
      return;
    }
    try {
      await api.delete(`/posts/${originalPost._id}/moderate`, { data: { reason } });
      onDeleted && onDeleted(post._id);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus postingan');
    }
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/p/${originalPost._id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Tautan disalin ke papan klip!');
      setShowShareDropdown(false);
    });
  };

  const handleNativeShare = () => {
    const url = `${window.location.origin}/p/${originalPost._id}`;
    if (navigator.share) {
      navigator.share({
        title: 'Anomia Post',
        text: originalPost.content,
        url: url
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleCardClick = () => {
    navigate(`/p/${originalPost._id}`);
  };

  return (
    <div className="post-card-container">
      {/* Repost Indicator Bar */}
      {isDirectRepost && (
        <div className="post-repost-header">
          <IconRepost size={14} />
          <span>
            <Link to={`/u/${post.author.username}`} onClick={(e) => e.stopPropagation()}>
              {post.author.displayName || post.author.username}
            </Link> me-repost
          </span>
        </div>
      )}

      <article className="card" onClick={handleCardClick} style={{ cursor: 'pointer' }}>
        <div className="post-main">
          {/* Avatar Column */}
          <div className="post-avatar-wrap" onClick={(e) => e.stopPropagation()}>
            <Link to={`/u/${originalPost.author.username}`}>
              <PostAvatar user={originalPost.author} size={40} />
            </Link>
          </div>

          {/* Body Column */}
          <div className="post-body">
            {/* Header row */}
            <div className="post-header" onClick={(e) => e.stopPropagation()}>
              <Link to={`/u/${originalPost.author.username}`} className="post-author-name">
                {originalPost.author.displayName || originalPost.author.username}
              </Link>
              <BadgeRole role={originalPost.author.role} />
              <span className="post-author-handle">@{originalPost.author.username}</span>
              <span>·</span>
              <Link to={`/p/${originalPost._id}`} className="post-time">
                {formatRelativeTime(originalPost.createdAt)}
              </Link>
            </div>

            {/* Content text */}
            <div className="post-content">
              {parsePostContent(originalPost.content)}
            </div>

            {/* Media Upload */}
            {originalPost.mediaUrl && (
              <div 
                className={`post-media ${originalPost.mediaType === 'video' ? 'video' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (originalPost.mediaType === 'video' && videoRef.current) {
                    setVideoMuted(!videoMuted);
                  }
                }}
              >
                {originalPost.mediaType === 'video' ? (
                  <>
                    <video 
                      ref={videoRef}
                      src={originalPost.mediaUrl} 
                      preload="metadata" 
                      loop
                      muted={videoMuted}
                      playsInline
                    />
                    <button className="post-media-volume-btn">
                      {videoMuted ? '🔇' : '🔊'}
                    </button>
                  </>
                ) : (
                  <img src={originalPost.mediaUrl} loading="lazy" alt="Media postingan" />
                )}
              </div>
            )}

            {/* Quote Post Render (box inside post) */}
            {originalPost.repostOf && originalPost.content && (
              <div 
                className="quote-post-box"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/p/${originalPost.repostOf._id || originalPost.repostOf}`);
                }}
              >
                {originalPost.repostOf.status === 'removed_by_mod' ? (
                  <div className="quote-content" style={{ opacity: 0.6, fontStyle: 'italic' }}>
                    🚫 Postingan yang dikutip telah dihapus oleh moderator.
                  </div>
                ) : (
                  <>
                    <div className="quote-header">
                      <img 
                        src={originalPost.repostOf.author?.avatarUrl || ''} 
                        alt="" 
                        className="quote-avatar" 
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span className="quote-name">
                        {originalPost.repostOf.author?.displayName || originalPost.repostOf.author?.username || 'User'}
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        @{originalPost.repostOf.author?.username}
                      </span>
                    </div>
                    <div className="quote-content">
                      {originalPost.repostOf.content}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="post-actions" onClick={(e) => e.stopPropagation()}>
              {/* Like Button */}
              <button className={`post-action-btn like-btn ${liked ? 'active' : ''}`} onClick={toggleLike} disabled={!user || busy}>
                <IconHeart filled={liked} size={18} />
                <span>{likes.length}</span>
              </button>

              {/* Comment Button */}
              <Link to={`/p/${originalPost._id}`} className="post-action-btn comment-btn">
                <IconComment size={18} />
                <span>{originalPost.commentsCount || 0}</span>
              </Link>

              {/* Repost Dropdown */}
              <div className="dropdown-wrap" ref={repostRef}>
                <button className={`post-action-btn repost-btn ${reposted ? 'active' : ''}`} onClick={() => setShowRepostDropdown(!showRepostDropdown)} disabled={!user}>
                  <IconRepost size={18} />
                  <span>{reposts.length}</span>
                </button>
                {showRepostDropdown && (
                  <div className="dropdown-menu">
                    <button className="dropdown-item" onClick={handleRepostDirect}>
                      <IconRepost size={16} />
                      <span>{reposted ? 'Urungkan Repost' : 'Repost'}</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { setIsQuoteOpen(true); setShowRepostDropdown(false); }}>
                      <span>✍️ Kutip Postingan</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Bookmark Button */}
              <button className={`post-action-btn bookmark-btn ${isBookmarked ? 'active' : ''}`} onClick={handleBookmark} disabled={!user || busy}>
                <IconBookmark filled={isBookmarked} size={18} />
              </button>

              {/* Share Dropdown */}
              <div className="dropdown-wrap" ref={shareRef}>
                <button className="post-action-btn share-btn" onClick={() => setShowShareDropdown(!showShareDropdown)}>
                  <IconShare size={18} />
                </button>
                {showShareDropdown && (
                  <div className="dropdown-menu">
                    <button className="dropdown-item" onClick={handleCopyLink}>
                      <span>🔗 Salin Tautan</span>
                    </button>
                    <button className="dropdown-item" onClick={handleNativeShare}>
                      <IconShare size={14} />
                      <span>Bagikan via...</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Delete / Moderate Button */}
              {mine ? (
                <button className="post-action-btn" style={{ color: 'var(--color-danger)' }} onClick={handleDelete} title="Hapus postingan">
                  <IconTrash size={18} />
                </button>
              ) : (user && (user.role === 'mod' || user.role === 'dev') && (
                confirmDelete ? (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto', background: 'var(--color-surface-2)', padding: '4px', borderRadius: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Alasan hapus..." 
                      value={reason} 
                      onChange={(e) => setReason(e.target.value)} 
                      style={{ fontSize: '11px', padding: '4px 8px', height: '24px', flex: 1, minHeight: 'auto', margin: 0, width: '100px' }}
                    />
                    <button className="profile-btn primary" onClick={handleModerateDelete} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Hapus</button>
                    <button className="profile-btn" onClick={() => setConfirmDelete(false)} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Batal</button>
                  </div>
                ) : (
                  <button className="post-action-btn" style={{ color: 'var(--color-danger)' }} onClick={() => setConfirmDelete(true)} title="Hapus sebagai Moderator">
                    <IconTrash size={18} />
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      </article>
      <div className="post-divider"></div>

      {/* Quote Post Modal (Overlay popup) */}
      {isQuoteOpen && (
        <div className="fullscreen-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <button className="modal-close-btn" onClick={() => setIsQuoteOpen(false)} disabled={quoteBusy}>
              Batal
            </button>
            <span className="modal-header-title">Kutip Postingan</span>
            <button className="modal-submit-btn" onClick={handleQuoteSubmit} disabled={!quoteContent.trim() || quoteBusy}>
              Kirim
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-composer-row">
              <PostAvatar user={user} size={40} />
              <textarea
                className="modal-textarea"
                placeholder="Tambahkan komentar Anda..."
                value={quoteContent}
                onChange={(e) => setQuoteContent(e.target.value)}
                maxLength={500}
                disabled={quoteBusy}
              />
            </div>
            {/* Embed preview of original post inside quote modal */}
            <div className="quote-post-box" style={{ background: 'var(--color-surface)' }}>
              <div className="quote-header">
                <img 
                  src={originalPost.author?.avatarUrl || ''} 
                  alt="" 
                  className="quote-avatar" 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="quote-name">{originalPost.author?.displayName || originalPost.author?.username}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>@{originalPost.author?.username}</span>
              </div>
              <div className="quote-content">
                {originalPost.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
