// Minimal PDF writer: one JPEG image per page. Pure function so it can be tested without a browser.
// pages: [{ bytes: Uint8Array (JPEG), width, height }]
export function buildPdf(pages) {
  const enc = new TextEncoder(), parts = [], offsets = [];
  let pos = 0;
  const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); pos += u.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary marker
  const count = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);
  pages.forEach((p, i) => {
    const pageN = 3 + i * 3, contentN = pageN + 1, imageN = pageN + 2;
    const wPt = p.width > p.height ? 842 : 595, hPt = +(wPt * p.height / p.width).toFixed(2);
    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 ${imageN} 0 R >> >> /Contents ${contentN} 0 R >>`);
    const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
    obj(contentN, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[imageN] = pos;
    push(`${imageN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    push(p.bytes); push('\nendstream\nendobj\n');
  });
  const total = 3 + count * 3, xref = pos;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos); let o = 0; for (const u of parts) { out.set(u, o); o += u.length; }
  return out;
}
