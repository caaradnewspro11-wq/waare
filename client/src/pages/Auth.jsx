import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth, useToast, useTitle } from '../services/context';

export default function AuthPage({ mode }) {
  const reg = mode === 'register';
  useTitle(reg ? 'Get Started' : 'Sign In');
  const [f, setF] = useState({ name: '', email: '', password: '' }), [busy, setBusy] = useState(false);
  const { login } = useAuth(), toast = useToast(), nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post(`/api/auth/${reg ? 'register' : 'login'}`, f); login(data); toast('Welcome, ' + data.user.name); nav('/history'); }
    catch (er) { toast(er.response?.data?.error || 'Could not reach the server.', 'err'); } finally { setBusy(false); }
  };
  return (
    <section className="narrow"><h2>{reg ? 'Create your account' : 'Sign in'}</h2>
      <form onSubmit={submit} className="form">
        {reg && <label>Name<input required value={f.name} onChange={set('name')} autoComplete="name" /></label>}
        <label>Email<input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Password<input required type="password" minLength={reg ? 8 : 1} value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} /></label>
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Get Started' : 'Sign In'}</button>
      </form>
      <p className="note">{reg ? <>Have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}</p></section>
  );
}
