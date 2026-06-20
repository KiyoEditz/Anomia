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
      <div className="tag-page-header">
        <span className={`tag ${tag.category}`} style={{ fontSize: 16, padding: '6px 16px' }}>
          #{tag.name}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{tag.name}</div>
          <div className="tag-page-count">
            Kategori: {tag.category} · {tag.usageCount} postingan
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="center muted" style={{ padding: 32 }}>Belum ada post dengan tag ini.</div>
      ) : (
        <div className="feed-list">
          {posts.map((p) => <PostCard key={p._id} post={p} />)}
        </div>
      )}
    </div>
  );
}
