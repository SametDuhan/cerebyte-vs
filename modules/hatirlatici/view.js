import { el, call, toast, guard } from '../../renderer/ui.js';

export async function render(root) {
  const date = el('input', { type: 'date' });
  const text = el('input', { type: 'text', class: 'wide', placeholder: 'Ne yapılacak?' });
  const lead = el('input', { type: 'number', value: 3, min: 0, class: 'w70', title: 'Kaç gün önceden haber' });
  const list = el('ul', { class: 'list' });
  let showDone = false;

  const when = (r) => (r.days < 0 ? el('span', { class: 'pill due' }, `${-r.days} gün gecikti`)
    : r.days === 0 ? el('span', { class: 'pill due' }, 'bugün')
    : el('span', { class: r.days <= r.lead ? 'pill warn' : 'pill' }, `${r.days} gün sonra`));

  const draw = (rows) => {
    const open = rows.filter((r) => !r.done).sort((a, b) => a.date.localeCompare(b.date));
    const done = rows.filter((r) => r.done);
    const row = (r) => el('li', { class: r.done ? 'done' : '' },
      el('input', { type: 'checkbox', checked: r.done, onchange: () => guard(async () => draw(await call('hatirlatici', 'toggle', r.idx, r.line))) }),
      el('span', { class: 'grow' }, r.text),
      r.done ? null : when(r), el('span', { class: 'pill' }, r.date));
    list.replaceChildren(...(open.length ? open.map(row) : [el('li', { class: 'muted' }, 'Açık hatırlatıcı yok.')]),
      done.length ? el('li', {}, el('button', { class: 'ghost', onclick: () => { showDone = !showDone; draw(rows); } }, `${showDone ? 'Bitenleri gizle' : 'Bitenleri göster'} (${done.length})`)) : null,
      ...(showDone ? done.map(row) : []));
  };

  const add = () => guard(async () => {
    draw(await call('hatirlatici', 'add', date.value, text.value, lead.value));
    text.value = '';
    toast('Eklendi');
  });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  root.append(
    el('h1', {}, 'Hatırlatıcılar'),
    el('p', { class: 'muted' }, 'hatirlaticilar.md ile aynı dosya. Süresi yaklaşınca ve gecikince bildirim gelir.'),
    el('div', { class: 'row' }, date, text, el('label', {}, 'önceden ', lead, ' gün'), el('button', { onclick: add }, 'Ekle')),
    list,
  );
  draw(await call('hatirlatici', 'list'));
}
