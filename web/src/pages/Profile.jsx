import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth.jsx';
import PostCard from '../components/PostCard.jsx';
import BadgeRole from '../components/BadgeRole.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([
        api.get(`/users/${username}`),
        api.get(`/posts/user/${username}`),
      ]);
      setProfile(u.data.user);
      setDisplayName(u.data.user.displayName || '');
      setBio(u.data.user.bio || '');
      setPosts(p.data.posts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [username]);

  const isMe = user && profile && user.username === profile.username;

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.patch('/users/me', { displayName, bio });
      setProfile(r.data.user);
      setUser(r.data.user);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow() {
    if (!user || followBusy) return;
    setFollowBusy(true);
    try {
      await api.post(`/users/${username}/follow`);
      await load();
    } catch (e) {
      try {
        await api.delete(`/users/${username}/follow`);
        await load();
      } catch {}
    } finally {
      setFollowBusy(false);
    }
  }

  async function uploadMedia(kind, file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setUploadErr('File maksimum 20MB');
      return;
    }
    setUploadErr('');
    const setBusyFn = kind === 'avatar' ? setUploadingAvatar : setUploadingBanner;
    setBusyFn(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post(`/users/me/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile(r.data.user);
      setUser(r.data.user);
    } catch (e) {
      setUploadErr(e.response?.data?.error || 'Upload gagal');
    } finally {
      setBusyFn(false);
    }
  }

  if (loading) return <div className="center">Memuat...</div>;
  if (!profile) return <div className="center">User tidak ditemukan.</div>;

  const initial = (profile.displayName || profile.username).charAt(0).toUpperCase();

  return (
    <div>
      <div className="card profile-card">
        <div
          className="profile-banner"
          style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined}
        >
          {isMe && editing && (
            <button
              type="button"
              className="ghost banner-edit-btn"
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
            >
              {uploadingBanner ? 'Mengunggah...' : '📷 Ganti Banner'}
            </button>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => uploadMedia('banner', e.target.files?.[0])}
          />
        </div>
        <div className="profile-header">
          <div className="avatar-wrap">
            {profile.avatarUrl ? (
              <img className="avatar-img large" src={profile.avatarUrl} alt={profile.username} />
            ) : (
              <div className="avatar-placeholder large">{initial}</div>
            )}
            {isMe && editing && (
              <button
                type="button"
                className="ghost avatar-edit-btn"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Ganti avatar"
              >
                {uploadingAvatar ? '...' : '📷'}
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => uploadMedia('avatar', e.target.files?.[0])}
            />
          </div>
          <div style={{ flex: 1 }}>
            {editing ? (
              <form onSubmit={saveProfile}>
                <div className="field">
                  <label>Nama tampilan</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
                </div>
                <div className="field">
                  <label>Bio</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
                </div>
                {uploadErr && <div className="error">{uploadErr}</div>}
                <div className="row">
                  <button type="submit" disabled={busy}>Simpan</button>
                  <button type="button" className="ghost" onClick={() => setEditing(false)}>Batal</button>
                </div>
              </form>
            ) : (
              <>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {profile.displayName || profile.username}
                  <BadgeRole role={profile.role} />
                </h2>
                <div className="muted">@{profile.username}</div>
                {profile.bio && <div className="bio">{profile.bio}</div>}
                <div className="muted" style={{ marginTop: 8 }}>
                  {profile.followersCount} pengikut · {profile.followingCount} mengikuti
                </div>
                <div style={{ marginTop: 12 }}>
                  {isMe ? (
                    <button className="ghost" onClick={() => setEditing(true)}>Edit profil</button>
                  ) : user ? (
                    <button onClick={toggleFollow} disabled={followBusy}>Follow / Unfollow</button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {user && user.role === 'dev' && !isMe && (
        <div className="card" style={{ border: '1px solid #ff6b35', background: 'rgba(255, 107, 53, 0.05)', marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#ff6b35', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🛠️ Developer Actions
          </h4>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {profile.role === 'dev' ? (
              <span className="muted">Developer lain tidak dapat dimodifikasi.</span>
            ) : (
              <>
                <button 
                  className="ghost"
                  onClick={async () => {
                    const newRole = profile.role === 'mod' ? 'user' : 'mod';
                    if (!confirm(`Ubah role @${profile.username} menjadi ${newRole}?`)) return;
                    try {
                      await api.patch(`/users/${profile.id || profile._id}/role`, { role: newRole });
                      alert('Role berhasil diubah!');
                      load();
                    } catch (err) {
                      alert(err.response?.data?.error || 'Gagal mengubah role');
                    }
                  }}
                >
                  {profile.role === 'mod' ? '🛡️ Cabut Moderator' : '🛡️ Jadikan Moderator'}
                </button>
                {!profile.isSuspended ? (
                  <button 
                    className="danger"
                    onClick={async () => {
                      const reason = prompt('Masukkan alasan penangguhan akun:');
                      if (reason === null) return;
                      if (!reason.trim()) {
                        alert('Alasan wajib diisi!');
                        return;
                      }
                      try {
                        await api.patch(`/users/${profile.id || profile._id}/suspend`, { reason });
                        alert('Akun berhasil ditangguhkan!');
                        load();
                      } catch (err) {
                        alert(err.response?.data?.error || 'Gagal menangguhkan akun');
                      }
                    }}
                  >
                    🚫 Suspend Akun
                  </button>
                ) : (
                  <span className="error">⚠️ Akun Ditangguhkan</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <h3>Post</h3>
      {posts.length === 0 ? (
        <div className="center muted">Belum ada post.</div>
      ) : (
        posts.map((p) => <PostCard key={p._id} post={p} onDeleted={(id) => setPosts(posts.filter((x) => x._id !== id))} />)
      )}
    </div>
  );
}
