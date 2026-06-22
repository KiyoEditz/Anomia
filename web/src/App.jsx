import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import PostDetail from './pages/PostDetail.jsx';
import TagPage from './pages/TagPage.jsx';
import Explore from './pages/Explore.jsx';
import Notifications from './pages/Notifications.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import AdminBlockedLinks from './pages/AdminBlockedLinks.jsx';
import { ComposerModal } from './components/Composer.jsx';
import {
  IconHome,
  IconSearch,
  IconNotification,
  IconProfile,
  IconTheme,
  IconBack,
  IconShield,
  IconClose,
  IconCreate
} from './components/Icons.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, logout, unreadCount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Theme management
  const [theme, setTheme] = useState(() => localStorage.getItem('anomia_theme') || 'dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('anomia_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Global composer modal state
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [preselectedFile, setPreselectedFile] = useState(null);

  useEffect(() => {
    const handleOpen = (e) => {
      if (!user) {
        navigate('/login');
        return;
      }
      setPreselectedFile(e.detail?.file || null);
      setComposerOpen(true);
    };
    window.addEventListener('open-composer-modal', handleOpen);
    return () => {
      window.removeEventListener('open-composer-modal', handleOpen);
    };
  }, [user]);

  // Check if we are on a detail/sub-page to show back button
  const isSubPage = !['/', '/explore', '/notifications', '/admin', '/admin/blocked-links'].includes(location.pathname);

  // Helper to open composer (requires login)
  const handleOpenComposer = () => {
    if (!user) {
      navigate('/login');
    } else {
      setPreselectedFile(null);
      setComposerOpen(true);
    }
  };

  return (
    <div className="app-layout">
      {/* Sticky Top Bar */}
      <header className="top-bar">
        {isSubPage ? (
          <button className="top-bar-action" onClick={() => navigate(-1)} title="Kembali">
            <IconBack />
          </button>
        ) : (
          <div style={{ width: 36 }}></div> // Spacer to keep logo centered
        )}

        <Link to="/" className="top-bar-center" style={{ textDecoration: 'none' }}>
          Anomia
        </Link>

        <button className="top-bar-action" onClick={toggleTheme} title="Ganti Tema">
          <IconTheme dark={theme === 'dark'} />
        </button>
      </header>

      <div className="app-body">
        {/* Left Sidebar (Desktop Only) */}
        <aside className="sidebar desktop-only">
          <Link to="/" className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`}>
            <IconHome filled={location.pathname === '/'} />
            <span>Beranda</span>
          </Link>
          
          <Link to="/explore" className={`sidebar-link ${location.pathname === '/explore' ? 'active' : ''}`}>
            <IconSearch filled={location.pathname === '/explore'} />
            <span>Jelajah</span>
          </Link>

          {user && (
            <>
              <Link to="/notifications" className={`sidebar-link ${location.pathname === '/notifications' ? 'active' : ''}`} style={{ position: 'relative' }}>
                <IconNotification filled={location.pathname === '/notifications'} />
                <span>Notifikasi</span>
                {unreadCount > 0 && (
                  <span className="bottom-nav-badge" style={{ right: 16, top: 12 }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>

              <Link to={`/u/${user.username}`} className={`sidebar-link ${location.pathname.startsWith('/u/') ? 'active' : ''}`}>
                <IconProfile filled={location.pathname.startsWith('/u/')} />
                <span>Profil</span>
              </Link>

              {user.role === 'dev' && (
                <Link to="/admin" className={`sidebar-link ${location.pathname === '/admin' ? 'active' : ''}`}>
                  <IconShield />
                  <span>Admin Panel</span>
                </Link>
              )}

              {(user.role === 'dev' || user.role === 'mod') && (
                <Link to="/admin/blocked-links" className={`sidebar-link ${location.pathname === '/admin/blocked-links' ? 'active' : ''}`}>
                  <IconShield />
                  <span>Link Blocklist</span>
                </Link>
              )}

              <button className="sidebar-create-btn" onClick={handleOpenComposer}>
                <span>Buat Post</span>
              </button>

              <button 
                className="profile-btn" 
                style={{ marginTop: 'auto', width: '100%', background: 'transparent', borderColor: 'var(--color-border)' }} 
                onClick={() => { logout(); navigate('/login'); }}
              >
                Keluar
              </button>
            </>
          )}

          {!user && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link to="/login" className="profile-btn primary" style={{ textAlign: 'center', display: 'block' }}>Masuk</Link>
              <Link to="/register" className="profile-btn" style={{ textAlign: 'center', display: 'block' }}>Daftar</Link>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="container">
          <Routes>
            <Route path="/" element={<RequireAuth><Feed /></RequireAuth>} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/p/:id" element={<PostDetail />} />
            <Route path="/tag/:slug" element={<TagPage />} />
            <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><AdminPanel /></RequireAuth>} />
            <Route path="/admin/blocked-links" element={<RequireAuth><AdminBlockedLinks /></RequireAuth>} />
            <Route path="*" element={<div className="center">404 - Halaman Tidak Ditemukan</div>} />
          </Routes>
        </main>
      </div>

      {/* Bottom Navigation Bar (Mobile Only) */}
      <nav className="bottom-nav mobile-only">
        <Link to="/" className={`bottom-nav-item ${location.pathname === '/' ? 'active' : ''}`}>
          <IconHome filled={location.pathname === '/'} />
          <span className="bottom-nav-label">Beranda</span>
        </Link>

        <Link to="/explore" className={`bottom-nav-item ${location.pathname === '/explore' ? 'active' : ''}`}>
          <IconSearch filled={location.pathname === '/explore'} />
          <span className="bottom-nav-label">Jelajah</span>
        </Link>

        <button className="bottom-nav-fab" onClick={handleOpenComposer} title="Buat Post">
          <IconCreate filled={true} size={24} />
        </button>

        <Link to="/notifications" className={`bottom-nav-item ${location.pathname === '/notifications' ? 'active' : ''}`}>
          <IconNotification filled={location.pathname === '/notifications'} />
          {unreadCount > 0 && (
            <span className="bottom-nav-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="bottom-nav-label">Notifikasi</span>
        </Link>

        <Link to={user ? `/u/${user.username}` : '/login'} className={`bottom-nav-item ${location.pathname.startsWith('/u/') || location.pathname === '/login' ? 'active' : ''}`}>
          <IconProfile filled={location.pathname.startsWith('/u/') || location.pathname === '/login'} />
          <span className="bottom-nav-label">Profil</span>
        </Link>
      </nav>

      {/* Global Fullscreen Composer Modal */}
      {user && (
        <ComposerModal 
          isOpen={isComposerOpen} 
          onClose={() => setComposerOpen(false)} 
          preselectedFile={preselectedFile}
        />
      )}
    </div>
  );
}
