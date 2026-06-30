# WashApp — Pazarlama & Ürün Stratejisi (MVP & Pazara Giriş)

> **Doküman sahibi:** Pazarlama & Ürün Stratejisi
> **Durum:** LOOP-1 / İlk ajan çıktısı — Veri ve Yazılım ajanları için referans
> **Tarih:** 2026-06-30
> **Kapsam:** MVP kapsamı, segment önceliklendirme, fiyatlandırma, pilot GTM, başarı metrikleri, ürün gereksinimleri

---

## 0. Yönetici Özeti (TL;DR — kararlar)

1. **Pilot bölge: İstanbul Maslak–Levent–4.Levent ekseni** (Sarıyer + Şişli sınırı). Tek mikro-bölge ile başla, kapalı otoparklı plaza yoğunluğu en yüksek nokta.
2. **Birincil persona: "Plaza Mert"** — 34 yaş, beyaz yaka yönetici, Levent'te ofis, kapalı otoparkta park eden premium SUV/sedan sahibi.
3. **MVP'nin tek farklılaştırıcısı güven omurgası:** Fotoğraf doğrulama (öncesi/sonrası) + Escrow MVP'de **must-have**. Mikro-sigorta MVP'de **sözleşmesel fon havuzu** olarak başlar (sigorta poliçesi Faz-2).
4. **Ortalama sepet: 450 TL** (dış+iç standart paket). **Komisyon: %22.** **Müşteri abonelik: 790 TL/ay (2 yıkama), 1.490 TL/ay (4 yıkama).**
5. **İlk 90 gün hedefi: 60 aktif hizmet veren arzı + 1.500 tamamlanmış işlem.** Chicken&egg'i "arz-önce, manuel eşleştirme" ile çöz.
6. **Kuzey Yıldızı Metriği (NSM): Haftalık Tamamlanan & Onaylanan Yıkama Sayısı** (escrow serbest bırakılmış, itirazsız).

---

## 1. Hedef Segment Önceliklendirmesi

### 1.1 Segment skorlama

| Segment | Ödeme gücü | Sıklık | Erişim kolaylığı (mikro-bölge) | Güven hassasiyeti | CAC riski | Öncelik |
|---|---|---|---|---|---|---|
| **B2C — Plaza beyaz yaka (premium araç)** | Yüksek | Orta (2-3/ay) | **Çok yüksek** (kapalı otopark) | Yüksek | Düşük | **P0 — Pilot çekirdeği** |
| **B2B — Plaza/otopark filo & toplu site** | Çok yüksek | Çok yüksek | Yüksek | Orta | Çok düşük | **P0 — Arz dengeleyici** |
| B2C — Lüks segment villa/site sahibi | Çok yüksek | Düşük | Orta (açık otopark, su riski) | Çok yüksek | Orta | P1 — Faz 2 |
| B2C — Orta segment genel kitle | Orta | Düşük | Düşük (dağınık) | Orta | Yüksek | P2 — Ölçeklemede |

**Karar:** Pilotta **yalnızca P0** (Plaza beyaz yaka B2C + Plaza/otopark B2B) hedeflenir. P1/P2 dağınık ve CAC'ı yüksek; mikro-bölge yoğunluğunu bozar.

### 1.2 Neden "kapalı otopark" stratejik?
- **Su/köpük yasağı riskini nötrler:** Kapalı otoparkta su kullanımı zaten yasak → susuz nano-solüsyon zorunluluğu burada **dezavantaj değil tek meşru çözüm**, rakip seyyarcı giremez.
- **Yoğunluk:** Tek bir plaza otoparkında 200-800 araç → hizmet veren bir lokasyonda 4-6 iş tamamlar, "boşta gezme" maliyeti minimuma iner (birim ekonomi can damarı).
- **B2B kapı açıcı:** Plaza yönetimi/otopark işletmesi ile anlaşma = hem talep hem fiziksel erişim hem güven referansı.

---

## 2. Birincil Persona — "Plaza Mert"

