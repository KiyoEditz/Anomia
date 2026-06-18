import { useEffect, useState } from 'react';
import api from '../api';
import Composer from '../components/Composer.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/posts/feed');
      setPosts(r.data.posts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function onCreated(post) {
    setPosts([post, ...posts]);
  }

  function onDeleted(id) {
    setPosts(posts.filter((p) => p._id !== id));
  }

  return (
    <div>
      <Composer onCreated={onCreated} />
      {loading ? (
        <div className="center">Memuat feed...</div>
      ) : posts.length === 0 ? (
        <div className="center muted">Belum ada post. Mulai dengan membuat post atau follow user lain.</div>
      ) : (
        posts.map((p) => <PostCard key={p._id} post={p} onDeleted={onDeleted} />)
      )}
    </div>
  );
}
