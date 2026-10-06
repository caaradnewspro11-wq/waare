import { createContext, useContext, useState, useCallback, useEffect } from 'react';
const Auth = createContext(), Toast = createContext();
export const useAuth = () => useContext(Auth);
export const useToast = () => useContext(Toast);
export const useTitle = (t) => useEffect(() => { document.title = t + ' | Ali Sheelare Documents'; }, [t]);

export function Providers({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random(); setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const login = ({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); setUser(user); };
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); };
  return (
    <Auth.Provider value={{ user, login, logout }}><Toast.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}</div>
    </Toast.Provider></Auth.Provider>
  );
}
