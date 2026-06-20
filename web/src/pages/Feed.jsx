import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import { CreatePostBar } from '../components/Composer.jsx';
import PostCard from '../components/PostCard.jsx';

function SkeletonLoader() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-body">
            <div className="skeleton-line short"></div>
            <div className="skeleton-line medium"></div>
            <div className="skeleton-line long"></div>
            <div className="skeleton-line media"></div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function Feed() {
  const { user, socket } = useAuth();
  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('for_you'); // 'for_you' or 'following'
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Real-time new posts queue
  const [newPostsQueue, setNewPostsQueue] = useState([]);
  
  // Pull to refresh gesture states
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const startTouchY = useRef(0);
  
  const bottomRef = useRef(null);

  // Load posts for tab
  async function loadFeed(pageNum = 1, append = false, forceSilent = false) {
    if (!forceSilent) {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
    }
    
    try {
      let endpoint = '/posts';
      let params = { page: pageNum };
      
      if (activeTab === 'for_you') {
        params.sort = 'engagement';
      } else {
        endpoint = '/posts/feed';
      }

      const r = await api.get(endpoint, { params });
      const fetchedPosts = r.data.posts || [];
      
      if (fetchedPosts.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (append) {
        setPosts((prev) => [...prev, ...fetchedPosts]);
      } else {
        setPosts(fetchedPosts);
      }
      setNewPostsQueue([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setPulling(false);
      setPullProgress(0);
    }
  }

  // Load on mount and tab switch
  useEffect(() => {
    setPage(1);
    loadFeed(1, false);
  }, [activeTab]);

  // Listen to new-post-created from our composer
  useEffect(() => {
    const handleNewPostCreated = (e) => {
      // Prepend to posts list instantly
      setPosts((prev) => [e.detail, ...prev]);
    };
    window.addEventListener('new-post-created', handleNewPostCreated);
    return () => window.removeEventListener('new-post-created', handleNewPostCreated);
  }, []);

  // Listen to real-time socket events for other users' posts
  useEffect(() => {
    if (!socket) return;
    
    const handleNewSocketPost = (newPost) => {
      // Only queue if it's from another user and we are on page 1
      const isMine = user && String(newPost.author?._id || newPost.author?.id || newPost.author) === String(user.id || user._id);
      if (!isMine) {
        setNewPostsQueue((prev) => [newPost, ...prev]);
      }
    };

    socket.on('new_post', handleNewSocketPost);
    return () => socket.off('new_post', handleNewSocketPost);
  }, [socket, user]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadFeed(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [bottomRef.current, hasMore, loading, loadingMore, page]);

  // Click on active tab reloads feed (scrolls to top)
  const handleTabClick = (tab) => {
    if (activeTab === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setPage(1);
      loadFeed(1, false);
    } else {
      setActiveTab(tab);
    }
  };

  // Prepend queued real-time posts
  const handleLoadNewQueuedPosts = () => {
    setPosts((prev) => [...newPostsQueue, ...prev]);
    setNewPostsQueue([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePostDeleted = (id) => {
    setPosts((prev) => prev.filter((p) => p._id !== id));
  };

  // Pull to refresh touch handlers
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      startTouchY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (window.scrollY === 0 && startTouchY.current > 0) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - startTouchY.current;
      if (diff > 0) {
        setPulling(true);
        setPullProgress(Math.min(100, Math.floor((diff / 150) * 100)));
      }
    }
  };

  const handleTouchEnd = () => {
    startTouchY.current = 0;
    if (pulling) {
      if (pullProgress >= 80) {
        // Trigger refresh
        setPage(1);
        loadFeed(1, false);
      } else {
        setPulling(false);
        setPullProgress(0);
      }
    }
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '100%' }}
    >
      {/* Pull indicator */}
      {pulling && (
        <div style={{
          height: `${pullProgress / 2.5}px`,
          maxHeight: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-surface)',
          fontSize: '12px',
          color: 'var(--color-accent)',
          fontWeight: 600,
          overflow: 'hidden',
          transition: pulling ? 'none' : 'height 200ms ease'
        }}>
          {pullProgress >= 80 ? 'Lepaskan untuk memuat ulang...' : 'Tarik untuk memuat ulang...'}
        </div>
      )}

      {/* Tabs */}
      <div className="feed-tabs">
        <button 
          className={`feed-tab ${activeTab === 'for_you' ? 'active' : ''}`}
          onClick={() => handleTabClick('for_you')}
        >
          Untuk Kamu
        </button>
        <button 
          className={`feed-tab ${activeTab === 'following' ? 'active' : ''}`}
          onClick={() => handleTabClick('following')}
        >
          Mengikuti
        </button>
      </div>

      {/* Create Post Bar */}
      <CreatePostBar />

      {/* Real-time posts indicator banner */}
      {newPostsQueue.length > 0 && (
        <div className="new-posts-banner" onClick={handleLoadNewQueuedPosts}>
          {newPostsQueue.length} postingan baru. Ketuk untuk melihat.
        </div>
      )}

      {/* Post feed */}
      {loading ? (
        <SkeletonLoader />
      ) : posts.length === 0 ? (
        <div className="center">
          <h3>Belum ada postingan</h3>
          <p style={{ marginTop: 8 }}>Mulai dengan membuat postingan baru atau follow user lain.</p>
        </div>
      ) : (
        <div className="feed-list">
          {posts.map((p) => (
            <PostCard key={p._id} post={p} onDeleted={handlePostDeleted} />
          ))}
        </div>
      )}

      {/* Infinite Scroll Trigger */}
      {hasMore && !loading && (
        <div ref={bottomRef} style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loadingMore && <div className="muted" style={{ fontSize: '14px' }}>Memuat lebih banyak...</div>}
        </div>
      )}
    </div>
  );
}
