import { el, guard } from './ui.js';

const nav = document.getElementById('nav');
const view = document.getElementById('view');
let current = null;

const LEVEL_LABEL = { due: 'Acil', warn: 'Uyarı', info: 'Bilgi' };

async function renderToday() {
  const alerts = await window.beyin.alerts();
  const now = new Date();
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  view.replaceChildren(
    el('h1', {}, 'Bugün'),
    el('p', { class: 'muted' }, `${days[now.getDay()]}, ${now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`),
    alerts.length
      ? el('ul', { class: 'alerts' }, alerts.map((a) => el('li', { class: `alert ${a.level}`, onclick: () => open(a.go) },
          el('span', { class: 'badge' }, LEVEL_LABEL[a.level]), el('span', {}, a.text))))
      : el('p', { class: 'empty' }, 'Her şey yolunda, bekleyen uyarı yok.'),
  );
}

async function renderSettings() {
  const mods = await window.beyin.modules();
  const cfg = await window.beyin.config();
  const vault = el('input', { type: 'text', value: cfg.vault, class: 'wide', placeholder: 'Notlarının (Markdown vault) klasörü' });
  const apply = () => guard(async () => {
    await window.beyin.setConfig({ vault: vault.value.trim() });
    await open('settings');
  });
  view.replaceChildren(
    el('h1', {}, 'Ayarlar'),
    el('h2', {}, 'Özellikler'),
    el('p', { class: 'muted' }, 'Kapatılan özellik menüden ve uyarılardan kalkar. Yeni özellik eklemek için modules/ altına klasör bırakmak yeterli.'),
    el('ul', { class: 'plain' }, mods.map((m) => el('li', {},
      el('label', {}, el('input', { type: 'checkbox', checked: m.enabled, onchange: async (e) => {
        await window.beyin.setEnabled(m.id, e.target.checked);
        await buildNav();
      } }), ` ${m.icon} ${m.title}`)))),
    el('h2', {}, 'Vault klasörü'),
    el('div', { class: 'row' }, vault,
      el('button', { class: 'ghost', onclick: async () => { const p = await window.beyin.pickVault(); if (p) vault.value = p; } }, 'Klasör seç…'),
      el('button', { onclick: apply }, 'Kaydet')),
    el('h2', {}, 'Başlangıç'),
    el('label', {}, el('input', { type: 'checkbox', checked: cfg.autostart, onchange: (e) => window.beyin.setConfig({ autostart: e.target.checked }) }),
      ' Windows açılınca tepside başlat'),
  );
}

async function open(id) {
  current = id;
  for (const b of nav.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === id);
  try {
    if (id === 'today') await renderToday();
    else if (id === 'settings') await renderSettings();
    else {
      view.replaceChildren();
      const mod = await import(`../modules/${id}/view.js`);
      await mod.render(view);
    }
  } catch (e) {
    view.replaceChildren(el('h1', {}, 'Hata'), el('pre', {}, String(e.stack || e)));
  }
}

async function buildNav() {
  const mods = (await window.beyin.modules()).filter((m) => m.enabled);
  const item = (id, icon, title) => el('button', { 'data-id': id, class: id === current ? 'active' : '', onclick: () => open(id) },
    el('span', { class: 'ico' }, icon), title);
  nav.replaceChildren(
    el('div', { class: 'brand' }, '🧠 Cerebyte VS'),
    item('today', '☀', 'Bugün'),
    ...mods.map((m) => item(m.id, m.icon, m.title)),
    el('div', { class: 'spacer' }),
    item('settings', '⚙', 'Ayarlar'),
  );
}

window.beyin.onGoto((id) => open(id));
await buildNav();
await open((await window.beyin.config()).vault ? 'today' : 'settings');
