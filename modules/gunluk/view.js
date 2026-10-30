import { el, call, toast, guard } from '../../renderer/ui.js';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function render(root) {
  const date = today();
  const d = await call('gunluk', 'get', date);
  const st = await call('gunluk', 'stats');

  const plan = [0, 1, 2].map((i) => ({ done: d.plan[i]?.done || false, text: d.plan[i]?.text || '' }));
  const planRows = plan.map((p) => {
    const box = el('input', { type: 'checkbox', checked: p.done, onchange: (e) => { p.done = e.target.checked; } });
    const txt = el('input', { type: 'text', class: 'wide', value: p.text, placeholder: 'Plan maddesi', oninput: (e) => { p.text = e.target.value; } });
    return el('div', { class: 'row mb6' }, box, txt);
  });

  const work = el('textarea', { placeholder: 'Her satıra bir iş: konu / süre, örn. "Bağlı liste / 45 dk"', rows: 3 });
  work.value = d.work;
  const questions = el('input', { type: 'number', min: 0, value: d.questions, class: 'w100' });
  const stuck = el('input', { type: 'text', class: 'wide', value: d.stuck, placeholder: 'Takıldığım yer' });
  const learned = el('textarea', { placeholder: 'Bugün öğrendiğin 1 şeyi kendi cümlenle yaz', rows: 3 });
  learned.value = d.learned;
  const tomorrow = el('textarea', { placeholder: 'Yarın için not', rows: 2 });
  tomorrow.value = d.tomorrow;

  const save = () => guard(async () => {
    await call('gunluk', 'save', date, { plan, work: work.value, questions: questions.value, stuck: stuck.value, learned: learned.value, tomorrow: tomorrow.value });
    toast('Kaydedildi');
  });

  const stat = (n, label) => el('div', { class: 'stat' }, el('b', {}, n), el('span', {}, label));
  root.append(
    el('h1', {}, 'Günlük çalışma'),
    el('p', { class: 'muted' }, `${date} · gunluk/${date}.md`),
    el('div', { class: 'stats' },
      stat(`${st.streak} gün`, 'seri'), stat(`${st.weekDays}/7`, 'son 7 günde çalışılan gün'),
      stat(`${st.weekMin} dk`, 'son 7 gün süre'), stat(st.weekQ, 'son 7 gün çözülen soru')),
    el('label', { class: 'field' }, 'Plan (en fazla 3 madde)'), ...planRows,
    el('label', { class: 'field' }, 'Yapılan çalışma'), work,
    el('label', { class: 'field' }, 'Çözülen soru sayısı'), questions,
    el('label', { class: 'field' }, 'Takıldığım yer'), stuck,
    el('label', { class: 'field' }, 'Kendi cümlelerimle öğrendiğim 1 şey'), learned,
    el('label', { class: 'field' }, 'Yarına'), tomorrow,
    el('div', { class: 'row mt16' }, el('button', { onclick: save }, 'Kaydet')),
  );
}
