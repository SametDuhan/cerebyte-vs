// Modül keşfi: modules/<ad>/module.json olan her klasör bir özelliktir.
// Yeni özellik eklemek = yeni klasör bırakmak; kaldırmak = klasörü silmek ya da Ayarlar'dan kapatmak.
const fs = require('fs');
const path = require('path');

function discover(dir) {
  const found = [];
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const manifest = path.join(dir, name, 'module.json');
    if (!fs.existsSync(manifest)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const impl = require(path.join(dir, name, 'main.js'));
      found.push({ id: name, title: meta.title || name, icon: meta.icon || '•', order: meta.order ?? 100, impl });
    } catch (e) {
      console.error(`Modül yüklenemedi: ${name}: ${e.message}`);
    }
  }
  return found.sort((a, b) => a.order - b.order);
}

module.exports = { discover };
