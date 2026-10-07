import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../services/context';

export default function Guestbook({ limit = 100, showAllLink = false }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState('');
  const [name, setName] = useState(''), [message, setMessage] = useState(''), [website, setWebsite] = useState(''), [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(() => {
    api.get('/api/guestbook', { params: { limit } }).then((r) => { setRows(r.data); setErr(''); }).catch((e) => { setRows([]); setErr(e.response?.data?.error || 'Could not load visitors.'); });
  }, [limit]);
  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/api/guestbook', { name, message, website }); setName(''); setMessage(''); toast('Thank you for signing!'); load(); }
    catch (er) { toast(er.response?.data?.error || 'Could not send. Please try again.', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <form onSubmit={submit} className="form gform">
        <label>Your name<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Message (optional)<input maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Sign the visitors list'}</button>
        <small className="note">Your name and message will be shown publicly on this website. Do not enter private information.</small>
      </form>
      {!rows ? [1, 2, 3].map((i) => <div key={i} className="skel" />)
        : err ? <p className="err">{err}</p>
        : rows.length === 0 ? <div className="empty"><Users size={36} /><p>Be the first to sign!</p></div>
        : <ul className="hist guests">{rows.map((r, i) => (<li key={i}><span><b>{r.name}</b>{r.message && <em className="msg">{r.message}</em>}<small>{new Date(r.createdAt).toLocaleDateString()}</small></span></li>))}</ul>}
      {showAllLink && rows?.length > 0 && <p><Link to="/visitors">See all visitors →</Link></p>}
    </div>
  );
}
