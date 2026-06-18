import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await register(username, password, displayName || username);
      navigate('/');
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal mendaftar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2>Daftar di Anonimbuz</h2>
      <div className="field">
        <label>Username (3-30, huruf/angka/_)</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Nama tampilan</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="field">
        <label>Password (minimal 6 karakter)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" disabled={busy}>{busy ? '...' : 'Daftar'}</button>
      {err && <div className="error">{err}</div>}
      <p className="muted" style={{ marginTop: 16 }}>
        Sudah punya akun? <Link to="/login">Masuk</Link>
      </p>
    </form>
  );
}
