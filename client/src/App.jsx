import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { FileText, Menu } from 'lucide-react';
import Home from './pages/Home';
import AuthPage from './pages/Auth';
import History from './pages/History';
import Admin from './pages/Admin';
import { Privacy, Terms, NotFound } from './pages/Static';
import { useAuth } from './services/context';

function ScrollToHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }); else window.scrollTo(0, 0); }, [hash, pathname]);
  return null;
}

export default function App() {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (<>
    <header><Link className="logo" to="/"><FileText /> Ali Sheelare Documents</Link>
      <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Menu /></button>
      <nav className={open ? 'open' : ''}>
        <NavLink to="/">Home</NavLink><Link to="/#tools">All Tools</Link><Link to="/#how">How It Works</Link><Link to="/#about">About</Link>
        {user ? <><NavLink to="/history">History</NavLink>{user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}<button className="link navbtn" onClick={logout}>Sign out</button></>
          : <><NavLink to="/login">Sign In</NavLink><Link className="btn sm" to="/register">Get Started</Link></>}
      </nav></header>
    <ScrollToHash />
    <main><Routes>
      <Route path="/" element={<Home />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/history" element={<History />} /><Route path="/admin" element={<Admin />} /><Route path="/privacy" element={<Privacy />} /><Route path="/terms" element={<Terms />} /><Route path="*" element={<NotFound />} />
    </Routes></main>
    <footer>© Ali Sheelare Documents · <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/#contact">Contact</Link></footer>
  </>);
}
