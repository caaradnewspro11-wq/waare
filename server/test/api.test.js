import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import { app } from '../src/app.js';

let srv, base;
const hasSoffice = (() => { try { execFileSync('soffice', ['--version']); return true; } catch { return false; } })();
before(() => new Promise((r) => { srv = app.listen(0, () => { base = `http://localhost:${srv.address().port}`; r(); }); }));
after(() => srv.close());

const send = (tool, bytes, name, type) => {
  const f = new FormData(); f.append('file', new Blob([bytes], { type }), name);
  return fetch(`${base}/api/convert/${tool}`, { method: 'POST', body: f });
};

test('health', async () => assert.equal((await fetch(`${base}/api/health`)).status, 200));
test('unknown tool -> 404', async () => assert.equal((await send('nope', 'x', 'a.pdf', 'application/pdf')).status, 404));
test('wrong type -> 415', async () => assert.equal((await send('pdf-to-word', 'x', 'a.txt', 'text/plain')).status, 415));
test('bad download id -> 400', async () => assert.equal((await fetch(`${base}/api/convert/download/..%2f..%2fetc`)).status >= 400, true));
test('history requires auth', async () => assert.equal((await fetch(`${base}/api/history`)).status, 401));
test('corrupt PDF is rejected, not faked', async () => assert.equal((await send('pdf-to-word', 'not a pdf', 'a.pdf', 'application/pdf')).status, 500));

test('real round trip: xlsx -> pdf -> docx / xlsx', { skip: !hasSoffice, timeout: 120000 }, async () => {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('S'); ws.addRow(['Item', 'Qty']); ws.addRow(['Apple', 3]);
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
  const r = await send('excel-to-pdf', xlsx, 'a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(r.status, 200);
  const pdf = Buffer.from(await (await fetch(base + (await r.json()).downloadUrl)).arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  for (const tool of ['pdf-to-word', 'pdf-to-excel']) {
    const o = await send(tool, pdf, 'a.pdf', 'application/pdf'); assert.equal(o.status, 200);
    const out = Buffer.from(await (await fetch(base + (await o.json()).downloadUrl)).arrayBuffer());
    assert.equal(out.subarray(0, 2).toString(), 'PK'); // valid OOXML zip
  }
});
