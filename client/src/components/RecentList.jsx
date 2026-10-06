import { useEffect, useState } from 'react';
import { Download, Inbox } from 'lucide-react';
import { api, API } from '../services/api';

export default function RecentList({ limit = 50, refreshKey = 0 }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState('');
  useEffect(() => {
    setErr(''); api.get('/api/history', { params: { limit } }).then((r) => setRows(r.data)).catch((e) => { setRows([]); setErr(e.response?.data?.error || 'Could not load history.'); });
  }, [limit, refreshKey]);
  if (!rows) return <div>{[1, 2, 3].map((i) => <div key={i} className="skel" />)}</div>;
  if (err) return <p className="err">{err}</p>;
  if (!rows.length) return <div className="empty"><Inbox size={36} /><p>No conversions yet. Pick a tool to get started.</p></div>;
  return (
    <ul className="hist">{rows.map((r) => {
      const live = r.status === 'completed' && r.outputId && new Date(r.expiresAt) > new Date();
      return (<li key={r._id}><span><b>{r.originalName}</b><small>{r.originalFormat?.toUpperCase()} → {r.targetFormat?.toUpperCase()} · {new Date(r.createdAt).toLocaleString()}</small></span>
        <em className={r.status}>{r.status}</em>
        {live ? <a className="btn sm" href={`${API}/api/convert/download/${r.outputId}`}><Download size={14} /> Download</a> : <small>{r.status === 'completed' ? 'Expired' : ''}</small>}</li>);
    })}</ul>
  );
}
