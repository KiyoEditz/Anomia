import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth.jsx';
import PostCard from '../components/PostCard.jsx';
import BadgeRole from '../components/BadgeRole.jsx';
import { IconComment, IconTrash } from '../components/Icons.jsx';

function CommentAvatar({ user, size = 32 }) {
  const initial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img className="avatar-img" src={user.avatarUrl} alt={user.username} style={{ width: size, height: size }} />;
  }
  return <div className="avatar-placeholder" style={{ width: size, height: size, fontSize: size > 30 ? '13px' : '10px' }}>{initial}</div>;
}

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

function groupTagsByCategory(tags) {
  const out = {};
  for (const t of tags || []) {
    out[t.category] = out[t.category] || [];
    out[t.category].push(t);
  }
  return out;
}

export default function PostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // States for inline replying
  const [activeReplyCommentId, setActiveReplyCommentId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  // Moderation delete comment states
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [commentReason, setCommentReason] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get(`/posts/${id}`),
        api.get(`/posts/${id}/comments`),
      ]);
      setPost(p.data.post);
      setComments(c.data.comments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // Handle posting top-level comments
  async function submitComment(e) {
    e.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.post(`/posts/${id}/comments`, { content });
      setComments([...comments, r.data.comment]);
      setContent('');
      
      // Increment comment count locally on the post card
      if (post) {
        setPost({ ...post, commentsCount: (post.commentsCount || 0) + 1 });
      }
    } catch (e) {
      alert('Gagal mengirim komentar');
    } finally {
      setBusy(false);
    }
  }

  // Handle posting nested replies
  async function submitReply(parentId) {
    if (!replyContent.trim() || replyBusy) return;
    setReplyBusy(true);
    try {
      // Auto prepend mention @username if not already in input
      const parentComment = comments.find((c) => c._id === parentId);
      const mentionPrefix = `@${parentComment.author.username} `;
      let finalContent = replyContent;
      if (!finalContent.toLowerCase().includes(`@${parentComment.author.username.toLowerCase()}`)) {
        finalContent = mentionPrefix + finalContent;
      }

      const r = await api.post(`/posts/${id}/comments`, { content: finalContent, parentId });
      setComments([...comments, r.data.comment]);
      setReplyContent('');
      setActiveReplyCommentId(null);

      // Increment commentsCount locally
      if (post) {
        setPost({ ...post, commentsCount: (post.commentsCount || 0) + 1 });
      }
    } catch (e) {
      alert('Gagal mengirim balasan');
    } finally {
      setReplyBusy(false);
    }
  }

  async function deleteComment(cid) {
    if (!confirm('Hapus komentar?')) return;
    try {
      await api.delete(`/posts/${id}/comments/${cid}`);
      setComments(comments.filter((c) => c._id !== cid));
      if (post) {
        setPost({ ...post, commentsCount: Math.max(0, (post.commentsCount || 0) - 1) });
      }
    } catch (e) {
      alert('Gagal menghapus komentar');
    }
  }

  async function moderateDeleteComment(cid) {
    if (!commentReason.trim()) {
      alert('Alasan wajib diisi!');
      return;
    }
    try {
      await api.delete(`/comments/${cid}/moderate`, { data: { reason: commentReason } });
      setComments(comments.filter((c) => c._id !== cid));
      setCommentToDelete(null);
      setCommentReason('');
      if (post) {
        setPost({ ...post, commentsCount: Math.max(0, (post.commentsCount || 0) - 1) });
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus komentar');
    }
  }

  if (loading) return <div className="center">Memuat postingan...</div>;
  if (!post) return <div className="center">Postingan tidak ditemukan.</div>;

  const grouped = groupTagsByCategory(post.tags);

  // Group comments: top-level vs nested replies
  const topLevelComments = comments.filter((c) => !c.parentId);
  const replies = comments.filter((c) => c.parentId);

  return (
    <div style={{ paddingBottom: '32px' }}>
      {/* Target Post */}
      <PostCard post={post} onDeleted={() => setPost(null)} />
      
      {/* Post Tag list */}
      {Object.keys(grouped).length > 0 && (
        <div className="detail-tags-box">
          <div className="detail-tags-category-label" style={{ marginBottom: 12 }}>Tag Postingan</div>
          <div className="tag-groups">
            {CATEGORIES.filter((c) => grouped[c]).map((c) => (
              <div key={c} className="detail-tags-row">
                <div className="tag-group-label">{c}</div>
                <div className="tags">
                  {grouped[c].map((t) => (
                    <Link key={t._id} to={`/tag/${t.slug}`} className={`tag ${t.category}`}>
                      #{t.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Comment Input */}
      <div className="comments-section-title">Komentar ({comments.length})</div>
      
      {user && (
        <form className="comment-input-card card" onSubmit={submitComment}>
          <textarea
            className="comment-input-textarea"
            placeholder="Tulis komentar Anda..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
          <div className="comment-input-actions">
            <span className="muted" style={{ fontSize: '12px' }}>{content.length}/500</span>
            <button className="profile-btn primary" type="submit" disabled={!content.trim() || busy}>
              Kirim
            </button>
          </div>
        </form>
      )}

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="center muted" style={{ padding: 32 }}>Belum ada komentar. Jadilah yang pertama berkomentar!</div>
      ) : (
        <div className="comments-list">
          {topLevelComments.map((comment) => {
            const commentReplies = replies.filter((r) => String(r.parentId) === String(comment._id));
            const isCommentMine = user && String(comment.author._id || comment.author.id) === String(user.id || user._id);

            return (
              <div key={comment._id} className="comment-item-wrap">
                {/* Top-Level Comment Card */}
                <article className="comment-item">
                  <div className="comment-meta">
                    <Link to={`/u/${comment.author.username}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit' }}>
                      <CommentAvatar user={comment.author} size={28} />
                      <strong className="comment-author-name">{comment.author.displayName || comment.author.username}</strong>
                      <BadgeRole role={comment.author.role} />
                    </Link>
                    <span>·</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="comment-content" style={{ marginTop: 4 }}>
                    {comment.content}
                  </div>

                  {/* Actions */}
                  <div className="comment-actions">
                    {user && (
                      <button 
                        className="comment-action-link" 
                        onClick={() => {
                          setReplyContent('');
                          setActiveReplyCommentId(activeReplyCommentId === comment._id ? null : comment._id);
                        }}
                      >
                        Balas
                      </button>
                    )}

                    {isCommentMine ? (
                      <button className="comment-action-link" style={{ color: 'var(--color-danger)' }} onClick={() => deleteComment(comment._id)}>
                        Hapus
                      </button>
                    ) : (user && (user.role === 'mod' || user.role === 'dev') && (
                      commentToDelete === comment._id ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: 4 }}>
                          <input 
                            type="text" 
                            placeholder="Alasan hapus..." 
                            value={commentReason} 
                            onChange={(e) => setCommentReason(e.target.value)} 
                            style={{ fontSize: '11px', padding: '4px 8px', height: '24px', flex: 1, minHeight: 'auto', margin: 0, width: '120px' }}
                          />
                          <button className="profile-btn primary" onClick={() => moderateDeleteComment(comment._id)} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Ya</button>
                          <button className="profile-btn" onClick={() => setCommentToDelete(null)} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Batal</button>
                        </div>
                      ) : (
                        <button className="comment-action-link" style={{ color: 'var(--color-danger)' }} onClick={() => { setCommentToDelete(comment._id); setCommentReason(''); }}>
                          Hapus (Mod)
                        </button>
                      )
                    ))}
                  </div>
                </article>

                {/* Inline Reply Input Composer */}
                {activeReplyCommentId === comment._id && user && (
                  <div className="comment-reply-composer-wrap">
                    <textarea
                      className="comment-input-textarea"
                      placeholder={`Balas @${comment.author.username}...`}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      maxLength={500}
                      disabled={replyBusy}
                      style={{ minHeight: '52px', fontSize: '13px' }}
                    />
                    <div className="comment-input-actions" style={{ marginTop: 6 }}>
                      <span className="muted" style={{ fontSize: '11px' }}>{replyContent.length}/500</span>
                      <button 
                        className="profile-btn primary" 
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                        onClick={() => submitReply(comment._id)} 
                        disabled={!replyContent.trim() || replyBusy}
                      >
                        Kirim Balasan
                      </button>
                    </div>
                  </div>
                )}

                {/* Replies list (Indented, 1 level deep only) */}
                {commentReplies.map((reply) => {
                  const isReplyMine = user && String(reply.author._id || reply.author.id) === String(user.id || user._id);
                  return (
                    <article key={reply._id} className="comment-item reply">
                      <div className="comment-meta">
                        <Link to={`/u/${reply.author.username}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit' }}>
                          <CommentAvatar user={reply.author} size={24} />
                          <strong className="comment-author-name">{reply.author.displayName || reply.author.username}</strong>
                          <BadgeRole role={reply.author.role} />
                        </Link>
                        <span>·</span>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                          {new Date(reply.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="comment-content" style={{ marginTop: 4 }}>
                        {reply.content}
                      </div>

                      <div className="comment-actions">
                        {isReplyMine ? (
                          <button className="comment-action-link" style={{ color: 'var(--color-danger)' }} onClick={() => deleteComment(reply._id)}>
                            Hapus
                          </button>
                        ) : (user && (user.role === 'mod' || user.role === 'dev') && (
                          commentToDelete === reply._id ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: 4 }}>
                              <input 
                                type="text" 
                                placeholder="Alasan hapus..." 
                                value={commentReason} 
                                onChange={(e) => setCommentReason(e.target.value)} 
                                style={{ fontSize: '11px', padding: '4px 8px', height: '24px', flex: 1, minHeight: 'auto', margin: 0, width: '120px' }}
                              />
                              <button className="profile-btn primary" onClick={() => moderateDeleteComment(reply._id)} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Ya</button>
                              <button className="profile-btn" onClick={() => setCommentToDelete(null)} style={{ fontSize: '10px', padding: '4px 8px', height: '24px' }}>Batal</button>
                            </div>
                          ) : (
                            <button className="comment-action-link" style={{ color: 'var(--color-danger)' }} onClick={() => { setCommentToDelete(reply._id); setCommentReason(''); }}>
                              Hapus (Mod)
                            </button>
                          )
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
