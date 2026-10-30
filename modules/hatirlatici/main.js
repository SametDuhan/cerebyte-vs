// Hatırlatıcılar: hatirlaticilar.md. Biçim: `- [ ] YYYY-MM-DD | ne yapılacak | kaç gün önceden (varsayılan 3)`
const FILE = 'hatirlaticilar.md';
const LINE = /^- \[( |x)\]\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/;

function parse(ctx) {
  const today = ctx.today();
  const out = [];
  (ctx.read(FILE) || '').split('\n').forEach((line, idx) => {
    const m = line.match(LINE);
    if (!m) return;
    const parts = m[3].split('|').map((s) => s.trim());
    let lead = 3;
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) lead = Number(parts.pop());
    out.push({ idx, line, done: m[1] === 'x', date: m[2], text: parts.join(' | '), lead, days: ctx.diffDays(m[2], today) });
  });
  return out;
}

const api = {
  list: (ctx) => parse(ctx),
  add(ctx, date, text, lead = 3) {
    text = String(text || '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !text) throw new Error('Tarih (YYYY-AA-GG) ve metin gerekli.');
    const lines = (ctx.read(FILE) ?? '# Hatırlatıcılar\n\n## Bekleyenler\n').split('\n');
    const row = `- [ ] ${date} | ${text} | ${Number(lead) || 3}`;
    const last = lines.map((l, i) => (LINE.test(l) ? i : -1)).filter((i) => i >= 0).pop();
    if (last === undefined) lines.push(row); else lines.splice(last + 1, 0, row);
    ctx.write(FILE, lines.join('\n').replace(/\n*$/, '\n'));
    return parse(ctx);
  },
  toggle(ctx, idx, line) {
    const lines = (ctx.read(FILE) || '').split('\n');
    if (lines[idx] !== line) throw new Error('Dosya değişmiş, liste yenilendi.');
    lines[idx] = line.includes('[ ]') ? line.replace('[ ]', '[x]') : line.replace('[x]', '[ ]');
    ctx.write(FILE, lines.join('\n'));
    return parse(ctx);
  },
};

function alerts(ctx) {
  const out = [];
  for (const r of parse(ctx)) {
    if (r.done) continue;
    const key = `hatirlatici-${r.date}-${r.text.slice(0, 20)}`;
    if (r.days < 0) out.push({ id: key, level: 'due', go: 'hatirlatici', notify: true, text: `Gecikti (${-r.days} gün): ${r.text}` });
    else if (r.days === 0) out.push({ id: key, level: 'due', go: 'hatirlatici', notify: true, text: `Bugün: ${r.text}` });
    else if (r.days <= r.lead) out.push({ id: key, level: 'warn', go: 'hatirlatici', notify: true, text: `${r.days} gün sonra (${r.date}): ${r.text}` });
  }
  return out;
}

module.exports = { api, alerts, parse };
