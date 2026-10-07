import Guestbook from '../components/Guestbook';
import { useTitle } from '../services/context';
export default function Visitors() {
  useTitle('Visitors');
  return <section className="narrow"><h2>Our Visitors</h2><p className="note">Sign your name and say hello. Everyone can see this list.</p><Guestbook limit={100} /></section>;
}
