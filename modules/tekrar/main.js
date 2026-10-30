// Aralıklı tekrar: tekrar/takip.md tablosu + knowledge/concepts/ notlarındaki "Kendimi sınama soruları".
// Aralık merdiveni 1 → 3 → 7 → 14 → 30 gün; bilemezsen 1'e döner (tekrar skill'i ile aynı kural).
const fs = require('fs');
const path = require('path');

const FILE = 'tekrar/takip.md';
const LADDER = [1, 3, 7, 14, 30];
const ROW = /^\|\s*(.*?)\s*\|\s*(\d{4}-\d{2}-\d{2})?\s*\|\s*(\d{4}-\d{2}-\d{2})?\s*\|\s*(\d+)?\s*\|\s*$/;
const stemOf = (cell) => cell.replace(/^\[\[|\]\]$/g, '').trim();

function rows(ctx) {
  return (ctx.read(FILE) || '').split('\n').map((line, idx) => ({ line, idx, m: line.match(ROW) }))
    .filter((x) => x.m && x.m[1] !== 'Not' && !/^-+$/.test(x.m[1]))
    .map((x) => ({ idx: x.idx, stem: stemOf(x.m[1]), last: x.m[2] || '', next: x.m[3] || '', interval: Number(x.m[4]) || 1 }));
}

const fmt = (r) => `| [[${r.stem}]] | ${r.last} | ${r.next} | ${r.interval} |`;

function conceptStems(ctx) {
  return ctx.list('knowledge/concepts').filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').map((f) => f.slice(0, -3));
}

// Tabloda olmayan kavram notlarını bugünden başlayacak şekilde ekler.
function sync(ctx) {
  const have = new Set(rows(ctx).map((r) => r.stem));
  const fresh = conceptStems(ctx).filter((s) => !have.has(s));
  if (!fresh.length || !ctx.exists(FILE)) return false;
  const lines = ctx.read(FILE).split('\n');
  const lastRow = lines.map((l, i) => (l.startsWith('|') ? i : -1)).filter((i) => i >= 0).pop();
  if (lastRow === undefined) return false;
  lines.splice(lastRow + 1, 0, ...fresh.map((s) => fmt({ stem: s, last: '', next: ctx.today(), interval: 1 })));
  ctx.write(FILE, lines.join('\n'));
  return true;
}

function findNote(ctx, stem) {
  const walk = (rel) => {
    for (const name of ctx.list(rel)) {
      const sub = `${rel}/${name}`;
      if (name === `${stem}.md`) return sub;
      if (fs.statSync(ctx.path(sub)).isDirectory()) { const hit = walk(sub); if (hit) return hit; }
    }
    return null;
  };
  return walk('knowledge');
}

function questionsOf(ctx, stem) {
  const rel = findNote(ctx, stem);
  const t = rel ? ctx.read(rel) : null;
  if (!t) return { rel, questions: [] };
  const part = t.split(/^## /m).find((s) => s.startsWith('Kendimi sınama')) || '';
  const questions = [...part.matchAll(/-\s*S:\s*(.*)\n\s*C:\s*(.*)/g)].map((m) => ({ q: m[1].trim(), c: m[2].trim() })).filter((x) => x.q);
  return { rel, questions };
}

function due(ctx) {
  sync(ctx);
  const today = ctx.today();
  return rows(ctx).filter((r) => !r.next || r.next <= today).map((r) => ({ ...r, ...questionsOf(ctx, r.stem) }));
}

function answer(ctx, stem, correct) {
  const lines = (ctx.read(FILE) || '').split('\n');
  const r = rows(ctx).find((x) => x.stem === stem);
  if (!r) throw new Error(`Tabloda yok: ${stem}`);
  const pos = LADDER.indexOf(r.interval);
  const interval = correct ? LADDER[Math.min(pos < 0 ? 0 : pos + 1, LADDER.length - 1)] : 1;
  lines[r.idx] = fmt({ stem, last: ctx.today(), next: ctx.addDays(ctx.today(), interval), interval });
  ctx.write(FILE, lines.join('\n'));
  return { interval, next: ctx.addDays(ctx.today(), interval) };
}

const api = {
  due: (ctx) => due(ctx),
  answer: (ctx, stem, correct) => answer(ctx, stem, correct),
  table: (ctx) => { sync(ctx); return rows(ctx); },
};

function alerts(ctx) {
  const all = conceptStems(ctx);
  if (!all.length) return [{ id: 'tekrar-bos', level: 'info', go: 'tekrar', text: 'Henüz kavram notu yok. İlkini Obsidian\'da kendi cümlelerinle yaz (knowledge/concepts/).' }];
  const n = due(ctx).length;
  return n ? [{ id: 'tekrar-vakit', level: 'warn', go: 'tekrar', notify: true, text: `${n} kavramın tekrarı bekliyor.` }] : [];
}

module.exports = { api, alerts, rows, LADDER };
