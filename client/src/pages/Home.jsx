import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FileSpreadsheet, FileType2 } from 'lucide-react';
import Converter from '../components/Converter';
import RecentList from '../components/RecentList';
import HeroArt from '../components/HeroArt';
import { useAuth, useTitle } from '../services/context';

const TOOLS = [
  { id: 'word-to-pdf', title: 'Word to PDF', desc: 'Turn DOCX files into polished PDFs.', accept: ['.docx'], icon: FileText },
  { id: 'pdf-to-word', title: 'PDF to Word', desc: 'Get an editable DOCX from a text-based PDF.', accept: ['.pdf'], icon: FileType2 },
  { id: 'pdf-to-excel', title: 'PDF to Excel', desc: 'Extract tabular data into an XLSX sheet.', accept: ['.pdf'], icon: FileSpreadsheet },
  { id: 'excel-to-pdf', title: 'Excel to PDF', desc: 'Convert XLSX/XLS spreadsheets to PDF.', accept: ['.xlsx', '.xls'], icon: FileSpreadsheet },
];

export default function Home() {
  useTitle('Convert Word, PDF & Excel');
  const [tool, setTool] = useState(null), [tick, setTick] = useState(0);
  const { user } = useAuth();
  return (<>
    <section className="hero">
      <h1>All Your Documents. One Simple Place.</h1>
      <p>Convert Word, PDF and Excel files in seconds. Secure, simple, and ready to download.</p>
      <div className="row"><a className="btn" href="#tools" onClick={() => setTool(TOOLS[0])}>Start Converting</a><a className="btn ghost" href="#tools">Explore Tools</a></div>
      <HeroArt />
      <div className="founder"><img src="/images/ali-sheelare.jpg" alt="Ali Sheelare" /><span><b>Ali Sheelare</b><small>Founder of Ali Sheelare Documents</small></span></div>
    </section>
    <section id="tools"><h2>Conversion Tools</h2>
      <div className="grid">{TOOLS.map((t) => (<article key={t.id} className="card"><t.icon size={40} /><h3>{t.title}</h3><p>{t.desc}</p><button className="btn" onClick={() => setTool(t)}>Convert Now</button></article>))}</div></section>
    <section id="how"><h2>How It Works</h2>
      <ol className="steps"><li>Choose a tool</li><li>Upload your file</li><li>Download the result</li></ol>
      <p className="note">Uploads are deleted right after conversion; results are deleted after 30 minutes. PDF→Word/Excel work on text-based PDFs only: scanned (image) PDFs have no OCR, and complex layouts or tables are approximated.</p></section>
    <section><h2>Recent Conversions</h2>
      {user ? <RecentList limit={5} refreshKey={tick} /> : <div className="empty"><p><Link to="/login">Sign in</Link> to keep a history of your conversions. Guests can convert freely.</p></div>}</section>
    <section id="about" className="about">
      <img src="/images/ali-sheelare.jpg" alt="Ali Sheelare, founder" />
      <div><h2>Ali Sheelare</h2><b>Founder of Ali Sheelare Documents</b>
        <p>I built this platform to make everyday document conversion fast, simple and secure for everyone.</p>
        <p id="contact" className="note">Questions? Email <a href="mailto:hello@example.com">hello@example.com</a> (replace with your real address).</p></div></section>
    {tool && <Converter key={tool.id} tool={tool} onClose={() => setTool(null)} onDone={() => setTick((n) => n + 1)} />}
  </>);
}
