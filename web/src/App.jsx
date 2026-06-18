import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import PostDetail from './pages/PostDetail.jsx';
import TagPage from './pages/TagPage.jsx';
import Explore from './pages/Explore.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <nav className="nav">
      <Link to="/" className="brand">Anomia</Link>
      <Link to="/explore">Jelajah</Link>
      {user ? (
        <>
          <Link to={`/u/${user.username}`}>@{user.username}</Link>
          <button onClick={() => { logout(); navigate('/login'); }}>Keluar</button>
        </>
      ) : (
        <>
          <Link to="/login">Masuk</Link>
          <Link to="/register">Daftar</Link>
        </>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<RequireAuth><Feed /></RequireAuth>} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/p/:id" element={<PostDetail />} />
          <Route path="/tag/:slug" element={<TagPage />} />
          <Route path="*" element={<div>404</div>} />
        </Routes>
      </main>
    </>
  );
}
