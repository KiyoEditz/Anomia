import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth.jsx';
import PostCard from '../components/PostCard.jsx';
import BadgeRole from '../components/BadgeRole.jsx';

function ProfileCommentItem({ comment }) {
  return (
    <Link to={`/p/${comment.post?._id || comment.post}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="post-meta" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        <strong>{comment.author.displayName || comment.author.username}</strong>
        <span>@{comment.author.username}</span>
        <span>·</span>
        <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--color-accent)', margin: '4px 0 8px' }}>
        Membalas {comment.post?.author ? `@${comment.post.author.username}` : 'postingan'}
      </div>
      <div className="post-content" style={{ fontSize: '14px' }}>
        {comment.content}
      </div>
      <div className="post-divider" style={{ marginTop: 12, marginBottom: -16 }}></div>
    </Link>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [replies, setReplies] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [activeTab, setActiveTab] = useState('posts'); // 'posts' | 'replies' | 'media' | 'bookmarks'
  
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

  // Pagination for posts
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef(null);

  async function loadProfile() {
    setLoading(true);
    try {
      const uRes = await api.get(`/users/${username}`);
      setProfile(uRes.data.user);
      setDisplayName(uRes.data.user.displayName || '');
      setBio(uRes.data.user.bio || '');
      
      // Load first page of posts
      setPage(1);
      const pRes = await api.get(`/posts/user/${username}?page=1`);
      setPosts(pRes.data.posts || []);
      setHasMore((pRes.data.posts || []).length === 20);

      // Load replies
      const cRes = await api.get(`/comments/user/${username}`);
      setReplies(cRes.data.comments || []);

      // If viewing my own profile, load bookmarks
      if (user && user.username === uRes.data.user.username) {
        const bRes = await api.get('/posts/bookmarks');
        setBookmarks(bRes.data.posts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [username]);

  // Infinite scroll observer for posts
  useEffect(() => {
    if (!bottomRef.current || activeTab !== 'posts') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
          loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [bottomRef.current, hasMore, loading, loadingMore, page, activeTab]);

  async function loadMorePosts() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const r = await api.get(`/posts/user/${username}?page=${nextPage}`);
      const nextPosts = r.data.posts || [];
      if (nextPosts.length < 20) {
        setHasMore(false);
      }
      setPosts((prev) => [...prev, ...nextPosts]);
      setPage(nextPage);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }

  const isMe = user && profile && user.username === profile.username;

  // Follow relation states
  const amIFollowing = user && user.following && user.following.some(id => String(id) === String(profile?.id || profile?._id));
  const areTheyFollowingMe = user && user.followers && user.followers.some(id => String(id) === String(profile?.id || profile?._id));

  // Determine button state text
  let followButtonText = 'Ikuti';
  if (amIFollowing && areTheyFollowingMe) {
    followButtonText = 'Saling Ikuti';
  } else if (amIFollowing) {
    followButtonText = 'Mengikuti';
  }

  async function toggleFollow() {
    if (!user || followBusy) return;
    setFollowBusy(true);
    try {
      if (amIFollowing) {
        await api.delete(`/users/${username}/follow`);
      } else {
        await api.post(`/users/${username}/follow`);
      }
      // Refresh user context and profile details
      const [uRes, meRes] = await Promise.all([
        api.get(`/users/${username}`),
        api.get('/auth/me')
      ]);
      setProfile(uRes.data.user);
      setUser(meRes.data.user);
    } catch (e) {
      console.error('Failed to follow/unfollow user', e);
    } finally {
      setFollowBusy(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.patch('/users/me', { displayName, bio });
      setProfile(r.data.user);
      setUser(r.data.user);
      setEditing(false);
    } catch (e) {
      alert('Gagal menyimpan profil');
    } finally {
      setBusy(false);
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

  if (loading) return <div className="center">Memuat profil...</div>;
  if (!profile) return <div className="center">User tidak ditemukan.</div>;

  const initial = (profile.displayName || profile.username).charAt(0).toUpperCase();

  // Filters posts with media for the Media tab
  const mediaPosts = posts.filter((p) => p.mediaUrl);

  return (
    <div>
      {/* Banner */}
      <div className="card profile-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          className="profile-banner"
          style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined}
        >
          {isMe && editing && (
            <button
              type="button"
              className="profile-btn"
              style={{ position: 'absolute', right: 12, bottom: 12, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 0 }}
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

        {/* Profile Header Details */}
        <div className="profile-header-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="profile-avatar-overlap">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.username} />
              ) : (
                <div className="avatar-placeholder">{initial}</div>
              )}
              {isMe && editing && (
                <button
                  type="button"
                  className="profile-btn"
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    background: 'var(--color-surface-2)',
                    padding: '4px 8px',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--color-border)'
                  }}
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

            {/* Action buttons (Follow/Edit) */}
            <div className="profile-action-row">
              {isMe ? (
                editing ? (
                  null
                ) : (
                  <button className="profile-btn" onClick={() => setEditing(true)}>Edit profil</button>
                )
              ) : user ? (
                <button 
                  className={`profile-btn ${!amIFollowing ? 'primary' : ''}`}
                  onClick={toggleFollow} 
                  disabled={followBusy}
                >
                  {followButtonText}
                </button>
              ) : null}
            </div>
          </div>

          {/* Edit Form */}
          {editing ? (
            <form onSubmit={saveProfile} style={{ marginTop: 16 }}>
              <div className="field">
                <label>Nama tampilan</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
              </div>
              <div className="field">
                <label>Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} style={{ minHeight: 80 }} />
              </div>
              {uploadErr && <div className="error">{uploadErr}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="profile-btn primary" type="submit" disabled={busy}>Simpan</button>
                <button className="profile-btn" type="button" onClick={() => setEditing(false)}>Batal</button>
              </div>
            </form>
          ) : (
            <div className="profile-info">
              <h2 className="profile-name">
                {profile.displayName || profile.username}
                <BadgeRole role={profile.role} />
              </h2>
              <div className="profile-handle">@{profile.username}</div>
              
              {profile.bio && <div className="profile-bio">{profile.bio}</div>}
              
              <div className="profile-stats">
                <span><strong>{profile.followingCount || 0}</strong> Mengikuti</span>
                <span><strong>{profile.followersCount || 0}</strong> Pengikut</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Developer Panel inside Profile page */}
      {user && user.role === 'dev' && !isMe && (
        <div className="admin-section" style={{ marginTop: 12, borderColor: 'var(--color-dev)', background: 'rgba(255, 107, 53, 0.05)' }}>
          <h3 style={{ color: 'var(--color-dev)' }}>Developer Tools</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {profile.role === 'dev' ? (
              <span className="muted">Developer lain tidak dapat dimodifikasi.</span>
            ) : (
              <>
                <button
                  className="profile-btn"
                  style={{ minHeight: 44 }}
                  onClick={async () => {
                    const newRole = profile.role === 'mod' ? 'user' : 'mod';
                    if (!confirm(`Ubah role @${profile.username} menjadi ${newRole}?`)) return;
                    try {
                      await api.patch(`/users/${profile.id || profile._id}/role`, { role: newRole });
                      alert('Role berhasil diubah!');
                      loadProfile();
                    } catch (err) {
                      alert(err.response?.data?.error || 'Gagal mengubah role');
                    }
                  }}
                >
                  {profile.role === 'mod' ? 'Cabut Moderator' : 'Jadikan Moderator'}
                </button>
                {!profile.isSuspended ? (
                  <button
                    className="profile-btn"
                    style={{ background: 'var(--color-danger)', color: '#fff', borderColor: 'var(--color-danger)', minHeight: 44 }}
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
                        loadProfile();
                      } catch (err) {
                        alert(err.response?.data?.error || 'Gagal menangguhkan akun');
                      }
                    }}
                  >
                    Suspend Akun
                  </button>
                ) : (
                  <span className="error" style={{ display: 'flex', alignItems: 'center' }}>
                    Akun Ditangguhkan
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Profile Page Tabs */}
      <div className="profile-tabs">
        <button 
          className={`profile-tab ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          Postingan
        </button>
        <button 
          className={`profile-tab ${activeTab === 'replies' ? 'active' : ''}`}
          onClick={() => setActiveTab('replies')}
        >
          Balasan
        </button>
        <button 
          className={`profile-tab ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          Media
        </button>
        {isMe && (
          <button 
            className={`profile-tab ${activeTab === 'bookmarks' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookmarks')}
          >
            Tersimpan
          </button>
        )}
      </div>

      {/* Tab Contents list */}
      <div style={{ marginTop: 12 }}>
        {activeTab === 'posts' && (
          posts.length === 0 ? (
            <div className="center">Belum ada postingan.</div>
          ) : (
            <>
              <div className="feed-list">
                {posts.map((p) => (
                  <PostCard key={p._id} post={p} onDeleted={(id) => setPosts(posts.filter((x) => x._id !== id))} />
                ))}
              </div>
              
              {/* Infinite Scroll Trigger for profile posts */}
              {hasMore && !loading && (
                <div ref={bottomRef} style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {loadingMore && <div className="muted" style={{ fontSize: '14px' }}>Memuat lebih banyak...</div>}
                </div>
              )}
            </>
          )
        )}

        {activeTab === 'replies' && (
          replies.length === 0 ? (
            <div className="center">Belum ada balasan.</div>
          ) : (
            <div className="feed-list">
              {replies.map((c) => (
                <ProfileCommentItem key={c._id} comment={c} />
              ))}
            </div>
          )
        )}

        {activeTab === 'media' && (
          mediaPosts.length === 0 ? (
            <div className="center">Belum ada media.</div>
          ) : (
            <div className="feed-list">
              {mediaPosts.map((p) => (
                <PostCard key={p._id} post={p} onDeleted={(id) => setPosts(posts.filter((x) => x._id !== id))} />
              ))}
            </div>
          )
        )}

        {activeTab === 'bookmarks' && isMe && (
          bookmarks.length === 0 ? (
            <div className="center">Belum ada postingan tersimpan.</div>
          ) : (
            <div className="feed-list">
              {bookmarks.map((p) => (
                <PostCard key={p._id} post={p} onDeleted={(id) => setBookmarks(bookmarks.filter((x) => x._id !== id))} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
