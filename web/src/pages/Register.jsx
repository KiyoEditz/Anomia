import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import TurnstileWidget from '../components/TurnstileWidget.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [honeypot, setHoneypot] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await register(username, password, displayName || username, {
        turnstileToken,
        _hp: honeypot,
      });
      navigate('/');
    } catch (e) {
      setErr(e.response?.data?.error || e.response?.data?.message || 'Gagal mendaftar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2>Daftar di Anomia</h2>
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
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
        }}
      />
      <TurnstileWidget
        onSuccess={(token) => setTurnstileToken(token)}
        onError={() => setTurnstileToken(null)}
      />
      <button type="submit" disabled={busy}>{busy ? '...' : 'Daftar'}</button>
      {err && <div className="error">{err}</div>}
      <p className="muted" style={{ marginTop: 16 }}>
        Sudah punya akun? <Link to="/login">Masuk</Link>
      </p>
    </form>
  );
}
