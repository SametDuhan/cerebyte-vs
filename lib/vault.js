// Vault erişimi: yol, okuma/yazma, tarih yardımcıları. Modüller yalnız bu bağlam (ctx) üzerinden dosyaya dokunur.
const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5); // a - b
const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

function makeCtx(vaultPath) {
  const p = (...x) => path.join(vaultPath, ...x);
  return {
    vault: vaultPath,
    path: p,
    exists: (rel) => fs.existsSync(p(rel)),
    read: (rel) => (fs.existsSync(p(rel)) ? fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n') : null),
    write: (rel, text) => {
      fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
      fs.writeFileSync(p(rel), text, 'utf8');
    },
    list: (rel) => (fs.existsSync(p(rel)) ? fs.readdirSync(p(rel)) : []),
    today: () => ymd(),
    now: () => new Date(),
    ymd, parseYmd, diffDays, addDays,
  };
}

module.exports = { makeCtx, ymd, parseYmd, diffDays, addDays };
