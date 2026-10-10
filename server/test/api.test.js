import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import { app } from '../src/app.js';

let srv, base;
const has = (cmd, arg) => { try { execFileSync(cmd, [arg], { stdio: 'ignore' }); return true; } catch { return false; } };
const hasSoffice = has('soffice', '--version'), hasOcr = has('tesseract', '--version') && has('pdftoppm', '-v');
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

before(() => new Promise((r) => { srv = app.listen(0, () => { base = `http://localhost:${srv.address().port}`; r(); }); }));
after(() => srv.close());

const post = (url, bytes, name, type, extra = {}) => {
  const f = new FormData(); for (const [k, v] of Object.entries(extra)) f.append(k, v);
  f.append('file', new Blob([bytes], { type }), name);
  return fetch(base + url, { method: 'POST', body: f });
};
const convert = (tool, bytes, name, type, extra) => post(`/api/convert/${tool}`, bytes, name, type, extra);
const fetchBytes = async (r) => Buffer.from(await (await fetch(base + (await r.json()).downloadUrl)).arrayBuffer());
const docxInfo = async (buf) => {
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  return { tables: (xml.match(/<w:tbl>/g) || []).length, cells: (xml.match(/<w:tc>/g) || []).length, xml, text: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]) };
};
const cell = (t, right) => new TableCell({ children: [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [] }), new Paragraph(String(t))] });
async function wordWithTable() {
  const rows = [['Item', 'Region', 'Qty', 'Total'], ['Laptop', 'Mogadishu', '12', '14,400.00'], ['Phone', 'Hargeisa', '30', '9,000.00'], ['Tablet', '', '7', '2,100.00']];
  return Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Sales Report'), new Table({ width: { size: 9000, type: WidthType.DXA }, rows: rows.map((r) => new TableRow({ children: r.map((t) => new TableCell({ children: [new Paragraph(t)] })) })) }), new Paragraph('End of report.')] }] }));
}

// ---------- basics ----------
test('health', async () => assert.equal((await fetch(`${base}/api/health`)).status, 200));
test('unknown tool -> 404', async () => assert.equal((await convert('nope', 'x', 'a.pdf', 'application/pdf')).status, 404));
test('wrong type -> 415', async () => assert.equal((await convert('pdf-to-word', 'x', 'a.txt', 'text/plain')).status, 415));
test('bad download id -> 400', async () => assert.equal((await fetch(`${base}/api/convert/download/..%2f..%2fetc`)).status >= 400, true));
test('admin requires auth', async () => assert.equal((await fetch(`${base}/api/admin/stats`)).status, 401));
test('history requires auth', async () => assert.equal((await fetch(`${base}/api/history`)).status, 401));
test('guestbook unavailable without database -> 503', async () => assert.equal((await fetch(`${base}/api/guestbook`)).status, 503));
test('admin cannot delete guestbook without auth', async () => assert.equal((await fetch(`${base}/api/admin/guestbook/abc`, { method: 'DELETE' })).status, 401));
test('corrupt PDF is rejected, not faked', async () => assert.equal((await convert('pdf-to-word', 'not a pdf', 'a.pdf', 'application/pdf')).status, 500));
test('scan editor: bad page id -> 400, unknown -> 404', async () => {
  assert.equal((await fetch(`${base}/api/scan/xyz/page/1`)).status, 400);
  assert.equal((await fetch(`${base}/api/scan/11111111-1111-1111-1111-111111111111/page/1`)).status, 404);
});
test('scan editor: wrong type -> 415', async () => assert.equal((await post('/api/scan/analyze', 'x', 'a.docx', 'application/msword')).status, 415));

