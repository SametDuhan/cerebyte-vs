// Görünümlerin ortak yardımcıları. İçerik her zaman metin düğümü olarak eklenir (innerHTML yok).
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') n[k] = v;
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const call = (mod, method, ...args) => window.beyin.call(mod, method, ...args);

let timer;
export function toast(msg, bad = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = bad ? 'show bad' : 'show';
  clearTimeout(timer);
  timer = setTimeout(() => { t.className = ''; }, 2600);
}

// Hata fırlatabilecek işlemi sarar; hatayı toast olarak gösterir.
export async function guard(fn) {
  try { return await fn(); } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
}
