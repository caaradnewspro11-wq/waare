import { useState, useRef } from 'react';
import { Upload, Download, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, API } from '../services/api';
import { useToast } from '../services/context';

const MAX_MB = 20;
const size = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.ceil(b / 1e3) + ' KB');

export default function Converter({ tool, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | converting | done | error
  const [pct, setPct] = useState(0), [msg, setMsg] = useState(''), [link, setLink] = useState('');
  const input = useRef(); const toast = useToast();
  const fail = (m) => { setPhase('error'); setMsg(m); toast(m, 'err'); };
  const reset = () => { setFile(null); setPhase('idle'); setPct(0); setMsg(''); setLink(''); };
  const pick = (f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!tool.accept.includes(ext)) return fail(`Please choose a ${tool.accept.join(' / ')} file.`);
    if (f.size > MAX_MB * 1048576) return fail(`File exceeds ${MAX_MB} MB.`);
    setFile(f); setPhase('idle'); setMsg('');
  };
  const convert = async () => {
    const body = new FormData(); body.append('file', file); setPhase('uploading'); setPct(0);
    try {
      const { data } = await api.post(`/api/convert/${tool.id}`, body, {
        onUploadProgress: (e) => { setPct(Math.round((e.loaded / e.total) * 100)); if (e.loaded === e.total) setPhase('converting'); },
      });
      setLink(API + data.downloadUrl); setPhase('done'); toast('Conversion complete'); onDone?.();
    } catch (e) { fail(e.response?.data?.error || 'Could not reach the server.'); }
  };
  const busy = phase === 'uploading' || phase === 'converting';
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={tool.title}>
      <div className="panel">
        <button className="x" onClick={onClose} aria-label="Close"><X /></button>
        <h2>{tool.title}</h2>
        {!file ? (
          <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
            <Upload size={36} /><p>Drag & drop your {tool.accept.join('/')} file here</p>
            <button className="btn" onClick={() => input.current.click()}>Browse Files</button>
            <input ref={input} type="file" hidden accept={tool.accept.join(',')} onChange={(e) => pick(e.target.files[0])} />
            <small>Max {MAX_MB} MB</small>
          </div>
        ) : (
          <div className="file"><b>{file.name}</b><span>{size(file.size)}</span>{!busy && phase !== 'done' && <button className="link" onClick={reset}>Remove File</button>}</div>
        )}
        {busy && <div><div className="bar"><i style={{ width: phase === 'uploading' ? pct + '%' : '100%' }} className={phase === 'converting' ? 'pulse' : ''} /></div>
          <small>{phase === 'uploading' ? `Uploading ${pct}%` : 'Converting…'}</small></div>}
        {phase === 'error' && <p className="err"><AlertCircle size={16} /> {msg}</p>}
        {phase === 'done' && <p className="ok"><CheckCircle2 size={16} /> Done. Your file is kept for 30 minutes, then deleted.</p>}
        <div className="row">
          {file && (phase === 'idle' || phase === 'error') && <button className="btn" onClick={convert}>Convert</button>}
          {phase === 'done' && <><a className="btn" href={link}><Download size={16} /> Download Converted File</a><button className="btn ghost" onClick={reset}>Convert Another File</button></>}
        </div>
      </div>
    </div>
  );
}
