// Günlük çalışma notu (gunluk/YYYY-MM-DD.md) ve çalışma serisi. Seri mantığı araclar/vault.py study_stats ile aynıdır.
const TEMPLATE = (d) => `---\ntur: gunluk\ntarih: ${d}\n---\n# ${d}\n\n## Plan (en fazla 3 madde)\n\n## Yapılan çalışma\n\n## Soru çözme\n\n## Kendi cümlelerimle öğrendiğim 1 şey\n\n## Yarına\n`;
const PLACEHOLDERS = ['Konu / süre (dk):', 'Çözülen soru sayısı:', 'Takıldığım yer:'];

function parseNote(text) {
  const parts = text.split(/^## /m);
  const head = parts.shift();
  const secs = parts.map((p) => {
    const i = p.indexOf('\n');
    return { title: p.slice(0, i < 0 ? p.length : i).trim(), body: i < 0 ? '' : p.slice(i + 1).replace(/\n+$/, '') };
  });
  return { head, secs };
}
const buildNote = ({ head, secs }) => head.replace(/\n*$/, '\n\n') + secs.map((s) => `## ${s.title}\n${s.body}\n`).join('\n');
const sec = (note, prefix) => note.secs.find((s) => s.title.startsWith(prefix));
const bodyLines = (s) => (s ? s.body.split('\n') : []);
const clean = (s) => s.replace(/^-\s*/, '').trim();
const isPlaceholder = (line) => PLACEHOLDERS.includes(clean(line));

function get(ctx, date) {
  const note = parseNote(ctx.read(`gunluk/${date}.md`) ?? TEMPLATE(date));
  const plan = bodyLines(sec(note, 'Plan')).map((l) => l.match(/^- \[( |x)\]\s*(.*)$/)).filter((m) => m && m[2].trim())
    .map((m) => ({ done: m[1] === 'x', text: m[2].trim() }));
  const work = bodyLines(sec(note, 'Yapılan')).filter((l) => l.trim() && !isPlaceholder(l)).map(clean).join('\n');
  const soruLines = bodyLines(sec(note, 'Soru'));
  const q = soruLines.map((l) => l.match(/Çözülen soru sayısı:\s*(\d*)/)).find(Boolean);
  const stuck = soruLines.map((l) => l.match(/Takıldığım yer:\s*(.*)$/)).find(Boolean);
  const text = (prefix) => bodyLines(sec(note, prefix)).join('\n').trim();
  return { date, exists: ctx.exists(`gunluk/${date}.md`), plan, work, questions: q && q[1] ? Number(q[1]) : 0,
    stuck: stuck ? stuck[1].trim() : '', learned: text('Kendi cümlelerimle'), tomorrow: text('Yarına') };
}

function save(ctx, date, d) {
  const rel = `gunluk/${date}.md`;
  const note = parseNote(ctx.read(rel) ?? TEMPLATE(date));
  const set = (prefix, title, body) => {
    const s = sec(note, prefix);
    if (s) s.body = body; else note.secs.push({ title, body });
  };
  set('Plan', 'Plan (en fazla 3 madde)', (d.plan || []).filter((p) => p.text.trim()).map((p) => `- [${p.done ? 'x' : ' '}] ${p.text.trim()}`).join('\n'));
  set('Yapılan', 'Yapılan çalışma', String(d.work || '').split('\n').filter((l) => l.trim()).map((l) => `- ${clean(l)}`).join('\n'));
  set('Soru', 'Soru çözme', `- Çözülen soru sayısı: ${Number(d.questions) || 0}\n- Takıldığım yer: ${String(d.stuck || '').replace(/\n/g, ' ').trim()}`);
  set('Kendi cümlelerimle', 'Kendi cümlelerimle öğrendiğim 1 şey', String(d.learned || '').trim());
  set('Yarına', 'Yarına', String(d.tomorrow || '').trim());
  ctx.write(rel, buildNote(note));
  return get(ctx, date);
}

const numAfter = (label, text) => {
  const m = text.match(new RegExp(label + '[^\\n\\d]*(\\d+)'));
  return m ? Number(m[1]) : 0;
};

function stats(ctx) {
  const today = ctx.today();
  const days = new Map();
  for (const f of ctx.list('gunluk')) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m) continue;
    const t = ctx.read(`gunluk/${f}`);
    const mins = [...t.matchAll(/(\d+)\s*dk/g)].reduce((a, x) => a + Number(x[1]), 0);
    const q = numAfter('Çözülen soru sayısı', t);
    if (mins || q || t.includes('- [x]')) days.set(m[1], [mins, q]); // yalnız açılmış boş şablon sayılmaz
  }
  let streak = 0;
  let d = days.has(today) ? today : ctx.addDays(today, -1);
  while (days.has(d)) { streak++; d = ctx.addDays(d, -1); }
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => days.get(ctx.addDays(today, -i))).filter(Boolean);
  const last = [...days.keys()].sort().pop() || null;
  return { streak, weekDays: week.length, weekMin: week.reduce((a, x) => a + x[0], 0), weekQ: week.reduce((a, x) => a + x[1], 0),
    todayDone: days.has(today), last, sinceLast: last ? ctx.diffDays(today, last) : null };
}

const api = {
  get: (ctx, date) => get(ctx, date || ctx.today()),
  save: (ctx, date, d) => save(ctx, date || ctx.today(), d),
  stats: (ctx) => stats(ctx),
};

function alerts(ctx) {
  const st = stats(ctx);
  if (st.todayDone) return [];
  const hour = ctx.now().getHours();
  const seri = st.streak ? ` Seri ${st.streak} gün, bozulmasın.` : '';
  if (hour >= 18) return [{ id: 'gunluk-bugun', level: 'warn', go: 'gunluk', notify: true, text: `Bugün çalışma kaydı yok.${seri}` }];
  if (st.sinceLast !== null && st.sinceLast >= 3) return [{ id: 'gunluk-ara', level: 'warn', go: 'gunluk', text: `${st.sinceLast} gündür çalışma kaydı yok.` }];
  return [{ id: 'gunluk-bugun', level: 'info', go: 'gunluk', text: `Bugün henüz kayıt yok.${seri}` }];
}

module.exports = { api, alerts, stats, parseNote, buildNote };