// ---------- tables: Word -> PDF -> Word/Excel ----------
test('PDF with a table -> Word keeps a real table (all cells, incl. the empty one)', { skip: !hasSoffice, timeout: 120000 }, async () => {
  const pdf = await fetchBytes(await convert('word-to-pdf', await wordWithTable(), 'a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  const w = await docxInfo(await fetchBytes(await convert('pdf-to-word', pdf, 'a.pdf', 'application/pdf')));
  assert.equal(w.tables, 1); assert.equal(w.cells, 16);
  for (const t of ['Item', 'Mogadishu', '14,400.00', 'End of report.']) assert.ok(w.text.includes(t), t);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await fetchBytes(await convert('pdf-to-excel', pdf, 'a.pdf', 'application/pdf')));
  const rows = []; wb.eachSheet((ws) => ws.eachRow((r) => rows.push(r.values.slice(1))));
  const laptop = rows.find((r) => r[0] === 'Laptop'); assert.deepEqual(laptop, ['Laptop', 'Mogadishu', 12, 14400]);
  assert.equal(rows.find((r) => r[0] === 'Tablet').length, 4);
});

test('Excel -> PDF -> Word round trip keeps the sheet as a table', { skip: !hasSoffice, timeout: 120000 }, async () => {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('S');
  ws.addRow(['Name', 'Score', 'Grade']); ws.addRow(['Amina', 91, 'A']); ws.addRow(['Yusuf', 78, 'B']); ws.addRow(['Hodan', 85, 'A']);
  const pdf = await fetchBytes(await convert('excel-to-pdf', Buffer.from(await wb.xlsx.writeBuffer()), 'a.xlsx', XLSX));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const w = await docxInfo(await fetchBytes(await convert('pdf-to-word', pdf, 'a.pdf', 'application/pdf')));
  assert.equal(w.tables, 1); assert.equal(w.cells, 12); assert.ok(w.text.includes('Amina'));
});

test('Plain text PDF does NOT turn into a table', { skip: !hasSoffice, timeout: 120000 }, async () => {
  const body = new Document({ sections: [{ children: Array.from({ length: 6 }, (_, i) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, text: `Paragraph ${i + 1}: this is ordinary running text that should stay as normal paragraphs, never as a table, even when the line is long and justified across the page.` })) }] });
  const pdf = await fetchBytes(await convert('word-to-pdf', await Packer.toBuffer(body), 'a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  const w = await docxInfo(await fetchBytes(await convert('pdf-to-word', pdf, 'a.pdf', 'application/pdf')));
  assert.equal(w.tables, 0); assert.ok(w.text.join(' ').includes('ordinary running text'));
});

// ---------- OCR ----------
test('OCR: scanned PNG and image-only PDF -> editable DOCX with the real text', { skip: !hasOcr, timeout: 180000 }, async () => {
  for (const [name, type] of [['scan.png', 'image/png'], ['scan.pdf', 'application/pdf']]) {
    const r = await convert('scan-to-word', fx(name), name, type); assert.equal(r.status, 200, name);
    const w = await docxInfo(await fetchBytes(r)); assert.match(w.text.join(' '), /Invoice/); assert.match(w.text.join(' '), /editable/);
  }
});

test('OCR: a scanned table becomes a Word table', { skip: !hasOcr, timeout: 180000 }, async () => {
  const w = await docxInfo(await fetchBytes(await convert('scan-to-word', fx('scan-table.png'), 'scan-table.png', 'image/png')));
  assert.equal(w.tables, 1); assert.equal(w.cells, 12);
  for (const t of ['Product', 'Oranges', '4.25', 'Monthly Report']) assert.ok(w.text.includes(t), t);
});

test('Scan editor: analyze returns word boxes and a downloadable page image', { skip: !hasOcr, timeout: 180000 }, async () => {
  const r = await post('/api/scan/analyze', fx('scan-edit.png'), 'scan-edit.png', 'image/png'); assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.pages.length, 1);
  const words = j.pages[0].lines.flatMap((l) => l.words);
  const hit = words.find((w) => w.text === 'Hassan'); assert.ok(hit, 'Hassan not found');
  assert.ok(hit.w > 20 && hit.h > 20 && hit.x > 0 && hit.y > 0);
  const img = await fetch(`${base}/api/scan/${j.id}/page/1`); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/api/scan/${j.id}/page/2`)).status, 404);
});
test('Scan editor: also accepts a PDF', { skip: !hasOcr, timeout: 180000 }, async () => {
  const j = await (await post('/api/scan/analyze', fx('scan.pdf'), 'scan.pdf', 'application/pdf')).json();
  assert.ok(j.pages[0].lines.length >= 3);
});

test('Scan editor: a 2-page scanned PDF gives 2 pages with text each', { skip: !hasOcr, timeout: 240000 }, async () => {
  const j = await (await post('/api/scan/analyze', fx('scan-2pages.pdf'), 'scan-2pages.pdf', 'application/pdf')).json();
  assert.equal(j.pages.length, 2);
  const text = (p) => p.lines.flatMap((l) => l.words.map((w) => w.text)).join(' ');
  assert.match(text(j.pages[0]), /heading/); assert.match(text(j.pages[1]), /title/);
  for (const n of [1, 2]) assert.equal((await fetch(`${base}/api/scan/${j.id}/page/${n}`)).status, 200);
});
