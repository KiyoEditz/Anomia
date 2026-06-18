import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2>Masuk ke Anonimbuz</h2>
      <div className="field">
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" disabled={busy}>{busy ? '...' : 'Masuk'}</button>
      {err && <div className="error">{err}</div>}
      <p className="muted" style={{ marginTop: 16 }}>
        Belum punya akun? <Link to="/register">Daftar</Link>
      </p>
    </form>
  );
}
