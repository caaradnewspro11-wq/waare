import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth, useToast, useTitle } from '../services/context';

const fmt = (d) => new Date(d).toLocaleString();

export default function Admin() {
  useTitle('Admin');
  const { user } = useAuth(), toast = useToast();
  const [tab, setTab] = useState('users'), [stats, setStats] = useState(null), [users, setUsers] = useState(null), [convs, setConvs] = useState(null), [guests, setGuests] = useState(null);
  const fail = (e) => toast(e.response?.data?.error || 'Request failed.', 'err');
  const load = useCallback(() => {
    api.get('/api/admin/stats').then((r) => setStats(r.data)).catch(fail);
    api.get('/api/admin/users').then((r) => setUsers(r.data)).catch(fail);
    api.get('/api/admin/guestbook').then((r) => setGuests(r.data)).catch(fail);
    api.get('/api/admin/conversions').then((r) => setConvs(r.data)).catch(fail);
  }, []);
  useEffect(() => { if (user?.role === 'admin') load(); }, [user, load]);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <section className="narrow"><h2>Admins only</h2><p>You do not have access to this page.</p></section>;

  const act = (fn, msg) => async () => { try { await fn(); toast(msg); load(); } catch (e) { fail(e); } };
  const del = (u) => act(() => api.delete(`/api/admin/users/${u._id}`), 'User deleted');
  const toggle = (u) => act(() => api.patch(`/api/admin/users/${u._id}`, { role: u.role === 'admin' ? 'user' : 'admin' }), 'Role updated');

  return (
    <section>
      <h2>Admin Dashboard</h2>
      {!stats ? <div className="skel" /> : (
        <div className="grid stats">{[['Users', stats.users], ['Conversions', stats.total], ['Completed', stats.completed], ['Failed', stats.failed], ['Last 24h', stats.last24]].map(([k, v]) => (
          <div key={k} className="card"><small>{k}</small><h3>{v}</h3></div>))}</div>)}
      {stats?.byTool?.length > 0 && <p className="note">By tool: {stats.byTool.map((t) => `${t.tool}: ${t.count}`).join(' · ')}</p>}
      <p className="note">Only signed-in users' conversions are recorded; guest conversions are not tracked.</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className={'btn' + (tab === 'users' ? '' : ' ghost')} onClick={() => setTab('users')}>Users</button>
        <button className={'btn' + (tab === 'conv' ? '' : ' ghost')} onClick={() => setTab('conv')}>Conversions</button>
        <button className={'btn' + (tab === 'guest' ? '' : ' ghost')} onClick={() => setTab('guest')}>Visitors</button>
      </div>
      <div className="tablewrap">
        {tab === 'users' && (!users ? <div className="skel" /> : (
          <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Conv.</th><th>Joined</th><th /></tr></thead><tbody>
            {users.map((u) => (<tr key={u._id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.conversions}</td><td>{fmt(u.createdAt)}</td>
              <td>{u._id !== undefined && u.email !== user.email && <>
                <button className="link" style={{ color: '#0b2a5b' }} onClick={toggle(u)}>{u.role === 'admin' ? 'Make user' : 'Make admin'}</button>{' '}
                <button className="link" onClick={() => window.confirm(`Delete ${u.email} and their history?`) && del(u)()}>Delete</button></>}</td></tr>))}
          </tbody></table>))}
        {tab === 'guest' && (!guests ? <div className="skel" /> : guests.length === 0 ? <div className="empty">No visitors yet.</div> : (
          <table><thead><tr><th>Name</th><th>Message</th><th>Date</th><th /></tr></thead><tbody>
            {guests.map((g) => (<tr key={g._id}><td>{g.name}</td><td style={{ whiteSpace: 'normal' }}>{g.message}</td><td>{fmt(g.createdAt)}</td>
              <td><button className="link" onClick={act(() => api.delete(`/api/admin/guestbook/${g._id}`), 'Entry removed')}>Remove</button></td></tr>))}
          </tbody></table>))}
        {tab === 'conv' && (!convs ? <div className="skel" /> : convs.length === 0 ? <div className="empty">No conversions recorded yet.</div> : (
          <table><thead><tr><th>File</th><th>Type</th><th>Status</th><th>User</th><th>Date</th><th /></tr></thead><tbody>
            {convs.map((c) => (<tr key={c._id}><td>{c.originalName}</td><td>{c.originalFormat} → {c.targetFormat}</td><td>{c.status}</td><td>{c.user?.email || 'deleted'}</td><td>{fmt(c.createdAt)}</td>
              <td><button className="link" onClick={act(() => api.delete(`/api/admin/conversions/${c._id}`), 'Record deleted')}>Delete</button></td></tr>))}
          </tbody></table>))}
      </div>
    </section>
  );
}
