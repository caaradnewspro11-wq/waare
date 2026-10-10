import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Undo2, ZoomIn, ZoomOut, Type, Loader2, FileText } from 'lucide-react';
import { api } from '../services/api';
import { useToast, useTitle } from '../services/context';
import { FONTS, fontByName, analyzeLine, evaluate, bestMatch, replaceText, rgbToHex } from '../lib/scanEdit';
import { buildPdf } from '../lib/pdf';

const MAX_MB = 20;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp';
const lineText = (line) => line.words.map((w) => w.text).join(' ');
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

export default function ScanEditor() {
  useTitle('Edit Scanned Document');
  const toast = useToast(), input = useRef(), holder = useRef();
  const pages = useRef([]), analysis = useRef({}), manual = useRef({});
  const [phase, setPhase] = useState('pick'); // pick | analyzing | edit
  const [msg, setMsg] = useState(''), [pct, setPct] = useState(0), [name, setName] = useState('');
  const [pageIdx, setPageIdx] = useState(0), [zoom, setZoom] = useState(100), [showBoxes, setShowBoxes] = useState(true);
  const [sel, setSel] = useState(null);           // { li, start, end }
  const [form, setForm] = useState(null);         // { text, fontName, bold, italic, size, color, align, shrink }
  const [fit, setFit] = useState(null);           // { baselineY, score, auto }
  const [matching, setMatching] = useState(false), [warn, setWarn] = useState('');
  const [, setTick] = useState(0); const bump = () => setTick((t) => t + 1);

  const page = pages.current[pageIdx];
  const selLine = page && sel ? page.lines[sel.li] : null;
  const selWords = selLine ? selLine.words.slice(sel.start, sel.end + 1) : [];
  const lineKey = selLine ? `${pageIdx}:${sel.li}:${lineText(selLine)}` : '';

  const fail = (m) => { setMsg(m); setPhase('pick'); toast(m, 'err'); };
  const pick = async (file) => {
    if (!file) return;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPT.split(',').includes(ext)) return fail('Please choose a PDF or an image (JPG, PNG, TIFF, BMP, WebP).');
    if (file.size > MAX_MB * 1048576) return fail(`File exceeds ${MAX_MB} MB.`);
    setMsg(''); setName(file.name); setPhase('analyzing'); setPct(0);
    try {
      const body = new FormData(); body.append('lang', 'eng'); body.append('file', file);
      const { data } = await api.post('/api/scan/analyze', body, { onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
      const list = [];
      for (const p of data.pages) {
        const blob = (await api.get(`/api/scan/${data.id}/page/${p.n}`, { responseType: 'blob' })).data;
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
        list.push({ n: p.n, width: bmp.width, height: bmp.height, lines: p.lines, canvas, undo: [] });
      }
      pages.current = list; analysis.current = {}; manual.current = {};
      setPageIdx(0); setSel(null); setForm(null); setPhase('edit');
    } catch (e) { fail(e.response?.data?.error || e.message || 'Could not analyse this file.'); }
  };

  // show the current page's canvas
  useEffect(() => { if (phase === 'edit' && holder.current && page) { page.canvas.className = 'pagecanvas'; holder.current.replaceChildren(page.canvas); } }, [phase, pageIdx, page]);

  // when the line changes: find the matching font (or keep the one the user chose for this line)
  useEffect(() => {
    if (!selLine) { setFit(null); return; }
    setMatching(true);
    const t = setTimeout(() => {
      try {
        const pg = pages.current[pageIdx], ctx = pg.canvas.getContext('2d');
        const an = analyzeLine(ctx, pg.width, pg.height, selLine); analysis.current[lineKey] = an;
        const text = lineText(selLine), m = manual.current[`${pageIdx}:${sel.li}`];
        const r = (m && evaluate(an, text, m)) || bestMatch(an, text);
        if (r) {
          setFit({ baselineY: r.baselineY, score: r.score, auto: !m });
          setForm((f) => ({ ...f, fontName: r.fontName, bold: r.bold, italic: r.italic, size: Math.round(r.size * 10) / 10, color: rgbToHex(an.color) }));
        } else setWarn('Could not detect the font for this line. Pick a font manually.');
      } catch { setWarn('Could not analyse this line.'); }
      setMatching(false);
    }, 20);
    return () => clearTimeout(t);
  }, [lineKey]); // eslint-disable-line

  const select = (li, start, end) => {
    const words = pages.current[pageIdx].lines[li].words.slice(start, end + 1);
    setSel({ li, start, end }); setWarn('');
    setForm((f) => ({ align: 'left', shrink: false, move: true, bold: false, italic: false, fontName: 'Arial', size: 20, color: '#000000', ...f, text: words.map((w) => w.text).join(' ') }));
  };
  const extend = (dir) => {
    const line = selLine; let { start, end } = sel;
    if (dir < 0 && start > 0) start--; if (dir > 0 && end < line.words.length - 1) end++;
    select(sel.li, start, end);
  };

  const changeFont = (patch) => {
    const next = { ...form, ...patch }; setForm(next);
    const an = analysis.current[lineKey]; if (!an) return;
    manual.current[`${pageIdx}:${sel.li}`] = { fontName: next.fontName, bold: next.bold, italic: next.italic };
    const r = evaluate(an, lineText(selLine), manual.current[`${pageIdx}:${sel.li}`]);
    if (r) { setForm((f) => ({ ...f, size: Math.round(r.size * 10) / 10 })); setFit({ baselineY: r.baselineY, score: r.score, auto: false }); }
  };

  const apply = () => {
    if (!sel || !fit || !form) return;
    const pg = pages.current[pageIdx], line = pg.lines[sel.li], ws = line.words.slice(sel.start, sel.end + 1);
    const text = form.text.replace(/\s+/g, ' ').trim();
    const sb = { x0: Math.min(...ws.map((w) => w.x)), x1: Math.max(...ws.map((w) => w.x + w.w)), y0: Math.min(...ws.map((w) => w.y)), y1: Math.max(...ws.map((w) => w.y + w.h)) };
    const prev = line.words[sel.start - 1], next = line.words[sel.end + 1], hh = sb.y1 - sb.y0;
    const limits = { left: prev ? prev.x + prev.w : Math.max(0, sb.x0 - hh * 3), right: next ? next.x : Math.min(pg.width, sb.x1 + hh * 3) };
    const before = structuredClone(line);
    const rest = line.words.slice(sel.end + 1);
    const tail = rest.length ? { x0: Math.min(...rest.map((w) => w.x)), x1: Math.max(...rest.map((w) => w.x + w.w)), y0: Math.min(...rest.map((w) => w.y)), y1: Math.max(...rest.map((w) => w.y + w.h)) } : null;
    const res = replaceText(pg.canvas.getContext('2d'), pg.width, pg.height, {
      sel: sb, limits, tail, move: form.move, text, align: form.align, shrink: form.shrink,
      style: { fontName: form.fontName, bold: form.bold, italic: form.italic, size: Number(form.size) || 20, color: form.color, baselineY: fit.baselineY },
    });
    pg.undo.push({ ...res.undo, li: sel.li, before }); if (pg.undo.length > 40) pg.undo.shift();
    if (res.delta) rest.forEach((w) => { w.x += res.delta; });
    line.words.splice(sel.start, ws.length, ...(res.word ? [res.word] : []));
    if (!line.words.length) { pg.lines.splice(sel.li, 1); setSel(null); setForm(null); }
    else { line.x = Math.min(...line.words.map((w) => w.x)); line.w = Math.max(...line.words.map((w) => w.x + w.w)) - line.x; { const s0 = Math.min(sel.start, line.words.length - 1); setSel({ li: sel.li, start: s0, end: s0 }); } setForm((f) => ({ ...f, text })); }
    setWarn(res.overflow ? 'The new text is wider than the space available and overlaps a neighbouring word. Turn on "Move the rest of the line", use "Shrink to fit" or a smaller size, or undo.'
      : res.noRoom ? 'There is not enough room on the page to move the rest of the line, so the text was placed in the old space. Use "Shrink to fit" or a smaller size.' : '');
    toast(text ? 'Text replaced' : 'Text removed'); bump();
  };

  const undo = () => {
    const pg = pages.current[pageIdx], u = pg?.undo.pop(); if (!u) return;
    pg.canvas.getContext('2d').putImageData(u.img, u.x, u.y);
    pg.lines[u.li] ? (pg.lines[u.li] = u.before) : pg.lines.splice(u.li, 0, u.before);
    setSel(null); setForm(null); setWarn(''); bump();
  };

  const base = name.replace(/\.[^.]+$/, '') || 'scan';
  const savePng = async () => download(await toBlob(page.canvas, 'image/png'), `${base}-page-${page.n}-edited.png`);
  const savePdf = async () => {
    const out = [];
    for (const pg of pages.current) out.push({ bytes: new Uint8Array(await (await toBlob(pg.canvas, 'image/jpeg', 0.92)).arrayBuffer()), width: pg.width, height: pg.height });
    download(new Blob([buildPdf(out)], { type: 'application/pdf' }), `${base}-edited.pdf`);
  };

  const pc = (v, t) => (v / t) * 100 + '%';
  const onKey = useCallback((e) => { if (e.key === 'Escape') { setSel(null); setForm(null); } }, []);
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onKey]);

  if (phase !== 'edit') return (
    <section className="narrow"><h2>Edit a Scanned Document</h2>
      <p className="note">Upload a scanned paper, a photo of a document, or a scanned PDF. Click any word, type the new text, and it is drawn back into the picture in a matching font. Then download it as an image or PDF.</p>
      {phase === 'analyzing' ? (
        <div className="drop"><Loader2 className="spin" size={36} /><p>{pct < 100 ? `Uploading ${pct}%` : 'Reading the text on your pages… this can take up to a minute.'}</p></div>
      ) : (
        <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
          <Upload size={36} /><p>Drag & drop a scan, photo or PDF here</p>
          <button className="btn" onClick={() => input.current.click()}>Browse Files</button>
          <input ref={input} type="file" hidden accept={ACCEPT} onChange={(e) => pick(e.target.files[0])} />
          <small>PDF, JPG, PNG, TIFF, BMP, WebP · up to {MAX_MB} MB · first 8 pages</small>
        </div>)}
      {msg && <p className="err">{msg}</p>}
      <p className="note">Works best on clear, printed or typed text in English or Somali (Latin letters). Handwriting is not supported. Your pages are kept on the server for 30 minutes so your browser can load them; the edited file is created on your own device and is never uploaded back.</p>
    </section>);

  return (
    <section className="editor">
      <div className="edbar">
        <h2><FileText size={20} /> {name}</h2>
        <div className="row" style={{ margin: 0 }}>
          {pages.current.length > 1 && pages.current.map((p, i) => <button key={p.n} className={'btn sm' + (i === pageIdx ? '' : ' ghost')} onClick={() => { setPageIdx(i); setSel(null); setForm(null); }}>Page {p.n}</button>)}
          <button className="btn sm ghost" onClick={() => setZoom((z) => Math.max(50, z - 25))} aria-label="Zoom out"><ZoomOut size={16} /></button>
          <span className="zoomv">{zoom}%</span>
          <button className="btn sm ghost" onClick={() => setZoom((z) => Math.min(300, z + 25))} aria-label="Zoom in"><ZoomIn size={16} /></button>
          <button className="btn sm ghost" onClick={undo} disabled={!page?.undo.length}><Undo2 size={16} /> Undo</button>
          <button className="btn sm" id="dl-png" onClick={savePng}><Download size={16} /> Page PNG</button>
          <button className="btn sm" id="dl-pdf" onClick={savePdf}><Download size={16} /> PDF</button>
          <button className="btn sm ghost" onClick={() => { setPhase('pick'); pages.current = []; setSel(null); setForm(null); }}>New file</button>
        </div>
      </div>
      <div className="edgrid">
        <div className="pagescroll">
          <div className="pagewrap" style={{ width: zoom + '%' }}>
            <div ref={holder} />
            {showBoxes && <div className="overlay">{page.lines.map((line, li) => line.words.map((w, wi) => {
              const on = sel && sel.li === li && wi >= sel.start && wi <= sel.end;
              return <button key={`${li}-${wi}-${w.x}`} aria-label={`Edit ${w.text}`} data-text={w.text} title={w.text}
                className={'wbox' + (on ? ' on' : '') + (w.edited ? ' done' : '') + (w.conf < 60 ? ' low' : '')}
                style={{ left: pc(w.x, page.width), top: pc(w.y, page.height), width: pc(w.w, page.width), height: pc(w.h, page.height) }}
                onClick={(e) => (e.shiftKey && sel && sel.li === li ? select(li, Math.min(sel.start, wi), Math.max(sel.end, wi)) : select(li, wi, wi))} />;
            }))}</div>}
          </div>
        </div>
        <aside className="edpanel">
          {!sel || !form ? (
            <div className="empty"><Type size={32} /><p>Click a word on the page to change it.</p>
              <small>Tip: hold Shift and click another word to select several in the same line.</small>
              <label className="chk"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show text boxes</label></div>
          ) : (<>
            <h3>Replace text</h3>
            <label>New text<input id="edit-text" autoFocus value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} /></label>
            <div className="row" style={{ justifyContent: 'flex-start', margin: 0 }}>
              <button className="btn sm ghost" onClick={() => extend(-1)} disabled={sel.start === 0}>+ previous word</button>
              <button className="btn sm ghost" onClick={() => extend(1)} disabled={sel.end >= selLine.words.length - 1}>+ next word</button>
              <button className="btn sm ghost" onClick={() => select(sel.li, 0, selLine.words.length - 1)}>Whole line</button></div>
            <small className="note">Original: “{selWords.map((w) => w.text).join(' ')}”{selWords.some((w) => w.conf < 60) ? ' · low reading confidence, check it' : ''}</small>
            <div className={'fitnote' + (fit && fit.score < 0.25 ? ' weak' : '')}>
              {matching ? <><Loader2 className="spin" size={14} /> Detecting font…</> : fit ? (fit.auto ? `Auto-matched: ${form.fontName}${form.bold ? ' Bold' : ''}${form.italic ? ' Italic' : ''} (${Math.round(fit.score * 100)}% overlap)${fit.score < 0.25 ? ' · weak match, try another font' : ''}` : `Font chosen by you (${Math.round(fit.score * 100)}% overlap)`) : warn || 'Select a word'}
            </div>
            <label>Font<select value={form.fontName} onChange={(e) => changeFont({ fontName: e.target.value })}>{FONTS.map((f) => <option key={f.name}>{f.name}</option>)}</select></label>
            <div className="two">
              <label className="chk"><input type="checkbox" checked={form.bold} onChange={(e) => changeFont({ bold: e.target.checked })} /> Bold</label>
              <label className="chk"><input type="checkbox" checked={form.italic} onChange={(e) => changeFont({ italic: e.target.checked })} /> Italic</label></div>
            <div className="two">
              <label>Size (px)<input type="number" min="4" max="400" step="0.5" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></label>
              <label>Colour<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label></div>
            <div className="two">
              <label>Align in the old space<select value={form.align} onChange={(e) => setForm({ ...form, align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
              <label className="chk"><input type="checkbox" checked={form.shrink} onChange={(e) => setForm({ ...form, shrink: e.target.checked })} /> Shrink to fit</label></div>
            <label className="chk"><input type="checkbox" checked={form.move} onChange={(e) => setForm({ ...form, move: e.target.checked })} /> Move the rest of the line to fit (keeps spacing)</label>
            {warn && fit && <p className="err" style={{ margin: 0 }}>{warn}</p>}
            <div className="row" style={{ justifyContent: 'flex-start', margin: 0 }}>
              <button className="btn" id="apply-edit" onClick={apply} disabled={!fit || matching}>Apply</button>
              <button className="btn ghost" onClick={() => { setSel(null); setForm(null); }}>Cancel</button></div>
            <small className="note">Leave the text empty and press Apply to erase the word.</small>
          </>)}
        </aside>
      </div>
      <p className="note">The font is matched by comparing the original text with each font; it is an approximation, so check the result and adjust the font or size if needed. Always proofread before using an edited document.</p>
    </section>
  );
}
