import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import BadgeRole from '../components/BadgeRole.jsx';

export default function AdminPanel() {
  const { user } = useAuth();
  const [moderators, setModerators] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [promoUsername, setPromoUsername] = useState('');
  const [promoBusy, setPromoBusy] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [mRes, lRes] = await Promise.all([
        api.get('/users/moderators'),
        api.get('/users/moderation-logs'),
      ]);
      setModerators(mRes.data.moderators || []);
      setLogs(lRes.data.logs || []);
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal memuat data panel admin');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && user.role === 'dev') {
      loadData();
    }
  }, [user]);

  async function handleRevoke(modId, username) {
    if (!confirm(`Cabut role moderator untuk @${username}?`)) return;
    try {
      await api.patch(`/users/${modId}/role`, { role: 'user' });
      alert('Role moderator berhasil dicabut.');
      loadData();
    } catch (e) {
      alert(e.response?.data?.error || 'Gagal mencabut role');
    }
  }

  async function handlePromote(e) {
    e.preventDefault();
    if (!promoUsername.trim() || promoBusy) return;
    setPromoBusy(true);
    try {
      // First find the user to get their ID
      const userRes = await api.get(`/users/${promoUsername.trim()}`);
      const targetUser = userRes.data.user;
      if (!targetUser) throw new Error('User tidak ditemukan');
      
      await api.patch(`/users/${targetUser.id || targetUser._id}/role`, { role: 'mod' });
      alert(`@${promoUsername} berhasil dijadikan Moderator!`);
      setPromoUsername('');
      loadData();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Gagal menjadikan moderator');
    } finally {
      setPromoBusy(false);
    }
  }

  if (user?.role !== 'dev') {
    return <div className="center error">Akses Ditolak. Halaman ini hanya untuk Developer.</div>;
  }

  if (loading) return <div className="center">Memuat panel admin...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: '8px' }}>
        🛠️ Panel Developer & Admin
      </h2>

      {err && <div className="card error">{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        {/* Moderator Management */}
        <section className="card">
          <h3>🛡️ Manajemen Moderator</h3>
          
          <form onSubmit={handlePromote} style={{ display: 'flex', gap: '8px', marginBottom: 20 }}>
            <input 
              type="text" 
              placeholder="Masukkan username user..." 
              value={promoUsername}
              onChange={(e) => setPromoUsername(e.target.value)}
              style={{ maxWidth: 300 }}
              required
            />
            <button type="submit" disabled={promoBusy} style={{ whiteSpace: 'nowrap' }}>
              {promoBusy ? 'Memproses...' : 'Tambah Moderator'}
            </button>
          </form>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #2f3336', textAlign: 'left' }}>
                <th style={{ padding: '8px 0' }}>Username</th>
                <th style={{ padding: '8px 0' }}>Role</th>
                <th style={{ padding: '8px 0' }}>Diberikan Oleh</th>
                <th style={{ padding: '8px 0' }}>Waktu</th>
                <th style={{ padding: '8px 0', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {moderators.map((m) => (
                <tr key={m._id} style={{ borderBottom: '1px solid #2f3336' }}>
                  <td style={{ padding: '12px 0', fontWeight: 'bold' }}>@{m.username}</td>
                  <td style={{ padding: '12px 0' }}>
                    <BadgeRole role={m.role} />
                  </td>
                  <td style={{ padding: '12px 0', color: '#8b98a5' }}>
                    {m.roleAssignedBy ? `@${m.roleAssignedBy.username}` : 'System / Owner'}
                  </td>
                  <td style={{ padding: '12px 0', color: '#8b98a5', fontSize: '13px' }}>
                    {m.roleAssignedAt ? new Date(m.roleAssignedAt).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right' }}>
                    {m.role === 'mod' ? (
                      <button className="danger" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => handleRevoke(m._id, m.username)}>
                        Cabut
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: '12px' }}>Locked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Audit Logs */}
        <section className="card">
          <h3>📋 Log Moderasi Manual</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 16 }}>
            {logs.length === 0 ? (
              <div className="muted center">Belum ada log aktivitas.</div>
            ) : (
              logs.map((log) => (
                <div 
                  key={log._id} 
                  style={{ 
                    padding: '12px', 
                    borderRadius: '8px', 
                    border: '1px solid #2f3336', 
                    background: '#1c2024'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <strong style={{ color: '#ff6b35' }}>
                        {log.action === 'delete_post' && '🗑️ Hapus Post'}
                        {log.action === 'delete_comment' && '💬 Hapus Komentar'}
                        {log.action === 'assign_role' && '🛡️ Perubahan Role'}
                        {log.action === 'suspend_user' && '🚫 Suspend Akun'}
                      </strong>
                      <span className="muted" style={{ marginLeft: 8 }}>
                        oleh @{log.performedBy?.username || 'System'} ({log.performedByRole})
                      </span>
                    </div>
                    <span className="muted" style={{ fontSize: '12px' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', margin: '4px 0' }}>
                    <strong>Target:</strong> @{log.targetUserId?.username || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '14px', background: 'rgba(0, 0, 0, 0.2)', padding: '6px 10px', borderRadius: '4px', borderLeft: '3px solid #ff6b35' }}>
                    <strong>Alasan:</strong> {log.reason}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
