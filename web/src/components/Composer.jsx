import { useState } from 'react';
import api from '../api';

const CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];
const MOODS = [
  { value: 'default', label: 'Klasik' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'neon', label: 'Neon Glow' },
  { value: 'terminal', label: 'Terminal Retro' },
  { value: 'sunset', label: 'Sunset Dream (Rusaq)' },
  { value: 'lavender', label: 'Lavender Calm' }
];

export default function Composer({ onCreated }) {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [tagCategory, setTagCategory] = useState('genre');
  const [embedUrl, setEmbedUrl] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [mood, setMood] = useState('default');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  async function submit(e) {
    e.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api.post('/posts', {
        content,
        tags,
        embedUrl,
        isAnonymous,
        mood
      });
      setContent('');
      setTags([]);
      setEmbedUrl('');
      setIsAnonymous(false);
      setMood('default');
      onCreated && onCreated(r.data.post);
    } catch (e) {
      setErr(e.response?.data?.error || 'Gagal mengirim');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card composer-card mood-${mood}`} onSubmit={submit}>
      <div className="field">
        <textarea
          placeholder="Apa yang ingin Anda bisikkan hari ini?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="composer-embed-row">
        <span className="composer-row-icon">🔗</span>
        <input
          type="url"
          placeholder="Taroh URL (Youtube, Spotify, Gambar/Audio/Video, lainnya langsung disini... (auto embed) btw)"
          value={embedUrl}
          onChange={(e) => setEmbedUrl(e.target.value)}
        />
      </div>

      <div className="composer-tag-row">
        <select value={tagCategory} onChange={(e) => setTagCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          placeholder="Masukkan tag (Tanpa hastag)"
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

      <div className="composer-options-row">
        <div className="composer-mood-selector">
          <label>Tema: </label>
          <select value={mood} onChange={(e) => setMood(e.target.value)}>
            {MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <label className="whisper-toggle">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
          />
          <span className="whisper-label-text">🤫 Whisper (Anonim)</span>
        </label>
      </div>

      <hr className="composer-divider" />

      <div className="post-actions">
        <span className="muted">{content.length}/1000</span>
        <button type="submit" disabled={!content.trim() || busy} style={{ marginLeft: 'auto' }}>
          {busy ? 'Mengirim...' : 'Kirim'}
        </button>
      </div>
      {err && <div className="error">{err}</div>}
    </form>
  );
}
