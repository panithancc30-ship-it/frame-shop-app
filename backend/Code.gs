/**
 * ร้านกรอบรูป — ตัวรับ-ส่งข้อมูลระหว่างแอพกับ Google Sheets
 * ติดตั้ง: เปิด Google Sheets > ส่วนขยาย > Apps Script > วางโค้ดนี้ > Deploy เป็น Web app
 * รหัสร้าน (รหัสเดียว ใช้ร่วมกันทั้งร้าน) ตั้งจากเมนู "ร้านกรอบรูป" ในไฟล์ชีต (เก็บใน Script Properties ไม่อยู่ในชีต)
 * สคริปต์นี้ขอสิทธิ์เข้าถึงเฉพาะไฟล์ชีตที่ติดตั้งไว้เท่านั้น ไม่แตะไฟล์อื่นในบัญชี:
 * @OnlyCurrentDoc
 */
const SHEETS = { items: 'วัสดุ', buys: 'การสั่งซื้อ', moves: 'เคลื่อนไหวสต๊อก', quotes: 'ใบเสนอราคา', conf: 'ตั้งค่า' };
const COLS = {
  items: ['id', 'cat', 'name', 'basis', 'cost', 'price', 'face', 'waste', 'min', 'dq', 'punit', 'pqty', 'stock', 'reorder', 'updated'],
  buys: ['id', 'date', 'supplier', 'doc', 'itemId', 'itemName', 'qty', 'punit', 'pqty', 'unitPrice', 'disc', 'vat', 'total', 'cost', 'by', 'ts'],
  moves: ['ts', 'itemId', 'itemName', 'delta', 'unit', 'reason', 'ref', 'by', 'balance'],
  quotes: ['id', 'no', 'date', 'docType', 'customer', 'phone', 'total', 'cost', 'profit', 'status', 'by', 'updated', 'uses', 'json', 'json2', 'json3', 'json4'],
  conf: ['key', 'value']
};
const HEAD = {
  items: ['รหัส', 'หมวด', 'ชื่อวัสดุ/บริการ', 'หน่วยคำนวณราคา', 'ต้นทุน', 'ราคาขาย', 'หน้ากว้างคิ้ว', 'ส่วนเผื่อสูญเสีย %', 'ราคาขั้นต่ำ', 'จำนวนเริ่มต้น', 'หน่วยซื้อ', 'ปริมาณต่อหน่วยซื้อ', 'คงเหลือ', 'จุดสั่งซื้อ', 'แก้ไขล่าสุด'],
  buys: ['รหัส', 'วันที่', 'ผู้ขาย', 'เลขที่เอกสาร', 'รหัสวัสดุ', 'วัสดุ', 'จำนวน', 'หน่วยซื้อ', 'ปริมาณต่อหน่วยซื้อ', 'ราคาต่อหน่วยซื้อ', 'ส่วนลด %', 'ภาษีที่รวมในต้นทุน %', 'จำนวนเงิน (ก่อนภาษี)', 'ต้นทุนต่อหน่วยใช้งาน', 'ผู้บันทึก', 'เวลาบันทึก'],
  moves: ['เวลา', 'รหัสวัสดุ', 'วัสดุ', 'เปลี่ยนแปลง', 'หน่วย', 'สาเหตุ', 'อ้างอิง', 'ผู้ทำ', 'คงเหลือหลังรายการ'],
  quotes: ['รหัส', 'เลขที่', 'วันที่', 'ประเภท', 'ลูกค้า', 'ติดต่อ', 'ยอดรวม', 'ต้นทุนรวม', 'กำไร', 'สถานะ', 'ผู้ทำ', 'แก้ไขล่าสุด', 'วัสดุที่ตัดสต๊อก', 'ข้อมูล 1', 'ข้อมูล 2', 'ข้อมูล 3', 'ข้อมูล 4'],
  conf: ['หัวข้อ', 'ค่า']
};
// คอลัมน์ที่ต้องเก็บเป็นข้อความ (กันไม่ให้ชีตแปลงวันที่/เลขที่เอง)
const TEXT = { items: [0, 1, 2, 3, 10, 14], buys: [0, 1, 2, 3, 4, 5, 7, 14, 15], moves: [0, 1, 2, 4, 5, 6, 7], quotes: [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16], conf: [0, 1] };
const CHUNK = 45000;

