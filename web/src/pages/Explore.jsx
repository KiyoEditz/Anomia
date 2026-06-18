import { useEffect, useState } from 'react';
import api from '../api';
import PostCard from '../components/PostCard.jsx';
import TagPill from '../components/TagPill.jsx';

export default function Explore() {
  const [popularTags, setPopularTags] = useState([]);
  const [posts, setPosts] = useState([]);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadTags() {
    const r = await api.get('/tags/popular');
    setPopularTags(r.data.tags);
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const params = {};
      if (include.trim()) params.tags = include.trim();
      if (exclude.trim()) params.exclude = exclude.trim();
      const r = await api.get('/posts', { params });
      setPosts(r.data.posts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTags(); loadPosts(); }, []);

  function applyFilter(e) {
    e.preventDefault();
    loadPosts();
  }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tag populer</h3>
        {popularTags.length === 0 ? (
          <div className="muted">Belum ada tag yang dipakai.</div>
        ) : (
          <div className="tags">
            {popularTags.map((t) => <TagPill key={t._id} tag={t} />)}
          </div>
        )}
      </div>

      <form className="card" onSubmit={applyFilter}>
        <h3 style={{ marginTop: 0 }}>Filter konten</h3>
        <div className="field">
          <label>Sertakan tag (slug, dipisah koma) — contoh: <code>romance,comedy</code></label>
          <input value={include} onChange={(e) => setInclude(e.target.value)} placeholder="romance,comedy" />
        </div>
        <div className="field">
          <label>Kecualikan tag</label>
          <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="horror" />
        </div>
        <button type="submit">Terapkan</button>
      </form>

      <h3>Hasil</h3>
      {loading ? (
        <div className="center">Memuat...</div>
      ) : posts.length === 0 ? (
        <div className="center muted">Tidak ada post.</div>
      ) : (
        posts.map((p) => <PostCard key={p._id} post={p} />)
      )}
    </div>
  );
}