| Özellik | Detay |
|---|---|
| **İsim/yaş** | Mert, 34 |
| **Meslek/gelir** | Kıdemli ürün müdürü / fintech; aylık net ~150k TL |
| **Mahalle** | Ofis: Levent (Büyükdere Cad.) — Ev: Etiler/Ataşehir |
| **Araç** | 2-4 yaşında premium: Audi Q5 / BMW 320i / VW Tiguan — kapalı otoparkta park |
| **Davranış** | Haftada 5 gün ofiste, aracı sabah bırakır akşam alır; yıkamaya gitmeye **zamanı yok**, hafta sonunu harcamak istemiyor |
| **Acı noktası** | Yerel oto yıkamaya araç bırakmak = yarım gün kaybı; seyyarcıya güvenmiyor ("çizer, parçamı çalar, kötü yapar") |
| **Tetikleyici** | "Araç otoparkta dururken, ben toplantıdayken yıkansın ve kanıtı bende olsun." |
| **Ödeme isteği** | Premium dış+iç için **400-550 TL**'yi sorun etmez; **abonelik** mantıklı gelir |
| **Güven beklentisi** | Fotoğraf kanıtı + para hizmet bitene kadar bloke + sorun olursa platform arkasında |

**İkincil persona (B2B): "Otopark Yöneticisi Deniz"** — Levent'te 6 plazanın otopark operasyonunu yöneten firma; kiracılarına "katma değerli hizmet" sunmak ve ek gelir paylaşımı istiyor.

---

## 3. MVP Özellik Listesi

### 3.1 Must-have (MVP — Faz 0, ilk 90 gün)

| # | Özellik | Açıklama | Neden must |
|---|---|---|---|
| M1 | **Sipariş oluşturma + araç & lokasyon (kat/park yeri)** | Müşteri araç tipi, paket, otopark/kat/park no, zaman penceresi seçer | Temel işlem |
| M2 | **Hizmet veren eşleştirme (yarı-manuel)** | Pilotta operasyon ekibi/dispatcher de devrede; algoritma + manuel override | Chicken&egg yönetimi |
| M3 | **Fotoğraf doğrulama — ÖNCESİ/SONRASI (uygulama içi kamera)** | Sadece in-app kamera; 4 köşe + jant + iç; GPS + zaman damgası + sunucu imzası | **Farklılaştırıcı #1** |
| M4 | **Escrow — ödeme bloke / onay ile serbest** | Ödeme bloke; müşteri onayı veya 24s otomatik onay penceresi | **Farklılaştırıcı #2** |
| M5 | **Mikro-koruma fonu (sözleşmesel)** | İşlem başı ~15 TL fona; hasar talebinde fondan ödeme, hizmet verene rücu | Sigorta poliçesi öncesi köprü |
| M6 | **İki taraflı puanlama + 4.2 eşik askıya alma** | Müşteri ve hizmet veren puanlar; 4.2 altı otomatik askı | Kalite omurgası |
| M7 | **Hizmet veren onboarding & doğrulama** | Adli sicil + kimlik/ikametgah + ekipman fotoğraf/video + eğitim onayı | Güven & yasal |
| M8 | **İtiraz / hasar bildirim akışı** | Müşteri sonrası fotoğrafla itiraz açar; öncesi/sonrası karşılaştırma paneli | Güven omurgasının operasyonu |
| M9 | **Cüzdan & ödeme (Iyzico/PayTR + bloke)** | Provizyon/escrow destekli ödeme altyapısı | Para akışı |
| M10 | **Abonelik (2/4 yıkama) — basit** | Aylık paket, kalan hak sayacı | Gelir + retention |

### 3.2 Sonraya (Faz 2 — pilot doğrulandıktan sonra)

