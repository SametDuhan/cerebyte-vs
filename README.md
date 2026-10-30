# Cerebyte VS

Cerebyte VS, İkinci Beyin vault'unun masaüstü uygulamasıdır (Electron). Notlar düz Markdown olarak vault'ta kalır; panel onları okur, yazar ve uyarı üretir. Obsidian ve Claude Code aynen çalışmaya devam eder.

## Çalıştırma

- `Cerebyte VS.cmd` çift tıkla (tepsiye yerleşir; pencereyi kapatmak tepsiye indirir, "Çık" tepsi menüsünde).
- İlk kurulumda bir kez: `npm install` (Windows tarafında; `npm.cmd` kullan, PowerShell betik politikası `npm.ps1`'i engeller).
- Kısayol: **Ctrl+Alt+B** her yerden hızlı yakalama açar.
- Windows açılışında başlatmak: Ayarlar › "Windows açılınca tepside başlat".

İlk açılışta Ayarlar ekranı gelir ve vault klasörünü (Markdown notlarının bulunduğu klasör) seçmeni ister. Seçim yalnız bu bilgisayarda, uygulama ayarlarında tutulur; depoya ya da vault'a yazılmaz. `BEYIN_VAULT` ortam değişkeni ayarı geçersiz kılar.

## Özellikler (modüller)

| Modül | Dosya | Uyarılar |
|---|---|---|
| Yakala | `inbox/yakala.md` | 5+ madde ya da 3+ günlük madde |
| Hatırlatıcılar | `hatirlaticilar.md` | gecikmiş, bugün, "önceden N gün" içinde |
| Günlük | `gunluk/YYYY-MM-DD.md` | akşam 18'den sonra kayıt yok, 3+ gün ara |
| Tekrar | `tekrar/takip.md` + `knowledge/concepts/` | vakti gelen kavram |

Uyarılar kural tabanlıdır, model çağrısı yoktur (token harcamaz). Bildirimler 30 dakikada bir kontrol edilir, aynı uyarı günde bir kez gösterilir.

## Özellik eklemek / çıkarmak

Her özellik `modules/<ad>/` klasörüdür:

```
modules/ornek/
  module.json   { "title": "Örnek", "icon": "★", "order": 50 }
  main.js       module.exports = { api: { yap(ctx, ...args) {} }, alerts(ctx) { return [] } }
  view.js       export async function render(root) { ... }   // renderer/ui.js'ten el, call, toast
```

- `ctx`: `read/write/list/exists`, `today()`, `addDays`, `diffDays` (bkz. `lib/vault.js`).
- `alerts` dizisi `{ id, level: 'due'|'warn'|'info', text, go: '<modül>', notify?: true }` döner; "Bugün" ekranında ve bildirimlerde görünür.
- Kaldırmak: Ayarlar'dan kapat ya da klasörü sil. Uygulamayı yeniden başlat.

## Test

```
node --test test/*.test.js        # modül mantığı, geçici vault ile
electron . --smoke                # başsız: modülleri yükle, uyarıları yaz
electron . --smoke-ui             # ekranları gez, konsol hatası ve ekran görüntüsü (yazar: BEYIN_VAULT'u geçici kopyaya yönelt!)
```
