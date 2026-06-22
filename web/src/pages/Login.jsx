import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import TurnstileWidget from '../components/TurnstileWidget.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setErr(errorParam);
    }
  }, [searchParams]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username, password, {
        turnstileToken,
        _hp: honeypot,
      });
      navigate('/');
    } catch (e) {
      setErr(e.response?.data?.error || e.response?.data?.message || 'Gagal login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h2>Masuk ke Anomia</h2>
      <div className="field">
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Password</label>
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
      <button type="submit" disabled={busy}>{busy ? '...' : 'Masuk'}</button>
      {err && <div className="error">{err}</div>}
      <p className="muted" style={{ marginTop: 16 }}>
        Belum punya akun? <Link to="/register">Daftar</Link>
      </p>
    </form>
  );
}