- AXA/Allianz **gerçek 3. şahıs mali mesuliyet sigortası** poliçesi (fonun yerine).
- Tam otomatik dispatch & rota optimizasyonu (manuel dispatcher'ı kaldır).
- B2B yönetim paneli (filo, toplu fatura, SLA raporu).
- Hizmet veren **premium üyelik** (öncelikli iş, düşük komisyon).
- Dinamik fiyat (yoğunluk/saat), referans programı, ek mahalleler.
- AI fotoğraf farkı tespiti (öncesi/sonrası otomatik çizik karşılaştırma).

### 3.3 Güven omurgasının pazarlama konumlandırması

> **Ana mesaj (slogan adayı):** *"Aracın yıkanırken sen toplantıdasın. Kanıtı cebinde."*

- **Fotoğraf doğrulama →** pazarlamada **"Çizik Kanıt Sistemi"** olarak adlandır. "İddia değil, kanıt" söylemi. Reklam görseli: telefonda öncesi/sonrası fotoğraf + kilit ikonu.
- **Escrow →** **"Paran Güvende Havuzu"** — *"Sen onaylamadan para el değiştirmez."* Müşterinin algıladığı risk → sıfır.
- **Mikro-koruma fonu →** **"WashApp Güvencesi"** — *"Bir şey olursa arkanda biz varız."* (Sigorta dili kullanma; "güvence/koruma" de — yasal-pazarlama uyumu.)
- Üç unsuru tek görselde "3 Kalkan" anlatısıyla ver: **Kanıt — Escrow — Güvence.** Bu, Armut.com ve yerel seyyarcının asla veremediği üçlüdür → pozisyonlama burada kazanılır.

---

## 4. Fiyatlandırma & Birim Ekonomi

### 4.1 Hizmet paketleri (B2C — pilot fiyatları, İstanbul premium)

| Paket | İçerik | Liste Fiyatı (TL) |
|---|---|---|
| Dış Hızlı | Susuz dış yıkama + cam + jant | 280 |
| **Standart (varsayılan)** | Dış + iç vakum + torpido + cam | **450** |
| Premium Detay | Standart + koltuk/döşeme buhar + iç koku | 750 |
| SUV/büyük araç ek | Tüm paketlere | +%15 |

**Ortalama sepet (AOV) varsayımı: 450 TL** (paket dağılımı: %25 hızlı, %55 standart, %20 premium ≈ 451 TL).

### 4.2 Komisyon & gelir kalemleri

| Kalem | Oran/Tutar | Not |
|---|---|---|
| **Sipariş komisyonu** | **%22** | İş planı %20-25 bandının ortası; premiumda kabul edilebilir |
| Mikro-koruma fonu katkısı | 15 TL/işlem (müşteriden) | Gelir değil, fona ayrılır |
| **B2C Abonelik — Başlangıç** | **790 TL/ay** | 2 standart yıkama (liste 900 → ~%12 indirim + öncelik) |
| **B2C Abonelik — Pro** | **1.490 TL/ay** | 4 standart yıkama (liste 1.800 → ~%17 indirim) |
| Hizmet veren premium (Faz 2) | 499 TL/ay | Komisyon %22→%18 + öncelikli iş |

### 4.3 B2B paketleme

| Paket | Hedef | Yapı | Fiyat mantığı |
|---|---|---|---|
| **Plaza Kurumsal** | Otopark/plaza yönetimi | Aylık kontenjan (örn. 100 yıkama) + plazaya **%5-8 gelir paylaşımı** | Erişim + talep karşılığı |
| **Filo** | Şirket araç filosu | Araç başı aylık 690 TL (2 yıkama) toplu fatura | Bireyselden ~%13 indirim, hacim |
| **Çalışana Yan Hak** | Plaza kiracısı şirketler | Kurumsal kod ile çalışana %15 indirim | B2B2C talep pompası |

### 4.4 Birim ekonomi (işlem başı — Standart 450 TL)

```
Brüt sipariş tutarı (GMV)            450,00 TL
+ Müşteriden koruma fonu katkısı      15,00 TL
─────────────────────────────────────────────
Komisyon geliri (%22 × 450)           99,00 TL   ← WashApp net hizmet geliri

Maliyetler (işlem başı):
  Ödeme/escrow komisyonu (~%2.5×465)  -11,63 TL
  Koruma fonu rezervi                 -15,00 TL  (fona; nötr ama nakit ayrılır)
  Dispatch/operasyon dağıtılmış       -12,00 TL  (pilotta manuel ağır)
  Destek/itiraz dağıtılmış             -6,00 TL
─────────────────────────────────────────────
Katkı payı (contribution) ≈        +54,37 TL/işlem  (~%12 GMV)
```

- **Hizmet verenin eline geçen:** 450 − 99 = **351 TL** (1-1.5 saatlik iş). Premium otoparkta günde 4-5 iş → ~1.400-1.750 TL/gün brüt → arz çekiciliği güçlü.
- **CAC hedefi (B2C):** ≤ 180 TL. Geri kazanım: ~3.3 işlem veya 1 abonelik ayı → **2. ayda CAC geri ödenir** (abonelikte daha hızlı).
- **Birim ekonomi sağlığı:** Pozitif katkı payı işlem-1'den itibaren var; pilot zararı operasyon/dispatch sabit maliyetinden gelir (iş planındaki Yıl1 zarar ile tutarlı). Faz-2 otomasyonu dispatch maliyetini düşürerek katkı payını %18-20'ye taşır.

---

## 5. Pilot Bölge & İlk 90 Gün GTM

### 5.1 Pilot bölge seçimi

**Karar: İstanbul — Maslak / Levent / 4.Levent (Büyükdere ekseni) tek mikro-bölge.**

Neden Ankara Çankaya değil: İstanbul Büyükdere ekseni Türkiye'nin en yoğun kapalı-otoparklı plaza koridoru (Sapphire, Metrocity, Kanyon, Özdilek plazaları, banka GM'leri) → tek koridorda binlerce hedef araç, en yüksek SES, en kısa hizmet-veren rota mesafesi. Mikro-bölge yoğunluk tezi en güçlü burada.

