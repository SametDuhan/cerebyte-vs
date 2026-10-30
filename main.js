const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, globalShortcut, nativeImage, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { makeCtx, ymd } = require('./lib/vault');
const { discover } = require('./lib/modules');

const SMOKE = process.argv.includes('--smoke');
const SMOKE_UI = process.argv.includes('--smoke-ui');
const CHECK_EVERY_MS = 30 * 60 * 1000;

let win = null;
let tray = null;
let quitting = false;
const notified = new Set();

// ---- ayarlar (userData/config.json; vault'a yazılmaz)
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { /* ilk açılış */ }
  return { vault: process.env.BEYIN_VAULT || c.vault || '', disabled: c.disabled || [], autostart: !!c.autostart };
}
function saveConfig(c) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(c, null, 2));
}

let config;
let modules = [];
const vaultReady = () => !!config.vault && fs.existsSync(config.vault);
const ctx = () => {
  if (!vaultReady()) throw new Error('Vault klasörü seçilmedi. Ayarlar\'dan seç.');
  return makeCtx(config.vault);
};
const enabled = () => modules.filter((m) => !config.disabled.includes(m.id));

function collectAlerts() {
  if (!vaultReady()) {
    return [{ id: 'kurulum', level: 'warn', go: 'settings', module: 'core', text: 'Vault klasörü seçilmedi. Ayarlar\'dan notlarının klasörünü seç.' }];
  }
  const out = [];
  for (const m of enabled()) {
    try {
      for (const a of (m.impl.alerts ? m.impl.alerts(ctx()) : [])) out.push({ ...a, module: m.id });
    } catch (e) {
      out.push({ id: `${m.id}-hata`, level: 'warn', module: m.id, go: m.id, text: `${m.title} modülü uyarı üretemedi: ${e.message}` });
    }
  }
  const rank = { due: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

function checkAndNotify() {
  const day = ymd();
  for (const a of collectAlerts()) {
    const key = `${a.id}|${day}`;
    if (!a.notify || notified.has(key) || !Notification.isSupported()) continue;
    notified.add(key);
    const n = new Notification({ title: 'Cerebyte VS', body: a.text });
    n.on('click', () => show(a.go));
    n.show();
  }
}

// ---- pencere
function show(go) {
  if (!win) createWindow();
  win.show();
  win.focus();
  if (go) win.webContents.send('goto', go);
}

function createWindow() {
  win = new BrowserWindow({
    width: 980, height: 680, minWidth: 720, minHeight: 480, backgroundColor: '#14141c', title: 'Cerebyte VS',
    icon: path.join(__dirname, 'assets', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Cerebyte VS');
  tray.on('click', () => show());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Aç', click: () => show() },
    { label: 'Hızlı yakala (Ctrl+Alt+B)', click: () => show('yakala') },
    { type: 'separator' },
    { label: 'Çık', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---- IPC
function wireIpc() {
  ipcMain.handle('modules', () => modules.map((m) => ({ id: m.id, title: m.title, icon: m.icon, enabled: !config.disabled.includes(m.id) })));
  ipcMain.handle('mod', (_e, id, method, args) => {
    const m = enabled().find((x) => x.id === id);
    if (!m || typeof m.impl.api[method] !== 'function') throw new Error(`Bilinmeyen çağrı: ${id}.${method}`);
    return m.impl.api[method](ctx(), ...(args || []));
  });
  ipcMain.handle('alerts', () => collectAlerts());
  ipcMain.handle('pickVault', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Vault klasörünü seç', properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('config', () => ({ ...config }));
  ipcMain.handle('setEnabled', (_e, id, on) => {
    config.disabled = on ? config.disabled.filter((x) => x !== id) : [...new Set([...config.disabled, id])];
    saveConfig(config);
  });
  ipcMain.handle('setConfig', (_e, patch) => {
    if (patch.vault !== undefined && !fs.existsSync(patch.vault)) throw new Error('Bu klasör yok.');
    config = { ...config, ...patch };
    if (patch.autostart !== undefined) app.setLoginItemSettings({ openAtLogin: !!patch.autostart });
    saveConfig(config);
    return { ...config };
  });
}

// Arayüz duman testi: her ekranı aç, konsol hatalarını topla, ekran görüntüsü al, yakala ekranından ekleme dene.
// Yalnız BEYIN_VAULT ile verilen geçici bir vault'ta çalıştır (yazma yapar).
async function smokeUi() {
  const errors = [];
  const report = { screens: {}, errors };
  win = new BrowserWindow({ width: 980, height: 680, show: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (...a) => {
    const e = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] };
    if (e.level === 'error' || e.level === 3) errors.push(e.message);
  });
  const guardTimer = setTimeout(() => { console.log('ZAMAN AŞIMI'); app.exit(2); }, 40000);
  try {
    await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    const js = (code) => win.webContents.executeJavaScript(code);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(800);
    const out = process.env.BEYIN_SHOTS || app.getPath('temp');
    for (const id of ['today', 'yakala', 'hatirlatici', 'gunluk', 'tekrar', 'settings']) {
      await js(`document.querySelector('nav button[data-id="${id}"]').click()`);
      await wait(700);
      report.screens[id] = await js(`document.getElementById('view').innerText.slice(0, 160)`);
      fs.writeFileSync(path.join(out, `beyin-${id}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await js(`document.querySelector('nav button[data-id="yakala"]').click()`);
    await wait(500);
    await js(`(() => { const t = document.querySelector('textarea'); t.value = 'arayüz testi maddesi'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await wait(700);
    report.afterAdd = await js(`document.querySelector('.list').innerText`);
  } catch (e) {
    report.fatal = String(e.stack || e);
  }
  clearTimeout(guardTimer);
  console.log(JSON.stringify(report, null, 1));
  app.exit(report.fatal || errors.length ? 1 : 0);
}

if (!app.requestSingleInstanceLock() && !SMOKE) {
  app.quit();
} else {
  app.on('second-instance', () => show());
  app.whenReady().then(() => {
    config = loadConfig();
    modules = discover(path.join(__dirname, 'modules'));
    if (SMOKE) { // başsız duman testi: modülleri yükle, uyarıları yaz, çık
      console.log(JSON.stringify({ vault: config.vault, modules: modules.map((m) => m.id), alerts: collectAlerts() }, null, 1));
      return app.quit();
    }
    wireIpc();
    if (SMOKE_UI) return smokeUi();
    createTray();
    createWindow();
    globalShortcut.register('Control+Alt+B', () => show('yakala'));
    setTimeout(checkAndNotify, 5000);
    setInterval(checkAndNotify, CHECK_EVERY_MS);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* tepsiden çalışmaya devam */ });
}
