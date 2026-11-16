// ทดสอบตรรกะของ backend/Code.gs ผ่านตัวจำลอง (ต้องรัน node tools/mock-backend.js ไว้ก่อน)
const URL = process.env.MOCK || 'http://localhost:8766';
const OWNER = 'owner-test-1', STAFF = 'staff-test-1';
let n = 0, fail = 0;
const call = (pin, action, data, extra) => fetch(URL, { method: 'POST', body: JSON.stringify({ pin, action, data, ...extra }) }).then(r => r.json());
const ok = (name, cond, info) => { n++; if (!cond) { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } else console.log('ok  ', name); };
const item = (st, id) => st.items.find(i => i.id === id);

(async () => {
  let r = await call('wrong', 'login');
  ok('รหัสผิดถูกปฏิเสธ', r.ok === false && r.error === 'PIN', r);
  r = await call(OWNER, 'login');
  ok('เจ้าของเข้าได้ และระบบว่าง', r.ok && r.role === 'owner' && r.state.empty === true, r);
  r = await call(STAFF, 'init', { items: [] });
  ok('พนักงานสั่ง init ไม่ได้', r.ok === false, r);

  const items = [
    { id: 'f1', cat: 'frame', name: 'คิ้วทดสอบ', basis: 'perim_ft', cost: 10, price: 30, face: 1, punit: 'เส้น', pqty: 10, stock: '', reorder: 20 },
    { id: 'g1', cat: 'glass', name: 'กระจกทดสอบ', basis: 'area_sqft', cost: 15, price: '', stock: 50 },
    { id: 'l1', cat: 'labor', name: 'ค่าบริการ', basis: 'job', cost: 30, price: 80 }
  ];
  r = await call(OWNER, 'init', { items, settings: { shop: { name: 'ร้านทดสอบ', logo: 'x'.repeat(100000) }, cfg: { markup: 100 }, sizes: ['8x10'], templates: {} }, quotes: [] }, { wantState: true });
  ok('init สำเร็จ', r.ok && r.state.items.length === 3 && r.state.settings.shop.name === 'ร้านทดสอบ', r.error);
  ok('ค่าตั้งค่าขนาดใหญ่ (โลโก้) เก็บและอ่านกลับครบ', r.ok && r.state.settings.shop.logo.length === 100000);
  ok('ราคาขายว่างยังคงว่าง', r.ok && item(r.state, 'g1').price === '', r.ok && item(r.state, 'g1'));

  // สั่งซื้อ: 24 เส้น เส้นละ 92 ลด 5% (ตามใบสั่งซื้อจริง) 1 เส้น = 10 ฟุต
  r = await call(STAFF, 'addPurchase', { id: 'p1', itemId: 'f1', qty: 24, unitPrice: 92, disc: 5, punit: 'เส้น', pqty: 10, supplier: 'ผู้ขาย ก', doc: 'SO-1', date: '2026-11-05' }, { opId: 'op-buy-1', wantState: true });
  ok('พนักงานบันทึกการสั่งซื้อได้', r.ok, r.error);
  ok('ต้นทุนใหม่ = 92×0.95÷10 = 8.74', r.ok && item(r.state, 'f1').cost === 8.74, r.ok && item(r.state, 'f1'));
  ok('สต๊อกเพิ่ม 240 ฟุต', r.ok && item(r.state, 'f1').stock === 240);
  ok('มีประวัติการสั่งซื้อและยอด 2097.6', r.ok && r.state.buys[0].total === 2097.6 && r.state.buys[0].date === '2026-11-05', r.ok && r.state.buys[0]);
  r = await call(STAFF, 'addPurchase', { id: 'p1', itemId: 'f1', qty: 24, unitPrice: 92, disc: 5, pqty: 10 }, { opId: 'op-buy-1', wantState: true });
  ok('ส่งคำสั่งเดิมซ้ำ ไม่บันทึกซ้ำ', r.ok && r.dup === true && item(r.state, 'f1').stock === 240, r);
  r = await call(STAFF, 'addPurchase', { itemId: 'g1', qty: 2, unitPrice: 100, pqty: 5, punit: 'แผ่น', vat: 7 }, { wantState: true });
  ok('รวม VAT เข้าต้นทุน = 100×1.07÷5 = 21.4', r.ok && item(r.state, 'g1').cost === 21.4 && item(r.state, 'g1').stock === 60, r.ok && item(r.state, 'g1'));

  // สิทธิ์แก้ราคาขาย
  r = await call(STAFF, 'saveItems', { items: [{ ...items[0], name: 'คิ้วทดสอบ (แก้ชื่อ)', cost: 9, price: 999, stock: 5 }, { id: 'n1', cat: 'hw', name: 'ของใหม่', basis: 'piece', cost: 2, price: 50 }] }, { wantState: true });
  ok('พนักงานแก้ชื่อ/ต้นทุนได้ แต่ราคาขายและสต๊อกไม่เปลี่ยน', r.ok && item(r.state, 'f1').name === 'คิ้วทดสอบ (แก้ชื่อ)' && item(r.state, 'f1').cost === 9 && item(r.state, 'f1').price === 30 && item(r.state, 'f1').stock === 240, r.ok && item(r.state, 'f1'));
  ok('พนักงานเพิ่มวัสดุใหม่ได้ (ไม่มีราคาขาย)', r.ok && item(r.state, 'n1') && item(r.state, 'n1').price === '', r.ok && item(r.state, 'n1'));
  r = await call(OWNER, 'saveItems', { items: [{ ...items[0], price: 35 }] }, { wantState: true });
  ok('เจ้าของแก้ราคาขายได้', r.ok && item(r.state, 'f1').price === 35);
  r = await call(STAFF, 'saveSettings', { settings: { cfg: { markup: 1 } } });
  ok('พนักงานแก้ตั้งค่าไม่ได้', r.ok === false);
  r = await call(STAFF, 'deleteItem', { id: 'f1' });
  ok('พนักงานลบวัสดุไม่ได้', r.ok === false);

  // ใบเสนอราคา
  const quote = { id: 'q1', no: 'QT-6911-001', date: '2026-11-16', docType: 'quote', cust: { name: 'ลูกค้า ก', phone: '=081' }, lines: [{ id: 'a', title: 'งานกรอบรูป', unit: 500, qty: 2, cost: 120 }], dirty: true };
  r = await call(OWNER, 'saveQuote', { quote, meta: { total: 1000, net: 1000 } }, { wantState: true });
  ok('บันทึกใบเสนอราคา', r.ok && r.no === 'QT-6911-001' && r.state.qlist.length === 1, r);
  ok('เจ้าของเห็นต้นทุนรวม 240 กำไร 760', r.ok && r.state.qlist[0].cost === 240 && r.state.qlist[0].profit === 760, r.ok && r.state.qlist[0]);
  r = await call(STAFF, 'pull');
  ok('พนักงานไม่ได้รับต้นทุนรวม/กำไรในประวัติ', r.ok && r.state.qlist[0].cost === undefined && r.state.qlist[0].profit === undefined, r.ok && r.state.qlist[0]);
  r = await call(STAFF, 'getQuote', { id: 'q1' });
  ok('พนักงานเปิดใบได้ แต่ไม่มีต้นทุนรายบรรทัด', r.ok && r.quote.lines[0].cost === undefined && r.quote.lines[0].unit === 500, r);
  const edited = r.quote; edited.lines[0].qty = 3; edited.lines.push({ id: 'b', title: 'ค่าจัดส่ง', unit: 100, qty: 1, cost: 0 });
  r = await call(STAFF, 'saveQuote', { quote: edited, meta: { total: 1600, net: 1600 } });
  r = await call(OWNER, 'getQuote', { id: 'q1' });
  ok('พนักงานแก้ใบแล้ว ต้นทุนเดิมไม่หาย', r.ok && r.quote.lines[0].cost === 120 && r.quote.lines[0].qty === 3, r.ok && r.quote.lines);
  r = await call(STAFF, 'saveQuote', { quote: { ...quote, id: 'q2' }, meta: { total: 1, net: 1 } }, { wantState: true });
  ok('เลขที่ซ้ำ → ออกเลขถัดไปให้', r.ok && r.no === 'QT-6911-002', r.no);

  // ยืนยันสั่งทำ → ตัดสต๊อก
  r = await call(STAFF, 'setStatus', { id: 'q1', status: 'ordered', uses: [{ itemId: 'f1', qty: 21 }, { itemId: 'g1', qty: 6.667 }, { itemId: 'n1', qty: 4 }] }, { wantState: true });
  ok('ยืนยันสั่งทำ: คิ้ว 240→219', r.ok && item(r.state, 'f1').stock === 219, r.ok && item(r.state, 'f1').stock);
  ok('ยืนยันสั่งทำ: กระจก 60→53.333', r.ok && item(r.state, 'g1').stock === 53.333, r.ok && item(r.state, 'g1').stock);
  ok('วัสดุที่ยังไม่ตั้งยอด ไม่ถูกตัด', r.ok && item(r.state, 'n1').stock === '');
  ok('สถานะในประวัติเป็น ordered', r.ok && r.state.qlist.find(q => q.id === 'q1').status === 'ordered');
  r = await call(OWNER, 'getQuote', { id: 'q1' });
  ok('เก็บเฉพาะวัสดุที่ตัดสต๊อกจริง (ไม่รวมวัสดุที่ยังไม่ตั้งยอด)', r.ok && r.quote.uses.length === 2 && !r.quote.uses.some(u => u.itemId === 'n1'), r.ok && r.quote.uses);
  // แก้ไขงานหลังยืนยันสั่งทำ: คิ้วใช้เพิ่มจาก 21 เป็น 31.5, กระจกเท่าเดิม
  r = await call(STAFF, 'saveQuote', { quote: r.quote, meta: { total: 1600, net: 1600 }, uses: [{ itemId: 'f1', qty: 31.5 }, { itemId: 'g1', qty: 6.667 }] }, { wantState: true });
  ok('แก้ไขงานที่สั่งทำแล้ว: ตัดสต๊อกเพิ่มเฉพาะส่วนต่าง 219→208.5', r.ok && item(r.state, 'f1').stock === 208.5 && item(r.state, 'g1').stock === 53.333, r.ok && [item(r.state, 'f1').stock, item(r.state, 'g1').stock]);
  r = await call(STAFF, 'saveQuote', { quote: { ...quote, lines: quote.lines }, meta: { total: 1600, net: 1600 }, uses: [{ itemId: 'f1', qty: 21 }, { itemId: 'g1', qty: 6.667 }] }, { wantState: true });
  ok('ลดปริมาณงานกลับ: คืนสต๊อกส่วนต่าง 208.5→219', r.ok && item(r.state, 'f1').stock === 219, r.ok && item(r.state, 'f1').stock);
  r = await call(STAFF, 'setStatus', { id: 'q1', status: 'done' }, { wantState: true });
  ok('ส่งมอบแล้ว: สต๊อกไม่เปลี่ยน', r.ok && item(r.state, 'f1').stock === 219);
  r = await call(STAFF, 'setStatus', { id: 'q1', status: 'cancel' }, { wantState: true });
  ok('ยกเลิก: คืนสต๊อก 219→240, 53.333→60', r.ok && item(r.state, 'f1').stock === 240 && item(r.state, 'g1').stock === 60, r.ok && [item(r.state, 'f1').stock, item(r.state, 'g1').stock]);
  ok('มีความเคลื่อนไหว ตัดตามงาน/คืนสต๊อก', r.ok && r.state.moves.some(m => m.reason === 'ตัดตามงาน') && r.state.moves.some(m => m.reason === 'คืนสต๊อก'));

  // ปรับยอด
  r = await call(STAFF, 'adjustStock', { itemId: 'f1', stock: 200, note: 'นับจริง' }, { wantState: true });
  ok('ปรับยอดเป็น 200 และบันทึกส่วนต่าง -40', r.ok && item(r.state, 'f1').stock === 200 && r.state.moves[0].delta === -40, r.ok && r.state.moves[0]);

  // ลบ
  r = await call(STAFF, 'deleteQuote', { id: 'q2' });
  ok('พนักงานลบเอกสารไม่ได้', r.ok === false);
  r = await call(OWNER, 'setStatus', { id: 'q1', status: 'ordered', uses: [{ itemId: 'f1', qty: 10 }] });
  r = await call(OWNER, 'deleteQuote', { id: 'q1' }, { wantState: true });
  ok('เจ้าของลบเอกสารที่สั่งทำแล้ว → คืนสต๊อก', r.ok && item(r.state, 'f1').stock === 200 && r.state.qlist.length === 1, r.ok && item(r.state, 'f1').stock);
  r = await call(OWNER, 'saveSettings', { settings: { cfg: { markup: 80 } } }, { wantState: true });
  ok('เจ้าของแก้ตั้งค่าได้ และค่าอื่นไม่หาย', r.ok && r.state.settings.cfg.markup === 80 && r.state.settings.shop.name === 'ร้านทดสอบ' && r.state.settings.sizes[0] === '8x10', r.ok && Object.keys(r.state.settings));

  const dump = await fetch(URL + '/__dump').then(x => x.json());
  ok('ข้อความขึ้นต้นด้วย = ไม่ถูกเก็บเป็นสูตร', !dump['ใบเสนอราคา'].some(row => String(row[5]).charAt(0) === '='), dump['ใบเสนอราคา'].map(r => r[5]));
  console.log(`\n${n - fail}/${n} ผ่าน`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
