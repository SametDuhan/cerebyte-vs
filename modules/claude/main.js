// Claude Code düğmeleri: actions.json'daki her eylem, vault klasöründe başsız `claude -p` olarak çalışır.
// Hiçbir şey kendiliğinden çalışmaz (model çağrısı maliyetlidir); arayüz her çalıştırmadan önce onay ister.
// Yazma izni yalnız Read/Edit/Write/Glob/Grep gibi actions.json'da listelenen araçlarla sınırlıdır, Bash yoktur.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ACTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'actions.json'), 'utf8'));
const MAX_OUT = 200000;
const TIMEOUT_MS = 10 * 60 * 1000;
const HOOK_BLOCK = /operation blocked by hook|hook .{0,400}failed/i; // exit 0 ile bitse de iş yapılmamıştır

let job = null; // { action, title, startedAt, finishedAt, running, output, exitCode, error, changed, child }

function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const local = path.join(os.homedir(), '.local', 'bin', exe);
  return fs.existsSync(local) ? local : exe; // bulunamazsa PATH'te aranır
}

function buildArgs(a) {
  return ['-p', a.prompt, '--permission-mode', 'acceptEdits', '--allowedTools', a.tools.join(','),
    '--output-format', 'text', '--no-session-persistence', ...(a.budget ? ['--max-budget-usd', String(a.budget)] : [])];
}

// Vault'taki metin dosyalarının parmak izi; çalıştırma öncesi/sonrası farkı "ne değişti" listesini verir.
function snapshot(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else { const s = fs.statSync(full); out.set(path.relative(root, full).split(path.sep).join('/'), `${s.size}:${Math.round(s.mtimeMs)}`); }
    }
  };
  walk(root);
  return out;
}
function diffSnapshots(before, after) {
  const changed = [];
  for (const [k, v] of after) if (!before.has(k)) changed.push({ file: k, kind: 'yeni' }); else if (before.get(k) !== v) changed.push({ file: k, kind: 'değişti' });
  for (const k of before.keys()) if (!after.has(k)) changed.push({ file: k, kind: 'silindi' });
  return changed.sort((a, b) => a.file.localeCompare(b.file));
}

function notify(body) {
  try {
    const { Notification } = require('electron');
    if (Notification && Notification.isSupported()) new Notification({ title: 'Cerebyte VS', body }).show();
  } catch { /* electron dışında (testlerde) bildirim yok */ }
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}

function publicJob() {
  if (!job) return null;
  const { child, ...rest } = job; // eslint-disable-line no-unused-vars
  return { ...rest, output: job.output.slice(-20000), elapsedMs: (job.finishedAt || Date.now()) - job.startedAt };
}

const api = {
  actions: () => ACTIONS.map(({ id, title, desc, needs, budget, tools }) => ({ id, title, desc, needs: needs || null, budget, tools })),
  status: () => publicJob(),
  run(ctx, id) {
    if (job && job.running) throw new Error('Başka bir işlem çalışıyor, bitmesini bekle ya da iptal et.');
    const a = ACTIONS.find((x) => x.id === id);
    if (!a) throw new Error(`Bilinmeyen eylem: ${id}`);
    const before = snapshot(ctx.vault);
    job = { action: a.id, title: a.title, startedAt: Date.now(), finishedAt: null, running: true, output: '', exitCode: null, error: null, changed: [], child: null };
    const mine = job;
    const append = (s) => { mine.output = (mine.output + s).slice(-MAX_OUT); };
    let child;
    try {
      child = spawn(findClaude(), buildArgs(a), { cwd: ctx.vault, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      mine.running = false; mine.finishedAt = Date.now(); mine.error = `Claude Code başlatılamadı: ${e.message}`;
      return publicJob();
    }
    mine.child = child;
    child.stdout.setEncoding('utf8').on('data', append);
    child.stderr.setEncoding('utf8').on('data', append);
    const timer = setTimeout(() => { mine.error = 'Zaman aşımı (10 dk), durduruldu.'; killTree(child); }, TIMEOUT_MS);
    const finish = (code) => {
      clearTimeout(timer);
      if (!mine.running) return;
      mine.running = false; mine.finishedAt = Date.now(); mine.exitCode = code;
      if (!mine.error && HOOK_BLOCK.test(mine.output)) mine.error = 'Vault\'taki bir Claude Code hook\'u çalıştırmayı engelledi (hook yolu bozuk olabilir). Çıktıya bak.';
      try { mine.changed = diffSnapshots(before, snapshot(ctx.vault)); } catch { /* sayım başarısızsa liste boş */ }
      notify(mine.error ? `${a.title}: ${mine.error}` : code === 0 ? `${a.title} bitti, ${mine.changed.length} dosya etkilendi.` : `${a.title} hata ile bitti (kod ${code}).`);
    };
    child.on('error', (e) => { mine.error = e.code === 'ENOENT' ? 'Claude Code bulunamadı. Kurulu olduğundan emin ol ya da CLAUDE_BIN ortam değişkeniyle yolunu ver.' : `Başlatılamadı: ${e.message}`; finish(null); });
    child.on('close', (code) => finish(code));
    return publicJob();
  },
  cancel() {
    if (!job || !job.running) return publicJob();
    job.error = 'İptal edildi.';
    killTree(job.child);
    return publicJob();
  },
};

module.exports = { api, alerts: () => [], buildArgs, snapshot, diffSnapshots, findClaude, ACTIONS };
