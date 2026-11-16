// ตัวจำลอง Google Sheets + Apps Script สำหรับทดสอบในเครื่อง (ข้อมูลอยู่ในหน่วยความจำ ปิดแล้วหาย)
// ใช้โค้ดจริงจาก backend/Code.gs เพื่อให้ผลทดสอบตรงกับของจริง
// รัน: node tools/mock-backend.js   แล้วเชื่อมต่อจากแอพด้วยที่อยู่ http://localhost:8766
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');

const sheets = {};
function range(s, r, c, nr, nc) {
  const api = {
    getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((s.rows[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
    setValues(v) { v.forEach((row, i) => { const t = s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; row.forEach((x, j) => t[c - 1 + j] = x); }); return api; },
    clearContent() { for (let i = 0; i < nr; i++) s.rows[r - 1 + i] = []; while (s.rows.length && !s.rows[s.rows.length - 1].some(x => x !== '' && x != null)) s.rows.pop(); return api; },
    setNumberFormat() { return api; }, setFontWeight() { return api; }
  };
  return api;
}
function sheet(name) {
  const s = { name, rows: [] };
  s.getLastRow = () => s.rows.length;
  s.getMaxRows = () => 1000000;
  s.insertRowsAfter = () => { };
  s.setFrozenRows = () => { };
  s.getRange = (r, c, nr = 1, nc = 1) => range(s, r, c, nr, nc);
  s.deleteRow = r => { s.rows.splice(r - 1, 1); };
  return s;
}
const props = { OWNER_PIN: 'owner-test-1', STAFF_PIN: 'staff-test-1' }; // รหัสทดสอบของตัวจำลองเท่านั้น
const cache = {};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = sheet(n)) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => Math.random().toString(36).slice(2) + Date.now().toString(36), formatDate: d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10) },
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8') + '\nthis.doPost=doPost;', ctx);

const port = Number(process.env.PORT) || 8766;
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/__dump') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.rows])))); }
  if (req.method !== 'POST') { res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true,"app":"frame-shop-mock"}'); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const out = ctx.doPost({ postData: { contents: body } });
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(out.text);
  });
}).listen(port, '127.0.0.1', () => console.log('mock backend on http://localhost:' + port));
