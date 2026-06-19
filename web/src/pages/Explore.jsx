import { useEffect, useState, useRef } from 'react';
import api from '../api';
import PostCard from '../components/PostCard.jsx';
import TagPill from '../components/TagPill.jsx';

export default function Explore() {
  const [popularTags, setPopularTags] = useState([]);
  const [posts, setPosts] = useState([]);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observerRef = useRef(null);
  const isFetchingRef = useRef(false);

  async function loadTags() {
    const r = await api.get('/tags/popular');
    setPopularTags(r.data.tags);
  }

  async function loadPosts(pageNum = 1, append = false) {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (pageNum === 1) {
      setLoading(true);
      setPosts([]);
    } else {
      setLoadingMore(true);
      // delay 1 detik biar animate dikit
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    try {
      const params = { page: pageNum };
      if (include.trim()) params.tags = include.trim();
      if (exclude.trim()) params.exclude = exclude.trim();
      const r = await api.get('/posts', { params });
      
      const newPosts = r.data.posts || [];
      if (append) {
        setPosts((prev) => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      
      if (newPosts.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      setPage(pageNum);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }

  useEffect(() => { loadTags(); loadPosts(); }, []);

  useEffect(() => {
    const currentRef = observerRef.current;
    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading && !loadingMore && !isFetchingRef.current) {
        loadPosts(page + 1, true);
      }
    }, {
      rootMargin: '100px',
    });

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [page, hasMore, loading, loadingMore, include, exclude]);

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
      ) : (
        <>
          {posts.length === 0 ? (
            <div className="center muted">Tidak ada post.</div>
          ) : (
            posts.map((p) => <PostCard key={p._id} post={p} />)
          )}
          {loadingMore && <div className="center">Memuat...</div>}
          {hasMore && !loading && (
            <div ref={observerRef} style={{ height: '10px' }} />
          )}
        </>
      )}
    </div>
  );
}
