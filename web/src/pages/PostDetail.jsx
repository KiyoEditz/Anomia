import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth.jsx';
import PostCard from '../components/PostCard.jsx';

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

function groupTagsByCategory(tags) {
  const out = {};
  for (const t of tags || []) {
    out[t.category] = out[t.category] || [];
    out[t.category].push(t);
  }
  return out;
}

export default function PostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get(`/posts/${id}`),
        api.get(`/posts/${id}/comments`),
      ]);
      setPost(p.data.post);
      setComments(c.data.comments);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function submitComment(e) {
    e.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.post(`/posts/${id}/comments`, { content });
      setComments([...comments, r.data.comment]);
      setContent('');
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(cid) {
    if (!confirm('Hapus comment?')) return;
    await api.delete(`/posts/${id}/comments/${cid}`);
    setComments(comments.filter((c) => c._id !== cid));
  }

  if (loading) return <div className="center">Memuat...</div>;
  if (!post) return <div className="center">Post tidak ditemukan.</div>;

  const grouped = groupTagsByCategory(post.tags);

  return (
    <div>
      <PostCard post={post} />
      {Object.keys(grouped).length > 0 && (
        <div className="card">
          <strong>Tag</strong>
          <div className="tag-groups" style={{ marginTop: 8 }}>
            {CATEGORIES.filter((c) => grouped[c]).map((c) => (
              <div key={c}>
                <div className="tag-group-label">{c}</div>
                <div className="tags">
                  {grouped[c].map((t) => (
                    <Link key={t._id} to={`/tag/${t.slug}`} className={`tag ${t.category}`}>{t.name}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3>Komentar ({comments.length})</h3>

      {user && (
        <form className="card" onSubmit={submitComment}>
          <textarea
            placeholder="Tulis komentar..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
          />
          <div className="post-actions">
            <span className="muted">{content.length}/500</span>
            <button type="submit" disabled={!content.trim() || busy} style={{ marginLeft: 'auto' }}>Kirim</button>
          </div>
        </form>
      )}

      {comments.length === 0 ? (
        <div className="center muted">Belum ada komentar.</div>
      ) : (
        comments.map((c) => (
          <article key={c._id} className="card">
            <div className="post-meta">
              <Link to={`/u/${c.author.username}`}><strong>{c.author.displayName || c.author.username}</strong></Link>
              <span>·</span>
              <span className="muted">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div className="post-content">{c.content}</div>
            {user && String(c.author._id) === String(user.id) && (
              <button className="danger" onClick={() => deleteComment(c._id)}>Hapus</button>
            )}
          </article>
        ))
      )}
    </div>
  );
}
