import { Link } from 'react-router-dom';
import { useState } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import TagPill from './TagPill.jsx';

function Avatar({ user, size = 40, isAnonymous = false }) {
  if (isAnonymous || (user && user.username === 'anonim')) {
    return (
      <div className="avatar-placeholder anonymous-avatar" style={{ width: size, height: size }}>
        👥
      </div>
    );
  }
  if (!user) {
    return <div className="avatar-placeholder" style={{ width: size, height: size }}>?</div>;
  }
  const initial = (user.displayName || user.username || '?').charAt(0).toUpperCase();
  if (user.avatarUrl) {
    return <img className="avatar-img" src={user.avatarUrl} alt={user.username} style={{ width: size, height: size }} />;
  }
  return <div className="avatar-placeholder" style={{ width: size, height: size }}>{initial}</div>;
}

function getEmbedDetails(url) {
  if (!url) return null;
  const cleanedUrl = url.trim();

  // 1. YouTube
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const ytMatch = cleanedUrl.match(ytRegex);
  if (ytMatch) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`
    };
  }

  // 2. Spotify
  const spotifyRegex = /open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;
  const spotifyMatch = cleanedUrl.match(spotifyRegex);
  if (spotifyMatch) {
    return {
      type: 'spotify',
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`
    };
  }

  // 3. Direct Image
  if (/\.(jpeg|jpg|gif|png|webp|svg)(?:\?.*)?$/i.test(cleanedUrl)) {
    return {
      type: 'image',
      url: cleanedUrl
    };
  }

  // 4. Direct Video
  if (/\.(mp4|webm|ogg)(?:\?.*)?$/i.test(cleanedUrl)) {
    return {
      type: 'video',
      url: cleanedUrl
    };
  }

  // 5. Direct Audio
  if (/\.(mp3|wav|ogg)(?:\?.*)?$/i.test(cleanedUrl)) {
    return {
      type: 'audio',
      url: cleanedUrl
    };
  }

  // 6. Generic Link
  return {
    type: 'link',
    url: cleanedUrl
  };
}

function EmbedPreview({ url, content }) {
  let targetUrl = url;
  
  if (!targetUrl && content) {
    const urlRegex = /(https?:\/\/[^\s]+)/i;
    const match = content.match(urlRegex);
    if (match) {
      targetUrl = match[0];
    }
  }

  if (!targetUrl) return null;

  try {
    const embed = getEmbedDetails(targetUrl);
    if (!embed) return null;

    switch (embed.type) {
      case 'youtube':
        return (
          <div className="embed-container youtube-embed">
            <iframe
              src={embed.embedUrl}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            ></iframe>
          </div>
        );
      case 'spotify':
        return (
          <div className="embed-container spotify-embed">
            <iframe
              src={embed.embedUrl}
              width="100%"
              height="200"
              frameBorder="0"
              allowFullScreen=""
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            ></iframe>
          </div>
        );
      case 'image':
        return (
          <div className="embed-container image-embed">
            <img src={embed.url} alt="Embed" loading="lazy" />
          </div>
        );
      case 'video':
        return (
          <div className="embed-container video-embed">
            <video src={embed.url} controls preload="metadata" />
          </div>
        );
      case 'audio':
        return (
          <div className="embed-container audio-embed">
            <audio src={embed.url} controls />
          </div>
        );
      case 'link':
        const domain = new URL(targetUrl).hostname;
        return (
          <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="embed-link-card">
            <span className="embed-link-icon">🔗</span>
            <div className="embed-link-info">
              <span className="embed-link-title">{targetUrl}</span>
              <span className="embed-link-domain">Kunjungi {domain}</span>
            </div>
          </a>
        );
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
}

export default function PostCard({ post, onDeleted }) {
  const { user } = useAuth();
  const [likes, setLikes] = useState(post.likes || []);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const liked = user && likes.some((id) => String(id) === String(user.id));
  const mine = post.isMine;

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

  const isAnonymous = post.isAnonymous;
  const mood = post.mood || 'default';
  const isShout = post.content.length <= 60;
  const isEssay = post.content.length > 300;
  const readingTime = Math.ceil(post.content.split(/\s+/).length / 200);

  // Compute text rendering
  let displayText = post.content;
  if (isEssay && !expanded) {
    displayText = post.content.slice(0, 300) + '...';
  }

  return (
    <article className={`card post-card mood-${mood} ${isAnonymous ? 'is-anonymous' : ''}`}>
      <div className="post-meta">
        {isAnonymous ? (
          <div className="post-author anonymous">
            <Avatar user={post.author} size={36} isAnonymous={true} />
            <strong className="anonymous-name">{post.author?.displayName || 'Bisikan Misterius'}</strong>
            <span className="anonymous-badge">🤫 Whisper</span>
          </div>
        ) : post.author ? (
          <Link to={`/u/${post.author.username}`} className="post-author">
            <Avatar user={post.author} size={36} />
            <strong>{post.author.displayName || post.author.username}</strong>
            <span className="username">@{post.author.username}</span>
          </Link>
        ) : (
          <div className="post-author">
            <Avatar user={null} size={36} />
            <strong>Deleted User</strong>
          </div>
        )}

        {isEssay && (
          <span className="reading-time-badge">⏱️ {readingTime} mnt baca</span>
        )}

        <span className="meta-divider">·</span>
        <Link to={`/p/${post._id}`} className="muted date-link">
          {new Date(post.createdAt).toLocaleString()}
        </Link>
      </div>

      <div className={`post-content ${isShout ? 'shout-text' : 'standard-text'}`}>
        {displayText}
      </div>

      {isEssay && (
        <button 
          className="ghost toggle-expand-btn" 
          onClick={() => setExpanded(!expanded)}
          style={{ marginBottom: '12px', fontSize: '12px', padding: '4px 8px' }}
        >
          {expanded ? 'Tampilkan lebih sedikit ▲' : 'Baca selengkapnya ▼'}
        </button>
      )}

      {/* Media Embed Row */}
      <EmbedPreview url={post.embedUrl} content={post.content} />

      {post.tags && post.tags.length > 0 && (
        <div className="tags">
          {post.tags.map((t) => <TagPill key={t._id || t.id} tag={t} />)}
        </div>
      )}

      <div className="post-actions">
        <button className="ghost like-btn" onClick={toggleLike} disabled={!user || busy}>
          {liked ? '❤️' : '🖤'} {likes.length}
        </button>
        <Link to={`/p/${post._id}`}>
          <button className="ghost comment-btn">💬 {post.commentsCount || 0}</button>
        </Link>
        {mine && <button className="danger delete-btn" onClick={handleDelete}>Hapus</button>}
      </div>
    </article>
  );
}
