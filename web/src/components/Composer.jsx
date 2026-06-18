import { useState, useRef } from 'react';
import api from '../api';

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

export default function Composer({ onCreated }) {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [tagCategory, setTagCategory] = useState('genre');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);

  function addTag() {
    const name = tagName.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.category === tagCategory)) return;
    setTags([...tags, { name, category: tagCategory }]);
    setTagName('');
  }

  function removeTag(i) {
    setTags(tags.filter((_, idx) => idx !== i));
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setErr('File maksimum 20MB');
      e.target.value = '';
      return;
    }
    setErr('');
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      let r;
      if (file) {
        const fd = new FormData();
        fd.append('content', content);
        fd.append('tags', JSON.stringify(tags));
        fd.append('file', file);
        r = await api.post('/posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        r = await api.post('/posts', { content, tags });
      }
      setContent('');
      setTags([]);
      clearFile();
      onCreated && onCreated(r.data.post);
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal mengirim');
    } finally {
      setBusy(false);
    }
  }

  const isVideo = file && file.type.startsWith('video/');

  return (
    <form className="card" onSubmit={submit}>
      <div className="field">
        <textarea
          placeholder="Apa yang sedang terjadi?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={500}
        />
      </div>
      {preview && (
        <div className="media-preview">
          {isVideo ? (
            <video src={preview} controls />
          ) : (
            <img src={preview} alt="preview" />
          )}
          <button type="button" className="ghost" onClick={clearFile}>× Hapus media</button>
        </div>
      )}
      <div className="composer-tag-row">
        <select value={tagCategory} onChange={(e) => setTagCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          placeholder="Nama tag"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        />
        <button type="button" className="ghost" onClick={addTag}>+ Tag</button>
      </div>
      {tags.length > 0 && (
        <div className="tags" style={{ marginTop: 8 }}>
          {tags.map((t, i) => (
            <span key={i} className={`tag ${t.category}`} onClick={() => removeTag(i)} style={{ cursor: 'pointer' }} title="Klik untuk hapus">
              {t.name} ×
            </span>
          ))}
        </div>
      )}
      <div className="post-actions">
        <label className="ghost file-label">
          📎 Media
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </label>
        <span className="muted">{content.length}/500</span>
        <button type="submit" disabled={!content.trim() || busy} style={{ marginLeft: 'auto' }}>
          Kirim
        </button>
      </div>
      {err && <div className="error">{err}</div>}
    </form>
  );
}
