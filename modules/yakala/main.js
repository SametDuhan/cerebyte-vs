// Hızlı yakalama: inbox/yakala.md'ye madde ekler. İşlemek (sınıflandırmak) Claude Code'daki /inbox ile yapılır.
const FILE = 'inbox/yakala.md';
const HEADER = '---\ntur: bilgi\ndurum: aktif\n---\n# Yakalananlar\n\n(Maddeleri buraya alt alta yaz. /inbox ile işlenir.)\n';

function items(ctx) {
  const t = ctx.read(FILE) || '';
  return t.split('\n').map((line, idx) => ({ line, idx })).filter((x) => /^- /.test(x.line)).map(({ line, idx }) => {
    const m = line.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
    return { idx, line, text: line.replace(/^- /, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, ''), date: m ? m[1] : null };
  });
}

const api = {
  list: (ctx) => items(ctx),
  add(ctx, text) {
    text = String(text || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!text) throw new Error('Boş madde eklenemez.');
    const cur = ctx.read(FILE) ?? HEADER;
    ctx.write(FILE, cur.replace(/\n*$/, '\n') + `- ${text} (${ctx.today()})\n`);
    return items(ctx);
  },
  remove(ctx, idx, line) {
    const lines = (ctx.read(FILE) || '').split('\n');
    if (lines[idx] !== line) throw new Error('Dosya değişmiş, liste yenilendi.');
    lines.splice(idx, 1);
    ctx.write(FILE, lines.join('\n'));
    return items(ctx);
  },
};

function alerts(ctx) {
  const list = items(ctx);
  if (!list.length) return [];
  const ages = list.filter((i) => i.date).map((i) => ctx.diffDays(ctx.today(), i.date));
  const oldest = ages.length ? Math.max(...ages) : 0;
  if (list.length >= 5 || oldest >= 3) {
    return [{ id: 'yakala-bekliyor', level: 'warn', go: 'yakala', notify: true,
      text: `Inbox'ta ${list.length} madde bekliyor${oldest ? ` (en eskisi ${oldest} gün)` : ''}. Claude Code'da /inbox ile işle.` }];
  }
  return [{ id: 'yakala-bekliyor', level: 'info', go: 'yakala', text: `Inbox'ta ${list.length} madde var.` }];
}

module.exports = { api, alerts };
