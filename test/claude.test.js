// Claude modülü testleri: gerçek claude yerine sahte bir betik (CLAUDE_BIN) çalıştırılır; model çağrısı ve maliyet yok.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeCtx } = require('../lib/vault');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitDone = async (api) => { for (let i = 0; i < 100; i++) { const s = api.status(); if (s && !s.running) return s; await sleep(50); } throw new Error('bitmedi'); };

function setup(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-claude-'));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(path.join(vault, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'inbox/yakala.md'), '- madde (2026-10-30)\n');
  fs.writeFileSync(path.join(vault, 'kalir.md'), 'sabit');
  const bin = path.join(dir, 'fake-claude.sh');
  fs.writeFileSync(bin, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  process.env.CLAUDE_BIN = bin;
  delete require.cache[require.resolve('../modules/claude/main')];
  return { ctx: makeCtx(vault), mod: require('../modules/claude/main'), dir };
}

test('claude: argümanlar güvenli (acceptEdits, Bash yalnız receipt/log, bütçe sınırı, oturum kaydı yok)', () => {
  const { mod } = setup('true');
  for (const a of mod.ACTIONS) {
    const args = mod.buildArgs(a);
    assert.equal(args[0], '-p');
    assert.equal(args[1], a.prompt);
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits');
    assert.equal(args.indexOf('--allowedTools'), args.length - a.tools.length - 1, '--allowedTools son sırada olmalı');
    const tools = args.slice(args.indexOf('--allowedTools') + 1);
    assert.ok(!tools.includes('Bash'), `${a.id} çıplak Bash izni almamalı`);
    for (const t of tools.filter((x) => x.startsWith('Bash('))) assert.match(t, /^Bash\((py -3|python3?) (beyin\.py receipt|araclar\/vault\.py log):\*\)$/, `${a.id}: Bash yalnız receipt/log komutlarıyla sınırlı`);
    assert.ok(args.includes('--no-session-persistence'));
    assert.ok(Number(args[args.indexOf('--max-budget-usd') + 1]) > 0);
  }
});

test('claude: çalıştır → çıktı toplanır, vault\'ta değişen/yeni dosya listelenir, vault klasöründe çalışır', async () => {
  const { ctx, mod } = setup('pwd; echo "args: $@"; echo yeni > yeni.md; echo islendi >> inbox/yakala.md');
  mod.api.run(ctx, 'inbox');
  const s = await waitDone(mod.api);
  assert.equal(s.exitCode, 0);
  assert.match(s.output, /args: -p \/inbox --permission-mode acceptEdits/);
  assert.ok(s.output.includes(path.basename(path.dirname(ctx.path('x')))) || s.output.includes('vault'));
  assert.deepEqual(s.changed, [{ file: 'inbox/yakala.md', kind: 'değişti' }, { file: 'yeni.md', kind: 'yeni' }]);
});

test('claude: aynı anda ikinci çalıştırma reddedilir, iptal süreci durdurur', async () => {
  const { ctx, mod } = setup('sleep 30');
  mod.api.run(ctx, 'sabah');
  assert.throws(() => mod.api.run(ctx, 'inbox'), /çalışıyor/);
  mod.api.cancel();
  const s = await waitDone(mod.api);
  assert.equal(s.error, 'İptal edildi.');
  assert.ok(s.elapsedMs < 5000);
});

test('claude: hata kodu ve bilinmeyen eylem; bulunamayan claude anlaşılır hata verir', async () => {
  const { ctx, mod } = setup('echo bozuk >&2; exit 3');
  assert.throws(() => mod.api.run(ctx, 'yok'), /Bilinmeyen/);
  mod.api.run(ctx, 'haftalik');
  const s = await waitDone(mod.api);
  assert.equal(s.exitCode, 3);
  assert.match(s.output, /bozuk/);
  process.env.CLAUDE_BIN = path.join(ctx.vault, 'yok-boyle-bir-program');
  delete require.cache[require.resolve('../modules/claude/main')];
  const m2 = require('../modules/claude/main');
  m2.api.run(ctx, 'sabah');
  const s2 = await waitDone(m2.api);
  assert.match(s2.error, /bulunamadı/);
});

test('claude: hook engeli çıktıda görünürse başarılı sayılmaz (exit 0 olsa bile)', async () => {
  const { ctx, mod } = setup('echo "UserPromptSubmit operation blocked by hook:"; echo "python: can\'t open file"; exit 0');
  mod.api.run(ctx, 'inbox');
  const s = await waitDone(mod.api);
  assert.equal(s.exitCode, 0);
  assert.match(s.error, /hook/);
});
