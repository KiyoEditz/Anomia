import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import PostCard from '../components/PostCard.jsx';

export default function TagPage() {
  const { slug } = useParams();
  const [tag, setTag] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/tags/${slug}`);
      setTag(r.data.tag);
      setPosts(r.data.posts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]);

  if (loading) return <div className="center">Memuat...</div>;
  if (!tag) return <div className="center">Tag tidak ditemukan.</div>;

  return (
    <div>
      <div className="card">
        <div className={`tag ${tag.category}`} style={{ fontSize: 18, padding: '6px 14px' }}>
          {tag.name}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Kategori: {tag.category} · Digunakan {tag.usageCount}x
        </div>
      </div>
      <h3>Post dengan tag ini</h3>
      {posts.length === 0 ? (
        <div className="center muted">Belum ada post.</div>
      ) : (
        posts.map((p) => <PostCard key={p._id} post={p} />)
      )}
    </div>
  );
}
