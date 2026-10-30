import { el, call, toast, guard } from '../../renderer/ui.js';

const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export async function render(root) {
  const cards = el('div');
  const result = el('div');
  root.append(
    el('h1', {}, 'Claude Code'),
    el('p', { class: 'muted' }, 'Düğme, vault klasöründe Claude Code\'u başsız çalıştırır. Model çağrılır, kullanım hakkından düşer; bu yüzden hiçbir şey kendiliğinden çalışmaz ve her çalıştırma onay ister. Yeni düğme eklemek için modules/claude/actions.json\'a satır ekle.'),
    cards, result);

  const pending = async () => { try { return (await call('yakala', 'list')).length; } catch { return null; } };
  const actions = await call('claude', 'actions');
  const waiting = await pending();
  let poll = null;

  function drawCards(busy) {
    cards.replaceChildren(...actions.map((a) => {
      const count = a.needs === 'inbox' ? waiting : null;
      const empty = a.needs === 'inbox' && waiting === 0;
      const go = el('button', { disabled: busy || empty }, 'Çalıştır');
      const sure = el('div', { class: 'row' },
        el('span', { class: 'muted' }, `Model çağrılacak (en fazla ~$${a.budget} bütçe). Devam?`),
        el('button', { class: 'good', onclick: () => guard(async () => { sure.hidden = true; await call('claude', 'run', a.id); start(); }) }, 'Evet, çalıştır'),
        el('button', { class: 'ghost', onclick: () => { sure.hidden = true; go.hidden = false; } }, 'Vazgeç'));
      sure.hidden = true;
      go.addEventListener('click', () => { go.hidden = true; sure.hidden = false; });
      return el('div', { class: 'card' },
        el('div', { class: 'row' }, el('b', { class: 'grow' }, a.title), count !== null ? el('span', { class: count ? 'pill warn' : 'pill' }, `${count} madde bekliyor`) : null),
        el('p', { class: 'muted' }, a.desc),
        el('div', { class: 'row' }, go, sure));
    }));
  }

  function drawJob(j) {
    if (!j) { result.replaceChildren(); return; }
    const state = j.running ? el('span', { class: 'pill warn' }, `çalışıyor ${fmtTime(j.elapsedMs)}`)
      : j.error ? el('span', { class: 'pill due' }, j.error)
      : j.exitCode === 0 ? el('span', { class: 'pill' }, `bitti ${fmtTime(j.elapsedMs)}`)
      : el('span', { class: 'pill due' }, `hata (kod ${j.exitCode})`);
    result.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'row' }, el('b', { class: 'grow' }, j.title), state,
        j.running ? el('button', { class: 'bad', onclick: () => guard(() => call('claude', 'cancel')) }, 'İptal') : null),
      j.running && !j.output ? el('p', { class: 'muted' }, 'Claude çalışıyor, çıktı bitince görünür…') : null,
      j.output ? el('pre', { class: 'out' }, j.output) : null,
      !j.running ? el('div', {}, el('h2', {}, 'Etkilenen dosyalar'),
        j.changed.length ? el('ul', { class: 'list' }, j.changed.map((c) => el('li', {}, el('span', { class: 'grow' }, c.file), el('span', { class: 'pill' }, c.kind))))
          : el('p', { class: 'muted' }, 'Dosya değişmedi.')) : null));
  }

  async function tick() {
    const j = await call('claude', 'status');
    drawJob(j);
    drawCards(!!(j && j.running));
    if (!root.isConnected || !(j && j.running)) { clearInterval(poll); poll = null; if (j && !j.running) toast('İşlem bitti'); }
  }
  function start() { if (!poll) poll = setInterval(() => guard(tick), 800); guard(tick); }

  const first = await call('claude', 'status');
  drawJob(first);
  drawCards(!!(first && first.running));
  if (first && first.running) start();
}