**Pilot sınırı:** 5-7 plaza/AVM otoparkı ile başla (anchor lokasyonlar). Tüm arz/talep bu poligona kilitlenir.

### 5.2 Chicken & Egg çözümü — "Arz-önce, yoğunluk-kilitli"

**İlke:** Talep gelmeden önce **garantili arz** kur, sonra dar bir poligonda talebi patlat. Boş arz/boş talep ikilemini "manuel dispatch + lokasyon kilidi + arz garantisi" ile aş.

| Faz | Gün | Arz (hizmet veren) | Talep (müşteri) |
|---|---|---|---|
| **Faz A — Tohumlama** | 1-30 | 10-15 hizmet veren işe al, eğit, doğrula. **Garantili minimum gelir** teklif et (boş zamanı telafi) | Henüz lansman yok; 2-3 plaza ile B2B ön-anlaşma |
| **Faz B — Kontrollü açılış** | 31-60 | 25-40 hizmet verene çıkar; en yoğun plazalara konuşlandır | 3-5 plazada otopark içi stand + lobi standı + QR; ilk yıkama 1 TL kampanyası |
| **Faz C — Yoğunlaşma** | 61-90 | 60 aktif hizmet veren; doluluk %60+ | Plaza şirketlerine "çalışana yan hak", referans programı, abonelik itişi |

**Somut chicken&egg taktikleri:**
1. **Arz garantisi:** İlk 30 gün hizmet verene "günde min. 3 iş yoksa farkı tamamlarız" → arz riski platformda, hizmet veren gelir, doluluk artınca garanti kalkar.
2. **Lokasyon kilidi:** Hizmet vereni bir plazaya "demirle" — gezme süresi sıfır, yan yana araçlar peş peşe yıkanır → arz verimi yüksek, müşteri bekleme süresi kısa.
3. **B2B talep pompası:** Plaza yönetimi ile anlaş → otopark girişinde tabela + lobi standı + kiracı şirketlere kurumsal kod → talep "hazır kanaldan" akar, soğuk CAC harcamazsın.
4. **Manuel dispatcher:** Pilotta otomasyona güvenme; operasyon ekibi eşleştirmeyi elle optimize eder, ilk deneyimi mükemmelleştirir.

### 5.3 İlk 90 gün — kanal & bütçe (özet)

| Kanal | Taktik | Hedef metrik |
|---|---|---|
| Plaza B2B saha | 5-7 plaza yönetimi anlaşması, lobi/otopark standı | Plaza başı 50+ kayıt |
| Otopark içi fiziksel | QR'lı park-yeri kartı + asansör/lobi afişi | %4-6 QR→sipariş |
| Kurumsal kod (B2B2C) | Plaza kiracı şirketlerine çalışan indirimi | 8-10 şirket |
| Dijital (dar coğrafi) | Instagram/LinkedIn coğrafi hedefli (3 km poligon) | CAC ≤ 180 TL |
| Referans | "Davet et, ikiniz de 1 ücretsiz dış yıkama" | K-faktörü ≥ 0.3 |

---

## 6. Başarı Metrikleri

