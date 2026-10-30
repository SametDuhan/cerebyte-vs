import { el, call, toast, guard } from '../../renderer/ui.js';

export async function render(root) {
  const stage = el('div');
  const table = el('div');
  root.append(
    el('h1', {}, 'Tekrar'),
    el('p', { class: 'muted' }, 'Soruyu önce kendin cevapla, sonra cevabı aç. Bildiysen aralık uzar (1→3→7→14→30 gün), bilemediysen 1 güne döner.'),
    stage, el('h2', {}, 'Tüm kavramlar'), table,
  );

  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  async function load() {
    const due = await call('tekrar', 'due');
    const rows = await call('tekrar', 'table');
    const today = new Date().toLocaleDateString('sv-SE');
    table.replaceChildren(rows.length
      ? el('ul', { class: 'list' }, rows.map((r) => el('li', {}, el('span', { class: 'grow' }, r.stem),
          el('span', { class: !r.next || r.next <= today ? 'pill warn' : 'pill' }, r.next ? `sonraki ${r.next}` : 'yeni'),
          el('span', { class: 'pill' }, `${r.interval} gün`))))
      : el('p', { class: 'muted' }, 'Henüz kavram notu yok. knowledge/concepts/ altına kendi cümlelerinle yaz; burada kendiliğinden görünür.'));
    next(due);
  }

  function next(due) {
    if (!due.length) { stage.replaceChildren(el('div', { class: 'card' }, 'Bugün tekrar yok. 🎉')); return; }
    const card = due[0];
    const q = card.questions.length ? rand(card.questions) : null;
    const answerBox = el('div');
    const done = (ok) => guard(async () => {
      const r = await call('tekrar', 'answer', card.stem, ok);
      toast(ok ? `Sonraki tekrar ${r.interval} gün sonra` : 'Yarın tekrar');
      load();
    });
    const verdict = el('div', { class: 'row' },
      el('button', { class: 'good', onclick: () => done(true) }, 'Bildim'),
      el('button', { class: 'bad', onclick: () => done(false) }, 'Bilemedim'));
    verdict.style.display = 'none';

    stage.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'muted' }, `${card.stem} · ${due.length} kart kaldı`),
      q ? el('div', { class: 'question' }, q.q)
        : el('div', { class: 'question' }, 'Bu notta sınama sorusu yok. Notu aç, "Kendimi sınama soruları" bölümüne S:/C: ekle; şimdilik kavramı kendi sözlerinle anlatmayı dene.'),
      answerBox, verdict,
      el('div', { class: 'row' },
        q ? el('button', { onclick: (e) => { answerBox.replaceChildren(el('div', { class: 'answer' }, q.c || '(cevap yazılmamış)')); e.target.style.display = 'none'; verdict.style.display = 'flex'; } }, 'Cevabı göster') : null,
        !q ? el('button', { onclick: (e) => { e.target.style.display = 'none'; verdict.style.display = 'flex'; } }, 'Anlattım') : null)));
  }

  await load();
}