/* ---------- เมนูในไฟล์ชีต ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ร้านกรอบรูป')
    .addItem('ตั้งค่าระบบครั้งแรก', 'setup')
    .addItem('เปลี่ยนรหัสร้าน', 'setPins')
    .addToUi();
}
function setup() {
  Object.keys(SHEETS).forEach(sh_);
  if (!PropertiesService.getScriptProperties().getProperty('OWNER_PIN')) setPins();
  else SpreadsheetApp.getUi().alert('สร้างแท็บข้อมูลเรียบร้อยแล้ว');
}
function setPins() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('รหัสร้าน', 'ตั้งรหัสร้านสำหรับเข้าใช้งาน (อย่างน้อย 6 ตัวอักษร) ทุกคนในร้านใช้รหัสนี้ร่วมกัน', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const o = a.getResponseText().trim();
  if (o.length < 6) { ui.alert('รหัสไม่ถูกต้อง: ต้องยาวอย่างน้อย 6 ตัวอักษร'); return; }
  const p = PropertiesService.getScriptProperties();
  p.setProperty('OWNER_PIN', o);
  p.deleteProperty('STAFF_PIN');
  ui.alert('บันทึกรหัสร้านเรียบร้อยแล้ว');
}

/* ---------- จุดรับคำสั่งจากแอพ ---------- */
function doGet() { return out_({ ok: true, app: 'frame-shop' }); }
function doPost(e) {
  let res;
  try {
    const req = JSON.parse(e.postData.contents);
    const role = auth_(req.pin);
    res = role ? run_(role, req) : { ok: false, error: 'PIN' };
  } catch (err) { res = { ok: false, error: String((err && err.message) || err) }; }
  return out_(res);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function auth_(pin) {
  const p = PropertiesService.getScriptProperties(), c = CacheService.getScriptCache();
  const fails = Number(c.get('fail')) || 0;
  if (fails >= 30) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  pin = String(pin || '');
  // ใช้รหัสร้านรหัสเดียว ทุกคนใช้งานได้ทุกส่วน (รหัสที่สองแบบเดิมไม่ใช้แล้ว)
  if (pin && pin === p.getProperty('OWNER_PIN')) return 'owner';
  c.put('fail', String(fails + 1), 600);
  return null;
}

function run_(role, req) {
  const a = req.action, d = req.data || {}, res = { ok: true, role: role };
  const fn = ACT[a];
  if (!fn) throw new Error('ไม่รู้จักคำสั่ง ' + a);
  const write = ['login', 'pull', 'getQuote'].indexOf(a) < 0;
  const lock = write ? LockService.getScriptLock() : null;
  if (lock) lock.waitLock(25000);
  try {
    if (write && req.opId && seen_(req.opId)) res.dup = true; // คำสั่งเดิมถูกส่งซ้ำ ไม่ทำซ้ำ
    else {
      const x = fn(role, d) || {};
      Object.keys(x).forEach(k => res[k] = x[k]);
      if (write && req.opId) mark_(req.opId);
    }
    if (req.wantState || a === 'login' || a === 'pull') res.state = state_(role);
  } finally { if (lock) lock.releaseLock(); }
  return res;
}

/* ---------- คำสั่ง ---------- */
const ACT = {
  login() { },
  pull() { },
  init(role, d) { // ครั้งแรก: ส่งข้อมูลจากเครื่องเจ้าของขึ้นมาเป็นข้อมูลตั้งต้น
    owner_(role);
    if (readAll_('items').length) throw new Error('ระบบมีข้อมูลอยู่แล้ว');
    (d.items || []).forEach(it => writeRow_('items', itemRow_(it, null, 'owner', true)));
    saveConf_(d.settings || {});
    (d.quotes || []).forEach(x => saveQuote_('owner', x));
  },
  saveItems(role, d) {
    const map = {}; readAll_('items').forEach(r => map[r.id] = r);
    (d.items || []).forEach(it => { if (it && it.id) writeRow_('items', itemRow_(it, map[it.id], role, false)); });
  },
  deleteItem(role, d) { owner_(role); const it = findItem_(d.id); if (it) sh_('items').deleteRow(it._row); },
  saveSettings(role, d) { owner_(role); saveConf_(d.settings || {}); },
  addPurchase(role, d) {
    const it = findItem_(d.itemId); if (!it) throw new Error('ไม่พบวัสดุที่เลือก');
    if (d.punit != null) it.punit = String(d.punit);
    if (Number(d.pqty) > 0) it.pqty = Number(d.pqty);
    const conv = Number(it.pqty) || 1, qty = Number(d.qty) || 0, up = Number(d.unitPrice) || 0, disc = Number(d.disc) || 0, vat = Number(d.vat) || 0;
    const net = up * (1 - disc / 100), add = r_(qty * conv, 3);
    if (net > 0) it.cost = r_(net * (1 + vat / 100) / conv, 4); // ต้นทุน = ราคาซื้อล่าสุด หลังหักส่วนลด
    it.stock = r_((Number(it.stock) || 0) + add, 3); it.updated = now_();
    writeRow_('items', it);
    writeRow_('buys', { id: d.id || Utilities.getUuid(), date: d.date || today_(), supplier: txt_(d.supplier), doc: txt_(d.doc), itemId: it.id, itemName: it.name, qty: qty, punit: it.punit || '', pqty: conv, unitPrice: up, disc: disc || '', vat: vat || '', total: r_(qty * net, 2), cost: it.cost, by: label_(role), ts: now_() });
    move_(it, add, 'ซื้อเข้า', [d.supplier, d.doc].filter(x => x).join(' '), role);
  },
  adjustStock(role, d) {
    const it = findItem_(d.itemId); if (!it) throw new Error('ไม่พบวัสดุที่เลือก');
    if (d.stock === '' || d.stock == null) { it.stock = ''; it.updated = now_(); writeRow_('items', it); return; }
    const nv = r_(Number(d.stock) || 0, 3), delta = r_(nv - (Number(it.stock) || 0), 3);
    it.stock = nv; it.updated = now_(); writeRow_('items', it);
    move_(it, delta, 'ปรับยอด', d.note || '', role);
  },
  saveQuote(role, d) { return saveQuote_(role, d); },
  getQuote(role, d) {
    const row = findQuote_(d.id); if (!row) throw new Error('ไม่พบเอกสาร');
    const q = JSON.parse(unpack_(row));
    q.no = row.no; q.status = row.status || 'quote'; q.by = row.by; q.uses = row.uses ? JSON.parse(row.uses) : null;
    if (role !== 'owner') (q.lines || []).forEach(l => { delete l.cost; }); // พนักงานไม่ได้รับต้นทุนของงาน
    return { quote: q };
  },
  setStatus(role, d) {
    const row = findQuote_(d.id); if (!row) throw new Error('ไม่พบเอกสาร');
    const prev = row.status || 'quote';
    if (!on_(prev) && on_(d.status)) row.uses = JSON.stringify(uses_(d.uses || [], -1, row.no, role)); // เก็บเฉพาะรายการที่ตัดจริง เพื่อคืนได้ตรงกัน
    else if (on_(prev) && !on_(d.status)) { if (row.uses) uses_(JSON.parse(row.uses), 1, row.no, role); row.uses = ''; }
    row.status = d.status; row.updated = now_(); writeRow_('quotes', row);
  },
  deleteQuote(role, d) {
    owner_(role);
    const row = findQuote_(d.id); if (!row) return;
    if (on_(row.status) && row.uses) uses_(JSON.parse(row.uses), 1, row.no, role);
    sh_('quotes').deleteRow(row._row);
  }
};

function saveQuote_(role, x) {
  const q = x.quote, m = x.meta || {}, rows = readAll_('quotes');
  let old = null; rows.forEach(r => { if (r.id === q.id) old = r; });
  let no = String(q.no || '');
  if (!no || rows.some(r => r.id !== q.id && r.no === no)) { // เลขที่ซ้ำกับเอกสารอื่น → ออกเลขถัดไป
    const base = no.replace(/-\d+$/, '') || 'QT'; let max = 0;
    rows.forEach(r => { if (String(r.no).indexOf(base + '-') === 0) max = Math.max(max, parseInt(String(r.no).slice(base.length + 1), 10) || 0); });
    no = base + '-' + ('00' + (max + 1)).slice(-3); q.no = no;
  }
  if (old && role !== 'owner') { // ต้นทุนรายบรรทัดที่พนักงานไม่ได้รับมา ให้คงค่าเดิมไว้
    const prev = {}; try { JSON.parse(unpack_(old)).lines.forEach(l => prev[l.id] = l.cost); } catch (e) { }
    (q.lines || []).forEach(l => { if (l.cost == null && prev[l.id] != null) l.cost = prev[l.id]; });
  }
  let cost = 0; (q.lines || []).forEach(l => cost += (Number(l.cost) || 0) * (Number(l.qty) || 0));
  const status = old ? (old.status || 'quote') : (q.status || 'quote');
  let uses = old ? old.uses : (q.uses ? JSON.stringify(q.uses) : '');
  if (old && on_(status) && x.uses) { // แก้ไขงานที่ตัดสต๊อกไปแล้ว: ปรับสต๊อกตามส่วนต่าง
    const m = {};
    (old.uses ? JSON.parse(old.uses) : []).forEach(u => m[u.itemId] = (m[u.itemId] || 0) - Number(u.qty));
    x.uses.forEach(u => m[u.itemId] = (m[u.itemId] || 0) + Number(u.qty));
    uses_(Object.keys(m).filter(k => Math.abs(m[k]) > 0.0005).map(k => ({ itemId: k, qty: m[k] })), -1, no, role);
    uses = JSON.stringify(x.uses);
  }
  const by = old ? old.by : (q.by || label_(role));
  const c = q.cust || {};
  const row = { _row: old ? old._row : null, id: q.id, no: no, date: q.date || today_(), docType: q.docType || 'quote', customer: txt_(c.name), phone: txt_(c.phone), total: r_(Number(m.total) || 0, 2), cost: r_(cost, 2), profit: r_((Number(m.net) || 0) - cost, 2), status: status, by: by, updated: now_(), uses: uses };
  delete q.dirty; delete q.uses; q.status = status; q.by = by;
  const s = JSON.stringify(q);
  if (s.length > CHUNK * 4) throw new Error('เอกสารมีรายการมากเกินไป');
  ['json', 'json2', 'json3', 'json4'].forEach((k, i) => row[k] = s.substr(i * CHUNK, CHUNK));
  writeRow_('quotes', row);
  return { id: q.id, no: no };
}

/* ---------- ข้อมูลที่ส่งกลับให้แอพ ---------- */
function state_(role) {
  const items = readAll_('items').map(r => { delete r._row; return r; });
  const parts = {}; readAll_('conf').forEach(r => { const k = String(r.key).split('~'); (parts[k[0]] = parts[k[0]] || [])[Number(k[1]) || 0] = r.value; });
  const settings = {}; Object.keys(parts).forEach(k => { try { settings[k] = JSON.parse(parts[k].join('')); } catch (e) { } });
  const qlist = readAll_('quotes').sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 500).map(r => {
    const o = { id: r.id, no: r.no, date: r.date, docType: r.docType, customer: r.customer, phone: r.phone, total: r.total, status: r.status || 'quote', by: r.by, updated: r.updated };
    if (role === 'owner') { o.cost = r.cost; o.profit = r.profit; } // ต้นทุนรวม/กำไรของงาน ส่งให้เจ้าของเท่านั้น
    return o;
  });
  const tail = key => readAll_(key).slice(-200).reverse().map(r => { delete r._row; return r; });
  return { items: items, settings: settings, qlist: qlist, buys: tail('buys'), moves: tail('moves'), empty: !items.length && !settings.cfg, ts: now_() };
}