### 6.1 Kuzey Yıldızı Metriği (NSM)

> **Haftalık Tamamlanan & Onaylanan Yıkama Sayısı**
> (Escrow serbest bırakılmış + müşteri itirazı OLMAYAN işlemler)

Neden bu: hem **talep** (sipariş hacmi), hem **arz** (tamamlama kapasitesi), hem **güven omurgası** (itirazsız onay = fotoğraf+escrow çalışıyor) tek metrikte birleşir. Ciro değil "sağlıklı ciro"yu ölçer.

### 6.2 Destekleyici KPI'lar

| KPI | Tanım | 90 gün hedefi |
|---|---|---|
| **Tamamlama oranı** | Tamamlanan / oluşturulan sipariş | ≥ %90 |
| **İtiraz/hasar oranı** | İtiraz açılan / tamamlanan | ≤ %3 (kanıt sistemi caydırır) |
| **Hizmet veren doluluğu** | Aktif saatte tamamlanan iş / kapasite | ≥ %55 |
| **Aktif hizmet veren sayısı** | Haftada ≥ 5 iş yapan | ≥ 60 |
| **Abonelik dönüşümü** | İlk siparişten 30 gün içinde aboneliğe geçen | ≥ %12 |
| **30-gün retention (müşteri)** | İlk işlemden 30 gün içinde tekrar sipariş | ≥ %35 |
| **NPS** | Tamamlanan iş sonrası | ≥ 55 |

**Karşı-metrik (guardrail):** Ortalama "araca varış süresi" ≤ 30 dk; bu bozulursa yoğunluk/dispatch sorunlu demektir.

---

## 7. ÜRÜN GEREKSİNİMLERİ (Veri & Yazılım ajanları için)

> Bu bölüm, sonraki ajanların doğrudan kullanacağı normatif gereksinim listesidir. Her madde **PR-x** ile referanslanabilir.

### 7.1 Aktörler / roller
`MUSTERI`, `HIZMET_VEREN`, `DISPATCHER` (operasyon, pilotta zorunlu), `PLAZA_YONETICI` (B2B), `ADMIN`.

### 7.2 Çekirdek ürün gereksinimleri

| ID | Gereksinim | Öncelik |
|---|---|---|
| PR-1 | Sipariş yaşam döngüsü: `OLUSTURULDU → ESLESTIRILDI → VARILDI → ONCESI_FOTO_OK → YIKAMA → SONRASI_FOTO_OK → MUSTERI_ONAY/24S_AUTO → TAMAMLANDI / ITIRAZ` durum makinesi | P0 |
| PR-2 | **In-app kamera zorunluluğu:** fotoğraf yalnızca uygulama içi çekilebilir; galeri yüklemesi YASAK. Min. 6 açı (4 köşe + jant + iç) öncesi ve sonrası | P0 |
| PR-3 | Her fotoğrafta **metadata:** GPS koordinatı, sunucu zaman damgası, sipariş ID, hizmet veren ID; sunucu tarafı **imza/hash** ile değişmezlik (immutability) | P0 |
| PR-4 | Fotoğraf depolama: şifreli bulut (private bucket), istemci erişimi imzalı geçici URL ile; saklama süresi ≥ 1 yıl (itiraz/hukuki) | P0 |
| PR-5 | **Escrow akışı:** ödeme provizyon/bloke; serbest bırakma tetikleyici = müşteri onayı VEYA `onay_penceresi=24s` dolması; itiraz açıkken serbest bırakma DURUR | P0 |
| PR-6 | Ödeme entegrasyonu: Iyzico/PayTR provizyon+capture (escrow uyumlu); cüzdan bakiyesi (hizmet veren), payout akışı | P0 |
| PR-7 | **Mikro-koruma fonu defteri:** işlem başı 15 TL fona kayıt; hasar ödeme & hizmet verene rücu kayıtları; fon bakiyesi raporu | P0 |
| PR-8 | İki taraflı puanlama; hizmet veren ortalaması < 4.2 → otomatik `ASKIDA` durumu + admin bildirimi | P0 |
| PR-9 | Onboarding doğrulama: kimlik/ikametgah, adli sicil belgesi yükleme & onay durumu, ekipman foto/video, eğitim tamamlandı flag'i; hepsi OK olmadan iş alamaz | P0 |
| PR-10 | İtiraz akışı: müşteri itiraz açar → öncesi/sonrası fotoğraf yan-yana karşılaştırma paneli (dispatcher/admin) → karar (`HIZMET_VEREN_KUSURLU` / `MUSTERI_REDDEDILDI` / `PLATFORM_KARSILAR`) | P0 |
| PR-11 | **Yarı-manuel dispatch:** algoritmik öneri + dispatcher manuel override; hizmet veren–plaza "demirleme" (lokasyon kilidi) desteği | P0 |
| PR-12 | Abonelik: 2/4 yıkama paketleri, kalan hak sayacı, otomatik yenileme, hak düşümü siparişe bağlı | P0 |
| PR-13 | B2B: plaza/şirket hesabı, kurumsal indirim kodu, toplu fatura, gelir-paylaşım raporu (plazaya %5-8) | P1 |
| PR-14 | Coğrafi kısıt (geofencing): pilot poligonu dışında sipariş oluşturulamaz (mikro-bölge kilidi) | P0 |
| PR-15 | Bildirimler: push/SMS — varış, öncesi-foto, tamamlandı, onay-penceresi-uyarısı | P1 |

