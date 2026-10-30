import { el, call, toast, guard } from '../../renderer/ui.js';

export async function render(root) {
  const input = el('textarea', { placeholder: 'Aklına geleni yaz, Enter ile ekle (Shift+Enter satır sonu)…', rows: 2 });
  const list = el('ul', { class: 'list' });

  const draw = (items) => list.replaceChildren(...(items.length
    ? items.map((i) => el('li', {},
        el('span', { class: 'grow' }, i.text),
        i.date ? el('span', { class: 'pill' }, i.date) : null,
        el('button', { class: 'ghost', title: 'Sil', onclick: () => guard(async () => draw(await call('yakala', 'remove', i.idx, i.line))) }, '✕')))
    : [el('li', { class: 'muted' }, 'Inbox boş.')]));

  const add = () => guard(async () => {
    const text = input.value.trim();
    if (!text) return;
    draw(await call('yakala', 'add', text));
    input.value = '';
    toast('Eklendi');
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } });

  root.append(
    el('h1', {}, 'Hızlı yakalama'),
    el('p', { class: 'muted' }, 'Her yerden Ctrl+Alt+B ile bu ekran açılır. Maddeler inbox/yakala.md\'ye düşer; sınıflandırmak için Claude Code\'da /inbox.'),
    input, el('div', { class: 'row mt8' }, el('button', { onclick: add }, 'Ekle')),
    el('h2', {}, 'Bekleyenler'), list,
  );
  draw(await call('yakala', 'list'));
  input.focus();
}