/* ---------- ตัวช่วย ---------- */
function owner_(role) { if (role !== 'owner') throw new Error('คำสั่งนี้ใช้ได้เฉพาะเจ้าของร้าน'); }
function on_(s) { return s === 'ordered' || s === 'done'; }
function label_() { return 'ผู้ใช้งาน'; }
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }
function r_(v, d) { const k = Math.pow(10, d); return Math.round(v * k) / k; }
function n_(v) { if (v === '' || v == null) return ''; const x = Number(v); return isFinite(x) ? x : ''; }
function txt_(v) { v = String(v == null ? '' : v); return v.charAt(0) === '=' ? ' ' + v : v; } // กันข้อความถูกตีความเป็นสูตร
function findItem_(id) { let f = null; readAll_('items').forEach(r => { if (r.id === id) f = r; }); return f; }
function findQuote_(id) { let f = null; readAll_('quotes').forEach(r => { if (r.id === id) f = r; }); return f; }
function unpack_(row) { return String(row.json || '') + String(row.json2 || '') + String(row.json3 || '') + String(row.json4 || ''); }

function itemRow_(it, old, role, init) {
  const o = { _row: old ? old._row : null };
  ['id', 'cat', 'basis'].forEach(k => o[k] = String(it[k] == null ? '' : it[k]));
  o.name = txt_(it.name); o.punit = txt_(it.punit);
  ['cost', 'face', 'waste', 'dq', 'pqty', 'reorder'].forEach(k => o[k] = n_(it[k]));
  if (role === 'owner') { o.price = n_(it.price); o.min = n_(it.min); } // ราคาขายแก้ได้เฉพาะเจ้าของ
  else { o.price = old ? old.price : ''; o.min = old ? old.min : ''; }
  o.stock = init ? n_(it.stock) : (old ? old.stock : ''); // ยอดคงเหลือเปลี่ยนได้ผ่านการซื้อ/ตัด/ปรับยอดเท่านั้น
  o.updated = now_();
  return o;
}
function move_(it, delta, reason, ref, role) {
  const units = { perim_ft: 'ฟุต', perim_in: 'นิ้ว', perim_m: 'ม.', united_in: 'นิ้ว', area_sqft: 'ตร.ฟ.', area_sqin: 'ตร.นิ้ว', area_sqm: 'ตร.ม.', piece: 'ชิ้น', job: 'งาน' };
  writeRow_('moves', { ts: now_(), itemId: it.id, itemName: it.name, delta: delta, unit: units[it.basis] || '', reason: reason, ref: txt_(ref), by: label_(role), balance: it.stock });
}
function uses_(uses, sign, ref, role) {
  const map = {}, done = []; readAll_('items').forEach(r => map[r.id] = r);
  (uses || []).forEach(u => {
    const it = map[u.itemId]; if (!it || it.stock === '') return; // วัสดุที่ยังไม่ได้ตั้งยอด ไม่ตัดสต๊อก
    const q = r_(Number(u.qty) || 0, 3), delta = r_(sign * q, 3);
    if (!delta) return;
    it.stock = r_(Number(it.stock) + delta, 3); it.updated = now_(); writeRow_('items', it);
    move_(it, delta, delta < 0 ? 'ตัดตามงาน' : 'คืนสต๊อก', ref, role);
    done.push({ itemId: u.itemId, qty: q });
  });
  return done;
}
function saveConf_(settings) {
  const cur = {}; readAll_('conf').forEach(r => { const k = String(r.key).split('~')[0]; (cur[k] = cur[k] || []).push(r.value); });
  const all = {}; Object.keys(cur).forEach(k => all[k] = cur[k].join(''));
  ['shop', 'cfg', 'templates', 'sizes'].forEach(k => { if (settings[k] !== undefined) all[k] = JSON.stringify(settings[k]); });
  const rows = [];
  Object.keys(all).forEach(k => { const s = all[k]; for (let i = 0; i * CHUNK < Math.max(s.length, 1); i++) rows.push([i ? k + '~' + i : k, s.substr(i * CHUNK, CHUNK)]); });
  const s = sh_('conf'), n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, 2).clearContent();
  if (rows.length) s.getRange(2, 1, rows.length, 2).setValues(rows);
}
function seen_(id) { return ops_().indexOf(id) >= 0; }
function mark_(id) { let a = ops_(); a.push(id); if (a.length > 250) a = a.slice(-250); PropertiesService.getScriptProperties().setProperty('OPS', JSON.stringify(a)); }
function ops_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('OPS') || '[]'); } catch (e) { return []; } }

/* ---------- อ่าน/เขียนชีต ---------- */
function sh_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEETS[key]);
  if (!s) {
    s = ss.insertSheet(SHEETS[key]);
    s.getRange(1, 1, 1, HEAD[key].length).setValues([HEAD[key]]).setFontWeight('bold');
    s.setFrozenRows(1);
    TEXT[key].forEach(c => s.getRange(1, c + 1, s.getMaxRows(), 1).setNumberFormat('@'));
  }
  return s;
}
function readAll_(key) {
  const s = sh_(key), n = s.getLastRow(), cols = COLS[key];
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, cols.length).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    cols.forEach((c, j) => { const v = r[j]; o[c] = v instanceof Date ? Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd') : v; });
    return o;
  }).filter(o => o[cols[0]] !== '');
}
function writeRow_(key, o) {
  const s = sh_(key), arr = COLS[key].map(c => (o[c] == null ? '' : o[c]));
  const row = o._row || s.getLastRow() + 1;
  if (row > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), 200);
  s.getRange(row, 1, 1, arr.length).setValues([arr]);
  o._row = row;
}
