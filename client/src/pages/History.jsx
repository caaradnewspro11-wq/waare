import { Navigate } from 'react-router-dom';
import RecentList from '../components/RecentList';
import { useAuth, useTitle } from '../services/context';
export default function History() {
  useTitle('Conversion History'); const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <section><h2>Your conversion history</h2><p className="note">Download links work until the file expires (30 minutes after conversion).</p><RecentList /></section>;
}
