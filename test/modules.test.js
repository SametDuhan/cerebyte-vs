// Modül mantığı testleri. Gerçek vault'a dokunmaz: her test geçici bir vault kurar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeCtx } = require('../lib/vault');

function tmpVault(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beyin-test-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  const ctx = makeCtx(dir);
  return { ctx, dir, withToday: (d) => Object.assign(ctx, { today: () => d }) };
}

// ---------------------------------------------------------------- yakala
test('yakala: ekle, listele, sil; dosya değişmişse silme reddedilir', () => {
  const { ctx } = tmpVault();
  const y = require('../modules/yakala/main');
  y.api.add(ctx, 'ilk fikir\nikinci satır');
  const list = y.api.add(ctx, 'ikinci fikir');
  assert.equal(list.length, 2);
  assert.equal(list[0].text, 'ilk fikir ikinci satır');
  assert.match(list[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => y.api.remove(ctx, list[0].idx, 'yanlış satır'), /değişmiş/);
  assert.equal(y.api.remove(ctx, list[0].idx, list[0].line).length, 1);
  assert.throws(() => y.api.add(ctx, '  '), /Boş/);
});

test('yakala: 5 madde ya da 3 günlük madde uyarı üretir', () => {
  const old = '---\n---\n# Yakalananlar\n\n- eski (2026-10-01)\n';
  const { ctx, withToday } = tmpVault({ 'inbox/yakala.md': old });
  withToday('2026-10-05');
  const y = require('../modules/yakala/main');
  const a = y.alerts(ctx);
  assert.equal(a[0].level, 'warn');
  assert.match(a[0].text, /4 gün/);
});

// ---------------------------------------------------------------- hatirlatici
const HAT = `# H\n\n## Bekleyenler\n- [x] 2026-10-05 | bitmiş | 1\n- [ ] 2026-10-10 | gecikmiş iş | 2\n- [ ] 2026-11-02 | yenileme | 3\n- [ ] 2026-12-25 | uzak | 3\n`;

test('hatirlatici: gecikmiş, yaklaşan ve uzak maddeleri ayırır', () => {
  const { ctx, withToday } = tmpVault({ 'hatirlaticilar.md': HAT });
  withToday('2026-10-30');
  const h = require('../modules/hatirlatici/main');
  const a = h.alerts(ctx);
  assert.equal(a.length, 2);
  assert.equal(a[0].level, 'due');
  assert.match(a[0].text, /Gecikti \(20 gün\)/);
  assert.equal(a[1].level, 'warn');
  assert.match(a[1].text, /3 gün sonra/);
});

test('hatirlatici: ekle son maddenin altına girer, toggle işaretler, çıktı biçimi korunur', () => {
  const { ctx, withToday } = tmpVault({ 'hatirlaticilar.md': HAT });
  withToday('2026-10-30');
  const h = require('../modules/hatirlatici/main');
  h.api.add(ctx, '2026-11-20', 'yeni | iş', 5);
  const lines = ctx.read('hatirlaticilar.md').split('\n');
  assert.equal(lines[lines.length - 2], '- [ ] 2026-11-20 | yeni / iş | 5');
  const r = h.api.list(ctx).find((x) => x.text === 'uzak');
  h.api.toggle(ctx, r.idx, r.line);
  assert.ok(ctx.read('hatirlaticilar.md').includes('- [x] 2026-12-25 | uzak | 3'));
  assert.throws(() => h.api.toggle(ctx, r.idx, 'eski satır'), /değişmiş/);
  assert.throws(() => h.api.add(ctx, 'yarın', 'x'), /Tarih/);
});

// ---------------------------------------------------------------- gunluk
test('gunluk: kaydet → oku gidiş dönüş, ek bölümler ve frontmatter korunur', () => {
  const { ctx } = tmpVault({ 'gunluk/2026-10-30.md': '---\ntur: gunluk\ntarih: 2026-10-30\n---\n# 2026-10-30\n\n## Kendi notum\nbunu silme\n' });
  const g = require('../modules/gunluk/main');
  g.api.save(ctx, '2026-10-30', {
    plan: [{ done: true, text: 'bağlı liste' }, { done: false, text: '' }], work: 'Bağlı liste / 45 dk\n- Dizi / 30 dk',
    questions: 12, stuck: 'pointer', learned: 'düğüm bir kutudur', tomorrow: 'ağaçlar',
  });
  const d = g.api.get(ctx, '2026-10-30');
  assert.deepEqual(d.plan, [{ done: true, text: 'bağlı liste' }]);
  assert.equal(d.work, 'Bağlı liste / 45 dk\nDizi / 30 dk');
  assert.equal(d.questions, 12);
  assert.equal(d.stuck, 'pointer');
  assert.equal(d.learned, 'düğüm bir kutudur');
  const raw = ctx.read('gunluk/2026-10-30.md');
  assert.ok(raw.startsWith('---\ntur: gunluk'));
  assert.ok(raw.includes('## Kendi notum\nbunu silme'));
});

test('gunluk: boş şablon seriye sayılmaz; seri ardışık günlerden hesaplanır', () => {
  const day = (d, body) => [`gunluk/${d}.md`, `---\ntur: gunluk\n---\n# ${d}\n\n${body}`];
  const { ctx, withToday } = tmpVault(Object.fromEntries([
    day('2026-10-30', '## Soru çözme\n- Çözülen soru sayısı:\n- Takıldığım yer:\n'),   // boş şablon
    day('2026-10-29', '## Yapılan çalışma\n- Dizi / 60 dk\n## Soru çözme\n- Çözülen soru sayısı: 10\n'),
    day('2026-10-28', '## Yapılan çalışma\n- Liste / 30 dk\n'),
    day('2026-10-26', '## Yapılan çalışma\n- Eski / 20 dk\n'),                          // 27 boş: seri kopar
  ]));
  withToday('2026-10-30');
  const g = require('../modules/gunluk/main');
  const st = g.stats(ctx);
  assert.equal(st.todayDone, false);
  assert.equal(st.streak, 2);
  assert.equal(st.weekMin, 110);
  assert.equal(st.weekQ, 10);
  assert.equal(st.sinceLast, 1);
});

test('gunluk: akşam 18\'den sonra kayıt yoksa bildirimli uyarı', () => {
  const { ctx, withToday } = tmpVault();
  withToday('2026-10-30');
  ctx.now = () => new Date(2026, 9, 30, 19, 0);
  const g = require('../modules/gunluk/main');
  const a = g.alerts(ctx);
  assert.equal(a[0].level, 'warn');
  assert.equal(a[0].notify, true);
});

// ---------------------------------------------------------------- tekrar
const TAKIP = '---\ntur: bilgi\n---\n# Tekrar takibi\n\nAralık metni 1 → 3.\n\n| Not | Son tekrar | Sonraki | Aralık (gün) |\n|---|---|---|---|\n';
const KAVRAM = '---\ntur: kavram\n---\n# Token\n\n## Kendimi sınama soruları\n- S: Token nedir?\n  C: Modelin gördüğü metin parçası\n- S: \n  C: \n';

test('tekrar: yeni kavram tabloya eklenir, sorular okunur, boş soru atlanır', () => {
  const { ctx, withToday } = tmpVault({ 'tekrar/takip.md': TAKIP, 'knowledge/concepts/token.md': KAVRAM, 'knowledge/concepts/README.md': '# r' });
  withToday('2026-10-30');
  const t = require('../modules/tekrar/main');
  const due = t.api.due(ctx);
  assert.equal(due.length, 1);
  assert.equal(due[0].stem, 'token');
  assert.deepEqual(due[0].questions, [{ q: 'Token nedir?', c: 'Modelin gördüğü metin parçası' }]);
  assert.ok(ctx.read('tekrar/takip.md').includes('| [[token]] |  | 2026-10-30 | 1 |'));
  assert.equal(t.api.due(ctx).length, 1, 'ikinci çağrı satırı çoğaltmamalı');
  assert.equal(t.rows(ctx).length, 1);
});

test('tekrar: aralık merdiveni ve yanlış cevapta 1\'e dönüş', () => {
  const { ctx, withToday } = tmpVault({ 'tekrar/takip.md': TAKIP, 'knowledge/concepts/token.md': KAVRAM });
  withToday('2026-10-30');
  const t = require('../modules/tekrar/main');
  t.api.due(ctx);
  const seen = [];
  for (let i = 0; i < 6; i++) seen.push(t.api.answer(ctx, 'token', true).interval);
  assert.deepEqual(seen, [3, 7, 14, 30, 30, 30]);
  const wrong = t.api.answer(ctx, 'token', false);
  assert.equal(wrong.interval, 1);
  assert.equal(wrong.next, '2026-10-31');
  assert.equal(t.api.due(ctx).length, 0, 'yarına ertelenen kart bugün gelmez');
  assert.ok(ctx.read('tekrar/takip.md').startsWith('---\ntur: bilgi'), 'tablo dışı metin korunur');
});

test('tekrar: kavram yokken bilgi uyarısı, vakti gelince bildirimli uyarı', () => {
  const empty = tmpVault({ 'tekrar/takip.md': TAKIP });
  const t = require('../modules/tekrar/main');
  assert.equal(t.alerts(empty.ctx)[0].level, 'info');
  const full = tmpVault({ 'tekrar/takip.md': TAKIP, 'knowledge/concepts/token.md': KAVRAM });
  assert.equal(t.alerts(full.ctx)[0].notify, true);
});

// ---------------------------------------------------------------- modül keşfi
test('keşif: beş modül yüklenir, sıralanır', () => {
  const { discover } = require('../lib/modules');
  const mods = discover(path.join(__dirname, '..', 'modules'));
  assert.deepEqual(mods.map((m) => m.id), ['yakala', 'hatirlatici', 'gunluk', 'tekrar', 'claude']);
  for (const m of mods) assert.equal(typeof m.impl.api, 'object');
});
