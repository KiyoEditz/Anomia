import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../auth.jsx';
import { IconCamera, IconGallery, IconHashtag, IconMention, IconClose } from './Icons.jsx';

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

// Utility Avatar component
function ComposerAvatar({ user, size = 40 }) {
  const initial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img className="avatar-img" src={user.avatarUrl} alt={user.username} style={{ width: size, height: size }} />;
  }
  return <div className="avatar-placeholder" style={{ width: size, height: size }}>{initial}</div>;
}

// 1. CreatePostBar Component
export function CreatePostBar() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const handleBarClick = () => {
    window.dispatchEvent(new CustomEvent('open-composer-modal'));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      window.dispatchEvent(new CustomEvent('open-composer-modal', { detail: { file } }));
    }
  };

  if (!user) return null;

  return (
    <div className="create-post-bar card" onClick={handleBarClick}>
      <ComposerAvatar user={user} size={40} />
      <div className="create-post-bar-input">Apa yang ingin kamu bagikan?</div>
      
      <div className="create-post-bar-actions" onClick={(e) => e.stopPropagation()}>
        <label className="create-post-bar-btn" title="Ambil Foto/Video">
          <IconCamera size={20} />
          <input
            type="file"
            accept="image/*,video/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </label>
        
        <label className="create-post-bar-btn" title="Pilih dari Galeri">
          <IconGallery size={20} />
          <input
            type="file"
            accept="image/*,video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            ref={fileInputRef}
          />
        </label>
      </div>
      <div className="post-divider" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}></div>
    </div>
  );
}

// 2. ComposerModal Component
export function ComposerModal({ isOpen, onClose, preselectedFile = null }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [tagCategory, setTagCategory] = useState('genre');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [err, setErr] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sync preselected file
  useEffect(() => {
    if (isOpen && preselectedFile) {
      handleSetFile(preselectedFile);
    }
  }, [isOpen, preselectedFile]);

  // Auto focus and auto height for textarea
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isOpen, content]);

  const handleSetFile = (f) => {
    if (f.size > 20 * 1024 * 1024) {
      setErr('File maksimum 20MB');
      return;
    }
    setErr('');
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) handleSetFile(f);
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addTag = () => {
    const name = tagName.trim().replace(/^#/, '');
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.category === tagCategory)) return;
    setTags([...tags, { name, category: tagCategory }]);
    setTagName('');
  };

  const removeTag = (idx) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  const triggerUploadProgress = async () => {
    // Stage 1: Uploading
    setUploadStatus('Mengunggah...');
    setUploadProgress(20);
    await new Promise((r) => setTimeout(r, 400));
    setUploadProgress(50);
    
    // Stage 2: Checking (Simulation for moderation checking)
    await new Promise((r) => setTimeout(r, 300));
    setUploadStatus('Memeriksa...');
    setUploadProgress(80);
    
    // Stage 3: Posting
    await new Promise((r) => setTimeout(r, 300));
    setUploadStatus('Memposting...');
    setUploadProgress(100);
    await new Promise((r) => setTimeout(r, 200));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!content.trim() || busy) return;

    setBusy(true);
    setErr('');
    setUploadProgress(0);

    try {
      // Run progress simulation
      const progressPromise = triggerUploadProgress();
      
      let res;
      if (file) {
        const fd = new FormData();
        fd.append('content', content);
        fd.append('tags', JSON.stringify(tags));
        fd.append('file', file);
        fd.append('_hp', honeypot);
        
        // Make the API post request in parallel with progress bar
        const [apiRes] = await Promise.all([
          api.post('/posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
          progressPromise
        ]);
        res = apiRes;
      } else {
        const [apiRes] = await Promise.all([
          api.post('/posts', { content, tags, _hp: honeypot }),
          progressPromise
        ]);
        res = apiRes;
      }

      // Successful! Clear modal fields and notify parent
      setContent('');
      setTags([]);
      clearFile();
      
      // Dispatch custom event to notify feeds
      window.dispatchEvent(new CustomEvent('new-post-created', { detail: res.data.post }));
      
      // Close the modal
      handleClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal mengirim postingan');
      setUploadProgress(0);
      setUploadStatus('');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setContent('');
    setTags([]);
    clearFile();
    setErr('');
    setUploadProgress(0);
    setUploadStatus('');
    onClose();
  };

  if (!isOpen) return null;

  const isVideo = file && file.type.startsWith('video/');
  const isValid = content.trim().length > 0;

  return (
    <div className="fullscreen-modal">
      {/* Header */}
      <div className="modal-header">
        <button className="modal-close-btn" onClick={handleClose} disabled={busy}>
          Batal
        </button>
        <span className="modal-header-title">Buat Postingan Baru</span>
        <button 
          className="modal-submit-btn" 
          onClick={handleSubmit} 
          disabled={!isValid || busy}
        >
          {busy ? 'Mengirim...' : 'Kirim'}
        </button>
      </div>

      {/* Upload Progress Bar */}
      {busy && (
        <>
          <div className="modal-progress-bar-wrap">
            <div className="modal-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          {uploadStatus && <div className="modal-upload-status">{uploadStatus}</div>}
        </>
      )}

      {/* Body */}
      <div className="modal-body">
        {err && <div className="error card" style={{ color: 'var(--color-danger)', background: 'var(--color-accent-soft)' }}>{err}</div>}
        
        <div className="modal-composer-row">
          <ComposerAvatar user={user} size={40} />
          <textarea
            ref={textareaRef}
            className="modal-textarea"
            placeholder="Apa yang sedang terjadi?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
        </div>

        {/* Media Preview */}
        {preview && (
          <div className="modal-media-preview-wrap">
            {isVideo ? (
              <video src={preview} controls style={{ width: '100%' }} />
            ) : (
              <img src={preview} alt="preview" />
            )}
            {!busy && (
              <button className="modal-media-remove-btn" onClick={clearFile}>
                × Hapus
              </button>
            )}
          </div>
        )}

        {/* Tags Section */}
        <div className="modal-tags-section">
          <div className="detail-tags-category-label">Kategori Tag</div>
          <div className="tag-selector-row">
            <select 
              className="tag-selector-select" 
              value={tagCategory} 
              onChange={(e) => setTagCategory(e.target.value)}
              disabled={busy}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="tag-selector-input"
              placeholder="Nama tag..."
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => { 
                if (e.key === 'Enter') { 
                  e.preventDefault(); 
                  addTag(); 
                } 
              }}
            />
            <button className="tag-selector-add-btn" type="button" onClick={addTag} disabled={busy}>
              + Tambah
            </button>
          </div>
          
          {/* Active Tags */}
          {tags.length > 0 && (
            <div className="tags" style={{ marginTop: 8 }}>
              {tags.map((t, i) => (
                <span 
                  key={i} 
                  className={`tag ${t.category}`} 
                  onClick={() => !busy && removeTag(i)} 
                  title="Klik untuk menghapus tag"
                >
                  #{t.name} ×
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer toolbar */}
      <div className="modal-footer">
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
        <div className="modal-footer-actions">
          <label className="modal-footer-btn" title="Ambil Foto/Video" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
            <IconCamera size={22} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              disabled={busy}
            />
          </label>
          <label className="modal-footer-btn" title="Pilih dari Galeri" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
            <IconGallery size={22} />
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              disabled={busy}
            />
          </label>
        </div>
        <div className="modal-char-counter">
          {content.length}/500
        </div>
      </div>
    </div>
  );
}
