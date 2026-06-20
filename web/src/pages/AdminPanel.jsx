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

  function getActionLabel(action) {
    switch (action) {
      case 'delete_post': return 'Hapus Post';
      case 'delete_comment': return 'Hapus Komentar';
      case 'assign_role': return 'Perubahan Role';
      case 'suspend_user': return 'Suspend Akun';
      default: return action;
    }
  }

  if (user?.role !== 'dev') {
    return <div className="center">Akses Ditolak. Halaman ini hanya untuk Developer.</div>;
  }

  if (loading) return <div className="center">Memuat panel admin...</div>;

  return (
    <div style={{ padding: '16px 0' }}>
      <h2 style={{ marginBottom: 24, padding: '0 16px' }}>Panel Developer & Admin</h2>

      {err && <div className="error" style={{ padding: '0 16px' }}>{err}</div>}

      {/* Moderator Management */}
      <section className="admin-section">
        <h3>Manajemen Moderator</h3>

        <form className="admin-form" onSubmit={handlePromote}>
          <input
            type="text"
            placeholder="Masukkan username user..."
            value={promoUsername}
            onChange={(e) => setPromoUsername(e.target.value)}
            required
          />
          <button type="submit" disabled={promoBusy}>
            {promoBusy ? 'Memproses...' : 'Tambah Moderator'}
          </button>
        </form>

        {/* Desktop Table */}
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Diberikan Oleh</th>
              <th>Waktu</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {moderators.map((m) => (
              <tr key={m._id}>
                <td style={{ fontWeight: 'bold' }}>@{m.username}</td>
                <td><BadgeRole role={m.role} /></td>
                <td className="muted">
                  {m.roleAssignedBy ? `@${m.roleAssignedBy.username}` : 'System / Owner'}
                </td>
                <td className="muted" style={{ fontSize: '13px' }}>
                  {m.roleAssignedAt ? new Date(m.roleAssignedAt).toLocaleDateString() : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {m.role === 'mod' ? (
                    <button className="danger-btn" onClick={() => handleRevoke(m._id, m.username)}>
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

        {/* Mobile Card List */}
        <div className="admin-card-list">
          {moderators.map((m) => (
            <div key={m._id} className="admin-card-item">
              <div className="admin-card-item-info">
                <div className="admin-card-item-name">
                  @{m.username} <BadgeRole role={m.role} />
                </div>
                <div className="admin-card-item-meta">
                  {m.roleAssignedBy ? `Oleh @${m.roleAssignedBy.username}` : 'System / Owner'}
                  {m.roleAssignedAt ? ` · ${new Date(m.roleAssignedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
              {m.role === 'mod' && (
                <button className="admin-table danger-btn" onClick={() => handleRevoke(m._id, m.username)}>
                  Cabut
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Audit Logs */}
      <section className="admin-section">
        <h3>Log Moderasi</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.length === 0 ? (
            <div className="center muted">Belum ada log aktivitas.</div>
          ) : (
            logs.map((log) => (
              <div key={log._id} className="audit-log-card">
                <div className="audit-log-header">
                  <div>
                    <span className="audit-log-action">{getActionLabel(log.action)}</span>
                    <span className="audit-log-performer">
                      {' '}oleh @{log.performedBy?.username || 'System'} ({log.performedByRole})
                    </span>
                  </div>
                  <span className="audit-log-time">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="audit-log-target">
                  <strong>Target:</strong> @{log.targetUserId?.username || 'Unknown'}
                </div>
                <div className="audit-log-reason">
                  <strong>Alasan:</strong> {log.reason}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