### 7.3 Veri ajanı için ölçüm gereksinimleri (event taxonomy)

Aşağıdaki olaylar **mutlaka** loglanmalı (NSM ve KPI'ların kaynağı):

```
order_created            { order_id, customer_id, package, plaza_id, vehicle_type, ts }
order_matched            { order_id, provider_id, dispatch_mode(auto|manual), ts }
provider_arrived         { order_id, provider_id, gps, ts }     // varış süresi KPI
before_photos_submitted  { order_id, photo_count, all_angles_ok, ts }
wash_completed           { order_id, ts }
after_photos_submitted   { order_id, photo_count, all_angles_ok, ts }
escrow_held              { order_id, amount, fund_contrib, ts }
order_confirmed          { order_id, confirm_type(customer|auto_24h), ts }   // NSM çekirdeği
escrow_released          { order_id, provider_payout, ts }
dispute_opened           { order_id, reason, ts }               // itiraz oranı
dispute_resolved         { order_id, outcome, ts }
provider_rating          { order_id, provider_id, score, ts }
provider_suspended       { provider_id, avg_score, ts }         // 4.2 eşik
subscription_started     { customer_id, plan(2|4), ts }
subscription_consumed    { customer_id, order_id, remaining, ts }
```

> **NSM hesap formülü (veri ajanı):**
> `NSM (hafta) = COUNT(order_confirmed WHERE dispute_opened IS NULL within window)`
> İtiraz oranı = `dispute_opened / wash_completed`. Bu ikisi panoda yan yana izlenmeli.

### 7.4 Açık varsayımlar (doğrulanmalı)
- Ödeme sağlayıcısının (Iyzico/PayTR) **gerçek escrow/24s gecikmeli capture** desteği teknik teyit gerektirir → yazılım ajanı doğrulamalı; yoksa "provizyon + manuel capture" fallback'i.
- Mikro-koruma **fonu** mu yoksa Faz-1'de bile **sigorta poliçesi** mi → hukuki/finansal teyit (pazarlamada "sigorta" demeyeceğiz, "güvence").
- Adli sicil belgesi toplama & saklama → KVKK uyumu (veri ajanı + hukuk).

---

## 8. Bir Sonraki Ajana Devir Notları

- **Veri ajanı:** §7.3 event taxonomy'sini ve §6 KPI tanımlarını veri modeli/dashboard tasarımına temel al. NSM = itirazsız onaylı yıkama. Birim ekonomi tablosu (§4.4) finansal model için girdi.
- **Yazılım ajanı:** §3.1 must-have listesi + §7.2 PR-1..PR-15 doğrudan backlog. Durum makinesi (PR-1), in-app kamera+metadata (PR-2/3/4), escrow (PR-5/6), dispatch yarı-manuel (PR-11), geofence (PR-14) **kritik yol**. PR-5 ödeme escrow teknik teyidi acil.
- **Fiyat/komisyon sabitleri:** AOV 450 TL, komisyon %22, fon 15 TL, abonelik 790/1.490 TL — koda config olarak parametrik girilmeli.
