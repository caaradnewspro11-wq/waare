import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../services/context';

// Edit tokens live only in this browser (never shown); they prove you wrote the entry.
const KEY = 'guestbook-own';
const readOwn = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveOwn = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export default function Guestbook({ limit = 100, showAllLink = false }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState('');
  const [name, setName] = useState(''), [message, setMessage] = useState(''), [website, setWebsite] = useState(''), [busy, setBusy] = useState(false);
  const [own, setOwn] = useState(readOwn), [editing, setEditing] = useState(null); // {id, name, message}
  const toast = useToast();
  const fail = (er, fallback) => toast(er.response?.data?.error || fallback, 'err');
  const load = useCallback(() => {
    api.get('/api/guestbook', { params: { limit } }).then((r) => { setRows(r.data); setErr(''); }).catch((e) => { setRows([]); setErr(e.response?.data?.error || 'Could not load visitors.'); });
  }, [limit]);
  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/api/guestbook', { name, message, website });
      if (data.id) { const next = { ...readOwn(), [data.id]: data.editToken }; saveOwn(next); setOwn(next); }
      setName(''); setMessage(''); toast('Thank you for signing! You can edit or delete your entry here.'); load();
    } catch (er) { fail(er, 'Could not send. Please try again.'); } finally { setBusy(false); }
  };
  const headers = (id) => ({ 'x-edit-token': own[id] });
  const forget = (id) => { const next = { ...own }; delete next[id]; saveOwn(next); setOwn(next); };

  const saveEdit = async () => {
    try { await api.patch(`/api/guestbook/${editing.id}`, { name: editing.name, message: editing.message }, { headers: headers(editing.id) }); setEditing(null); toast('Entry updated'); load(); }
    catch (er) { fail(er, 'Could not update.'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete your entry?')) return;
    try { await api.delete(`/api/guestbook/${id}`, { headers: headers(id) }); forget(id); toast('Entry deleted'); load(); }
    catch (er) { fail(er, 'Could not delete.'); }
  };

  return (
    <div>
      <form onSubmit={submit} className="form gform">
        <label>Your name<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Message (optional)<input maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Sign the visitors list'}</button>
        <small className="note">Your name and message will be shown publicly. Do not enter private information. You can edit or delete your entry later from this same browser.</small>
      </form>
      {!rows ? [1, 2, 3].map((i) => <div key={i} className="skel" />)
        : err ? <p className="err">{err}</p>
        : rows.length === 0 ? <div className="empty"><Users size={36} /><p>Be the first to sign!</p></div>
        : <ul className="hist guests">{rows.map((r) => (
          <li key={r._id}>
            {editing?.id === r._id ? (
              <span className="form">
                <input aria-label="Name" maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <input aria-label="Message" maxLength={200} value={editing.message} onChange={(e) => setEditing({ ...editing, message: e.target.value })} />
                <span className="row" style={{ justifyContent: 'flex-start', margin: 0 }}>
                  <button className="btn sm" onClick={saveEdit}>Save</button><button className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button></span>
              </span>
            ) : (<>
              <span><b>{r.name}</b>{r.message && <em className="msg">{r.message}</em>}<small>{new Date(r.createdAt).toLocaleDateString()}{r.edited ? ' · edited' : ''}</small></span>
              {own[r._id] && <span className="ownbtns"><button className="link" style={{ color: '#0b2a5b' }} onClick={() => setEditing({ id: r._id, name: r.name, message: r.message })}>Edit</button>
                <button className="link" onClick={() => remove(r._id)}>Delete</button></span>}
            </>)}
          </li>))}</ul>}
      {showAllLink && rows?.length > 0 && <p><Link to="/visitors">See all visitors →</Link></p>}
    </div>
  );
}
