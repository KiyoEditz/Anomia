import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';

export default function AdminBlockedLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState('exact');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/blocked-links');
      setLinks(res.data.links || []);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || e.response?.data?.message || 'Gagal memuat daftar link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'dev' || user.role === 'mod')) {
      fetchLinks();
    }
  }, [user]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!pattern.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post('/admin/blocked-links', { pattern, matchType, reason });
      setPattern('');
      setReason('');
      fetchLinks();
    } catch (e) {
      alert(e.response?.data?.message || 'Gagal menambahkan pattern.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus pattern ini dari daftar blokir?')) return;
    try {
      await api.delete(`/admin/blocked-links/${id}`);
      fetchLinks();
    } catch (e) {
      alert(e.response?.data?.message || 'Gagal menghapus pattern.');
    }
  };

  if (!user || (user.role !== 'dev' && user.role !== 'mod')) {
    return <div className="center">Akses Ditolak. Halaman ini hanya untuk Developer & Moderator.</div>;
  }

  if (loading) return <div className="center">Memuat daftar link diblokir...</div>;

  return (
    <div style={{ padding: '16px 0' }}>
      <h2 style={{ marginBottom: 24, padding: '0 16px' }}>Daftar Link Diblokir</h2>

      {err && <div className="error" style={{ padding: '0 16px' }}>{err}</div>}

      <section className="admin-section">
        <h3>Tambah Pattern Baru</h3>

        <form className="admin-form" onSubmit={handleAdd} style={{ gap: 8 }}>
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 14,
            }}
          >
            <option value="exact">Exact — domain/link spesifik</option>
            <option value="pattern">Pattern — link dengan wildcard (*)</option>
          </select>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={
              matchType === 'pattern'
                ? 'contoh: promo-spam.com/click*'
                : 'contoh: spam-site.net'
            }
            required
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan (opsional)"
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Menambahkan...' : 'Tambah ke Blocklist'}
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h3>Pattern Aktif ({links.length})</h3>

        {links.length === 0 ? (
          <div className="center muted" style={{ padding: 16 }}>Belum ada pattern yang diblokir.</div>
        ) : (
          <>
            {/* Desktop Table */}
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Tipe</th>
                  <th>Alasan</th>
                  <th>Ditambahkan</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link._id}>
                    <td><code style={{ fontSize: 13, wordBreak: 'break-all' }}>{link.pattern}</code></td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: link.matchType === 'pattern' ? 'var(--color-accent)' : 'var(--color-border)',
                        color: link.matchType === 'pattern' ? '#fff' : 'var(--color-text)',
                      }}>
                        {link.matchType}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>{link.reason || '-'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {new Date(link.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="danger-btn" onClick={() => handleDelete(link._id)}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Card List */}
            <div className="admin-card-list">
              {links.map((link) => (
                <div key={link._id} className="admin-card-item">
                  <div className="admin-card-item-info">
                    <div className="admin-card-item-name" style={{ wordBreak: 'break-all' }}>
                      <code style={{ fontSize: 13 }}>{link.pattern}</code>
                      {' '}
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: link.matchType === 'pattern' ? 'var(--color-accent)' : 'var(--color-border)',
                        color: link.matchType === 'pattern' ? '#fff' : 'var(--color-text)',
                      }}>
                        {link.matchType}
                      </span>
                    </div>
                    <div className="admin-card-item-meta">
                      {link.reason || 'Tanpa alasan'}
                      {' · '}
                      {new Date(link.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="admin-table danger-btn" onClick={() => handleDelete(link._id)}>
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
