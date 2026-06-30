# WashApp — Hukuk & Regülasyon Çerçevesi (Türkiye)

> **Belge No:** 04 · **Kapsam:** Hukuki risk denetimi + sözleşme/politika seti + 3 kritik blokör
> **Sabit stack (değiştirilemez):** React Native (Müşteri + Hizmet Veren app) · FastAPI @ Render.com · Supabase (Postgres + Auth + Storage + PostGIS + RLS) · Iyzico/PayTR (lisanslı PSP — kendi lisansımız YOK)
> **Önceki devirlerle tutarlılık:** 01-pazarlama (3 Kalkan, AOV 450, komisyon %22, koruma fonu 15 TL), 02-veri-mimarisi (evidence-kyc bucket, KVKK retention cron, audit izi), 03-yazilim (mobil para/yazma asla doğrudan Supabase'e değil)

> **UYARI / DISCLAIMER:** Bu belge mühendislik ve iş kurulumu için hazırlanmış **iç hukuki risk haritasıdır**, avukat görüşü (legal opinion) değildir. §13'teki üç blokör hayata geçmeden önce **KVKK + ödeme hukuku + sigorta** branşlarında bir hukuk bürosundan yazılı görüş alınması ZORUNLUDUR. Aşağıdaki tüm tutarlar ve süreler **karar önerisidir**, danışman teyidiyle kesinleşir.

---

## 0. Yönetici Özeti — "Kıçımızı Kurtaracak" 3 Şart

WashApp üç regüle alanın kesişiminde duruyor: **(1) kişisel veri** (fotoğraf+GPS+kimlik+adli sicil), **(2) para emaneti/escrow** (6493 sayılı Kanun), **(3) hasar/sorumluluk** (mikro-sigorta + tüketici hukuku). Bunların hiçbiri "sonra hallederiz" değildir; her biri MVP'yi yasal olmaktan çıkarabilecek **kapatma riski** taşır.

| # | Blokör | Risk seviyesi | Tek cümlelik çözüm |
|---|--------|---------------|---------------------|
| B1 | **Escrow'u kendimiz tutarsak 6493 ihlali** | 🔴 KAPATMA | Parayı ASLA WashApp banka hesabında tutmayız; emanet PSP'nin (Iyzico **Pazaryeri/Alt Üye İşyeri** ürünü) bilançosunda durur, biz sadece tetikleriz |
| B2 | **KVKK — özel nitelikli veri + yurt dışına aktarım (Supabase)** | 🔴 KAPATMA | Adli sicil + biyometrik benzeri kanıt fotoğrafları için **açık rıza + Türkiye region** + aktarım güvencesi; Supabase EU region tek başına yetmez |
| B3 | **"Sigorta fonu" lisanssız sigortacılık + hizmet veren SGK/işçi sayılma** | 🟠 YÜKSEK | Fona "sigorta" DEMEYİZ ("güvence/koruma fonu"); gerçek poliçe AXA/Allianz'dan alınır; hizmet veren **bağımsız yüklenici** sözleşmesiyle net ayrıştırılır |

Detaylar §13'te. Önce mevzuat denetimi (§1–§12).

---

## 1. Mevzuat Haritası — WashApp'i Bağlayan Düzenlemeler

| Alan | Mevzuat | WashApp'e etkisi |
|------|---------|------------------|
| Kişisel veri | **6698 KVKK** + ikincil yönetmelikler, Aydınlatma Tebliği, Yurt Dışı Aktarım Yönetmeliği (2024) | Fotoğraf, GPS, kimlik, adli sicil, ödeme verisi — hepsi kapsamda; Supabase yurt dışıysa aktarım rejimi |
| E-ticaret / pazaryeri | **6563 Elektronik Ticaret Kanunu** + 2022/2023 ETK değişiklikleri ("aracı hizmet sağlayıcı" yükümlülükleri) + ETBİS kaydı | WashApp = **aracı hizmet sağlayıcı**; hizmet veren = **hizmet sağlayıcı**; sorumluluk sınırı buradan |
| Ödeme / escrow | **6493 sayılı Ödeme ve Menkul Kıymet Mutabakat Sistemleri, Ödeme Hizmetleri ve Elektronik Para Kuruluşları Hakkında Kanun** | Para emaneti = ödeme hizmeti; lisans bizde yok → PSP üzerinden kurgu zorunlu |
| Sigorta | **5684 Sigortacılık Kanunu** + Sigorta Acenteleri Yönetmeliği | "Risk havuzu / prim toplama" = sigortacılık faaliyeti; lisanssız yapılamaz |
| Tüketici | **6502 Tüketici Korumasının Hakkında Kanun** + Mesafeli Sözleşmeler Yönetmeliği | Müşteri = tüketici; mesafeli sözleşme, cayma, ayıplı hizmet, iade |
| İş / SGK | **4857 İş Kanunu**, **5510 SGK**, **6098 TBK eser/vekalet** | Hizmet verenin statüsü: işçi mi, bağımsız yüklenici mi → SGK riski |
| Adli sicil | **5352 Adli Sicil Kanunu** + KVKK m.6 (ceza mahkumiyeti = özel nitelikli) | Adli sicil belgesini **kişinin kendisinden** isteyebiliriz; saklama sınırlı |
| Vergi / e-belge | VUK, e-Arşiv/e-Fatura, **GİB Anlık Bildirim** (pazaryeri komisyon bildirimi) | Komisyon faturası + hizmet verenin gelir vergisi/belge düzeni |
| Çevre / belediye | İSKİ/Büyükşehir su deşarjı, atık su yönetmelikleri | **Susuz/nano-solüsyon zorunluluğu** (01-pazarlama M-bölge kararı) hukuki temele oturur |

---

## 2. KVKK — Veri Envanteri ve İşleme Esasları

### 2.1 Veri Envanteri (VERBİS kaydı için temel)

WashApp'in işlediği veriler, KVKK hassasiyet sınıfıyla:

| Veri | Kim | Tür | Hukuki Sebep (KVKK m.5/6) | Saklama (öneri) |
|------|-----|-----|---------------------------|------------------|
| Ad-soyad, telefon, e-posta | Müşteri & Hizmet veren | Genel | Sözleşmenin ifası (m.5/2-c) | İlişki + 10 yıl (TBK zamanaşımı) |
| Konum (GPS, canlı) | Her ikisi | Genel (ama hassas niteliğe yakın) | Sözleşmenin ifası + meşru menfaat | İş bitince anonimleştir; ham iz 90 gün |
| **Araç fotoğrafı (öncesi/sonrası)** | Müşteri aracı | Genel + delil | **Sözleşmenin ifası + meşru menfaat (delil)** | **İtiraz penceresi + 1 yıl** (02-veri §6 ile uyumlu) |
| Plaka | Müşteri | Genel/kişisel | Sözleşmenin ifası | Fotoğrafla aynı |
| **Kimlik/ikametgah belgesi** | Hizmet veren | Genel (TC kimlik no hassas işlem) | Yasal yükümlülük + sözleşme | İlişki süresi + yasal saklama |
| **Adli sicil belgesi** | Hizmet veren | 🔴 **ÖZEL NİTELİKLİ** (m.6 — ceza mahkumiyeti) | **AÇIK RIZA + meşru menfaat (güvenlik)** | **Onay anında karar, belge SAKLANMAZ** (§5) |
| Ödeme verisi (kart token, IBAN) | Müşteri & Hizmet veren | Genel (PCI kapsamı) | Sözleşmenin ifası | **Kart verisi bizde YOK** — PSP token'lar |
| Puan/şikayet/itiraz | Her ikisi | Genel | Meşru menfaat | İlişki + 2 yıl |

> **Karar (KVKK-1):** Kart verisi (PAN, CVV) WashApp sistemine **hiç girmez**; Iyzico/PayTR hosted ödeme alanı (iframe/3DS) kullanılır → **PCI-DSS kapsamı dışı kalırız**. Bu hem PCI yükü hem KVKK ihlal yüzeyini ciddi düşürür. 03-yazilim §3.3 ile uyumlu (mobil para verisine dokunmaz).

### 2.2 Açık Rıza vs. Diğer Hukuki Sebepler — Kritik Ayrım

KVKK'da en sık yapılan hata her şeyi "açık rıza"ya bağlamaktır. **Açık rıza geri alınabilir** — geri alınınca veriyi işleyemezsiniz. Bu yüzden:

- **Sözleşmenin ifası için ZORUNLU veriler** (fotoğraf kanıtı, konum, ödeme) → **açık rızaya bağlanmaz**, "sözleşmenin ifası" (m.5/2-c) sebebine dayanır. Müşteri rızasını geri alamaz çünkü hizmetin özü budur.
- **Adli sicil (özel nitelikli)** → KVKK m.6 gereği **açık rıza ZORUNLU** (veya kanunla öngörülme — bizde yok). Hizmet veren rızayı geri alırsa → platformdan çıkar (mantıklı).
- **Pazarlama/bildirim (İYS)** → ayrı, açık rıza + İleti Yönetim Sistemi kaydı ( icrm-api projesindeki IYS ile aynı rejim).

> **Karar (KVKK-2):** Onay ekranında **katmanlı (granular) rıza** — tek "kabul ediyorum" kutusu DEĞİL: (a) sözleşme/aydınlatma onayı [zorunlu], (b) adli sicil işleme açık rızası [hizmet veren, zorunlu], (c) ticari ileti/İYS rızası [opsiyonel, ayrı kutu]. `02-veri-mimarisi` `kvkk_onay_ts` kolonuna **rıza tipi + versiyon + IP + timestamp** yazılır (kanıtlanabilir rıza).

### 2.3 Aydınlatma Metni — Zorunlu Unsurlar

İki ayrı aydınlatma metni gerekir (veri sorumlusu = WashApp tüzel kişiliği):
1. **Müşteri Aydınlatma Metni** — fotoğraf/konum/ödeme odaklı.
2. **Hizmet Veren Aydınlatma Metni** — kimlik/adli sicil/konum/puanlama odaklı.

Her ikisinde m.10 zorunlu unsurlar: veri sorumlusu kimliği, işleme amaçları, aktarılan taraflar (PSP, Supabase/yurt dışı, sigortacı, hukuk), toplama yöntemi/sebebi, m.11 hakları. **App'te kayıt anında, kaydırılabilir tam metin + onay timestamp.**

### 2.4 VERBİS Kaydı

WashApp tüzel kişiliği belirli eşikleri aştığında (yıllık çalışan/ciro veya özel nitelikli veri işleme) **VERBİS'e kayıt zorunlu**. **Adli sicil + biyometriye yakın araç içi/kimlik fotoğrafı işlediğimiz için, çalışan sayısı düşük olsa bile özel nitelikli veri işleyen olarak kayıt yükümlülüğü doğması yüksek olasılık** → danışman teyidiyle **şirket kuruluşundan hemen sonra VERBİS başvurusu** yapılır.

---

## 3. KVKK — Yurt Dışına Veri Aktarımı (Supabase) — 🔴 KRİTİK

Bu, mimarinin en sinsi hukuki riskidir. **Supabase = yurt dışı (genelde AWS, EU/US region).** KVKK m.9 yurt dışı aktarımı sıkı düzenler; 2024 yönetmelik değişikliği rejimi yenilemiştir (yeterli koruma + uygun güvenceler + arızi haller / SCC benzeri standart sözleşme).

### 3.1 Sorun

- Araç fotoğrafları + adli sicil + kimlik belgeleri + GPS = bunların Supabase Storage/Postgres'te **fiziksel olarak yurt dışı sunucuda** durması = **yurt dışına veri aktarımı**.
- Özel nitelikli veri (adli sicil) yurt dışına aktarımı en hassas senaryodur.

### 3.2 Karar Matrisi

| Seçenek | KVKK durumu | WashApp kararı |
|---------|-------------|----------------|
| Supabase **EU (Frankfurt) region** + açık rıza/standart sözleşme | Aktarım var, güvenceyle meşru | ⚠️ Yeterli değil tek başına — özel nitelikli veri için risk |
| **Hassas verileri (adli sicil, kimlik belge) Supabase'e HİÇ koymama** | Aktarım yüzeyi daralır | ✅ **TERCİH** |
| Supabase self-hosted **Türkiye'de** (Render TR yok → ayrı VPS/yerli bulut) | Aktarım yok, lokalizasyon | Faz-2 ölçek kararı |

> **Karar (KVKK-3 — mimari etkili):** **İki katmanlı veri lokalizasyonu:**
> - **Katman A — Yurt dışı OK (Supabase EU/Frankfurt):** Sipariş, durum makinesi, araç fotoğrafı kanıtı, konum, ledger. Bunlar için **açık rıza + KVKK standart sözleşme/uygun güvence** + aydınlatmada "yurt dışına aktarım" açıkça belirtilir. (02-veri §evidence bucket bu katmanda.)
> - **Katman B — Yurt dışına ASLA çıkmaz (özel nitelikli):** **Adli sicil belgesi ve kimlik fotokopisi Supabase Storage'a yüklenmez.** Bunun yerine: belge **kişinin kendi e-Devlet çıktısı** olarak **doğrulama anında operatöre gösterilir → "doğrulandı" boolean'ı + doğrulama tarihi + doğrulayan operatör** kaydedilir, **belgenin kendisi saklanmaz** (§5). Saklamak zorunlu olunan asgari KYC verisi için **Türkiye'de barındırılan ayrı bir KVKK-uyumlu KYC sağlayıcı** (ör. yerli e-imza/KYC servisi) değerlendirilir.

> **Mühendislik handoff:** 02-veri-mimarisi'ndeki `evidence-kyc` private bucket'ın **adli sicil için kalıcı dosya saklamaması** gerekir. Bucket'ı "kimlik doğrulama anlık görüntüsü, max 7 gün, doğrulama sonrası otomatik silme" politikasına çek. KVKK retention cron (03-yazilim §cron-e) bu bucket için **gün bazlı** çalışsın.

> **Mühendislik handoff:** Supabase projesi **Frankfurt (eu-central-1) region**'da açılır (US değil). Render web service de **Frankfurt** bölgesinde host edilir (gecikme + aktarım minimizasyonu).

---

## 4. Ödeme / Escrow — 6493 Sayılı Kanun — 🔴 KRİTİK

### 4.1 Sorun: "Güvenli Havuz" = Ödeme Hizmeti mi?

Müşteri öder → para bloke → 24s/onay sonra hizmet verene aktarılır. **Eğer bu para WashApp'in kendi banka hesabına girip orada tutulur ve sonra dağıtılırsa**, bu **6493 m.12 anlamında "ödeme hizmeti" / "fon transferi" / fiilen elektronik para** faaliyetidir. **Bunun için BDDK/TCMB lisansı gerekir. Bizde YOK. Lisanssız yapmak suçtur ve kapatma + idari para cezası getirir.**

### 4.2 Çözüm: Parayı Hiç Elimize Almayız — PSP Pazaryeri Modeli

> **Karar (PAY-1):** WashApp **hiçbir aşamada** müşterinin parasını kendi hesabında **tutmaz**. Escrow, **lisanslı PSP'nin (Iyzico veya PayTR) pazaryeri / alt üye işyeri (marketplace / submerchant) ürünü** üzerinden kurgulanır. Para PSP'nin emanet/havuz hesabında durur; biz yalnızca **"şu siparişin parasını şu alt üye işyerine (hizmet verene) çöz/iade et"** komutunu tetikleriz.

| Akış | Kim tutar | WashApp'in rolü |
|------|-----------|------------------|
| Müşteri öder | PSP havuz hesabı (Iyzico) | Sadece sipariş+tutar bildirir |
| Para bloke (escrow) | PSP (provizyon/auth — capture edilmemiş) | Durum makinesi tetikler |
| Onay/24s → çözülme | PSP, alt üye işyerine (hizmet veren) öder + komisyonu WashApp'e ayırır | Capture + split komutu |
| İtiraz → iade | PSP iade eder | İade komutu |

> **Bu modelin hukuki güzelliği:** Para akışı baştan sona **lisanslı kuruluşun bilançosunda** kalır. WashApp yalnızca **komisyon gelirini** (alt üye işyeri olarak kendisi) tahsil eder. 6493 yükümlülüğü PSP'nin üzerindedir.

> **Karar (PAY-2 — sözleşme):** Iyzico ile **Pazaryeri/Marketplace sözleşmesi** imzalanır; her hizmet veren PSP nezdinde **alt üye işyeri (submerchant)** olarak tanımlanır (IBAN + vergi/TC bilgisi PSP'ye gider). Hizmet verenden **PSP submerchant başvuru/sözleşme onayı** onboarding'in zorunlu adımıdır (01-pazarlama PR-9'a ek madde).

> **Mühendislik handoff (önceki devirlerle açık riski kapatır):** 01/02/03-devirlerinde "Iyzico gerçek 24s gecikmeli capture destekliyor mu?" sorusu **açık** bırakılmıştı. **Hukuki cevap:** gerçek capture-gecikmesi olmasa bile **provizyon (auth, capture edilmemiş para PSP'de bloke) + onayda capture/split** modeli 6493 açısından **yeterli ve tercih edilen** yapıdır — çünkü para zaten bizim hesabımıza hiç girmez. Provizyon ömrü (7-30 gün) 24s'i kapsar (02-veri §4.2 / 03-yazilim §3.3 fallback'i = nihai model). **Yazılım ajanı Iyzico submerchant + split payment + provizyon süresini sözleşmede teyit etsin.**

### 4.3 KOMİSYON FATURASI ve Vergi

- WashApp, hizmet verene kestiği **%22 komisyon için e-Arşiv/e-Fatura** düzenler (B2B).
- Hizmet veren, müşteriye **kendi adına** hizmet faturası/belgesi düzenlemekle yükümlü (esnaf/şahıs/şirket statüsüne göre). Platform bunu **kolaylaştırır** ama hizmet verenin vergi yükümlülüğü kendisine aittir — sözleşmede net yazılır.
- **GİB pazaryeri anlık bildirim** yükümlülüğü (komisyon/ödeme bilgisi GİB'e) doğabilir → danışman teyidi.

---

## 5. Adli Sicil — İsteyebilir miyiz, Saklayabilir miyiz?

### 5.1 Hukuki Durum

- Adli sicil kaydı **özel nitelikli kişisel veridir** (KVKK m.6 — ceza mahkumiyeti).
- WashApp adli sicili **doğrudan resmi mercilerden ALAMAZ** (yetkisi yok). Ancak **kişinin kendisinden, kendi e-Devlet çıktısını ibraz etmesini** şart koşabilir. Bu, iş güvenliği/güven omurgası için **meşru bir filtreleme** sebebidir (özellikle müşteri aracına/evine erişen, fiziksel temaslı hizmet).
- İşleme için **açık rıza** alınır (m.6/2). Rıza vermeyen → platforma kabul edilmez (hizmetin doğası gereği meşru).

### 5.2 Karar: Sakla DEĞİL, Doğrula-ve-At

> **Karar (ADLI-1):** Adli sicil belgesi **kalıcı saklanmaz.** Onboarding'de operatör belgeyi **görür → "temiz/uygun" kararını verir →** sisteme yalnızca **`adli_sicil_dogrulandi=true` + `dogrulama_tarihi` + `dogrulayan_operator_id`** yazılır. **Belge dosyası doğrulamadan sonra ≤7 gün içinde silinir** (audit logu kalır, belge kalmaz). Bu, KVKK "amaçla sınırlılık + saklama süresinin asgari olması" ilkesine en uygun, dava riskini en aza indiren yaklaşımdır.
>
> İstisna: Belirli süreli **yeniden doğrulama** (ör. 12 ayda bir) gerekiyorsa, her seferinde aynı doğrula-ve-at döngüsü uygulanır.

> **Mühendislik handoff:** Bu, 02-veri-mimarisi `evidence-kyc` bucket retention politikasını değiştirir: adli sicil için **kalıcı değil, 7 günlük geçici** saklama. KVKK retention cron buna göre ayarlanır.

---

## 6. Sigorta / Mikro-Sigorta Fonu — 5684 Sayılı Kanun — 🟠 YÜKSEK

### 6.1 Sorun: 15 TL "Fon" = Lisanssız Sigortacılık mı?

İşlem başına 15 TL toplayıp bir havuzda biriktirip "hasarda bu havuzdan öderiz" demek, **prim toplayıp risk üstlenmek** = **sigortacılık faaliyeti** olarak yorumlanabilir. **Sigortacılık 5684 gereği lisans (Hazine/SEDDK izni) ister. WashApp sigorta şirketi değildir → "sigorta" yapamaz.**

### 6.2 Karar: İki Aşamalı, "Sigorta" Demeden

> **Karar (SIG-1 — MVP/Faz-1):** 15 TL'lik havuz **"sigorta" değil, sözleşmesel "Müşteri Memnuniyeti / Hasar Tazmin Garanti Fonu"** olarak konumlanır. Hukuki nitelik: **WashApp'in kendi sözleşmesel taahhüdü** (kullanıcı sözleşmesinde "platform, kusur halinde X TL'ye kadar tazmin eder" maddesi). Bu **sigorta değil, ticari garantidir** — prim/poliçe/risk havuzu dili **kullanılmaz**. Pazarlamada "güvence/koruma" denir, "sigorta" denmez (01-pazarlama kararıyla birebir).
>
> - Tazmin tavanı **net belirlenir** (ör. işlem başına maks. tazmin = AOV'nin 10 katı veya sabit bir tavan, danışman teyidiyle).
> - 15 TL **müşteriden değil, platformun gelir/gider modelinden** ayrılan bir **karşılık** olarak da kurgulanabilir — "müşteriden prim topluyoruz" görüntüsünden kaçınmak için tercih edilir.

> **Karar (SIG-2 — Faz-2, zorunlu geçiş):** Hacim büyüdükçe (tazmin riski artınca) **gerçek 3. şahıs mali mesuliyet / mesleki sorumluluk sigortası** AXA/Allianz/yerli sigortacıdan alınır. WashApp **sigorta acentesi** olarak değil, **sigorta ettiren / grup poliçesi sahibi** olarak hareket eder (her hizmet veren işlemini kapsayan grup poliçesi). Bu noktada gerçek sigortacı riski üstlenir, WashApp lisans gerektirmez.

> **Neden AXA/Allianz partnerliği zorunlu:** Hacim arttığında "kendi fonumuzla öderiz" hem **sermaye riski** (büyük hasarda fon yetmez) hem **5684 lisanssız sigortacılık riski** taşır. Gerçek sigortacı = riski dışarı atar + lisans sorununu çözer.

### 6.3 Rücu

Her iki modelde de: tazmin → **hizmet verene rücu.** Bağımsız yüklenici sözleşmesinde "kusurdan doğan zarar hizmet verene aittir, platform öderse rücu eder" maddesi + hizmet verenin cüzdan/teminatından mahsup hakkı.

---

## 7. Hizmet Veren Statüsü — İşçi mi, Bağımsız Yüklenici mi? — 🟠 YÜKSEK

### 7.1 Sorun: SGK / İş Mahkemesi Riski

Gig-ekonomi platformlarının en büyük gizli yükümlülüğü: hizmet veren **işçi sayılırsa** → geriye dönük SGK primi, kıdem/ihbar, fazla mesai, iş kazası sorumluluğu. Türk iş yargısı **"bağımlılık unsuru"na** bakar (talimat, denetim, çalışma saati dayatması, münhasırlık, ekonomik bağımlılık).

### 7.2 Karar: Bağımsız Yüklenici (TBK Eser/Vekalet) — Bağımlılığı Kır

> **Karar (STAT-1):** Hizmet veren = **bağımsız yüklenici (6098 TBK kapsamında eser/hizmet sözleşmesi)**, WashApp'in işçisi DEĞİL. Bunu **fiilen** desteklemek için (sadece sözleşmede yazmak yetmez, yargı fiili duruma bakar):

| Bağımlılık göstergesi (KAÇIN) | WashApp uygulaması |
|-------------------------------|--------------------|
| Çalışma saati dayatması | Hizmet veren **işi reddedebilir**, kendi saatini seçer (01-pazarlama "günde min 3 iş garantisi" = **teşvik**, zorunluluk değil — dikkat!) |
| Münhasırlık | Hizmet veren **başka platformda da** çalışabilir (sözleşmede münhasırlık YOK) |
| Ekipman platformdan | Ekipman **hizmet verenin kendisinin** (susuz makine onun yatırımı) — teşvikli kredi olabilir ama mülkiyet onda |
| Sabit ücret/maaş | **İş başına komisyon**, maaş yok |
| Üniforma/kimlik dayatması | Marka kullanımı **lisans/izin**, iş emri değil |

> **DİKKAT (STAT-2 — devir notuyla gerilim):** 01-pazarlama'daki **"hizmet verene günde min. 3 iş garantisi"** ve **dispatcher override** ile iş atama, **bağımlılık karinesi yaratabilir** (platform iş dağıtıyor + gelir garantisi = işveren görüntüsü). **Çözüm:** "garanti" yerine **"min. iş hacmi olan bölgeye demirleme + reddetme hakkı saklı arz teşviki"** olarak kurgula; dispatcher **öneri** sunar, hizmet veren **kabul/ret** eder. Sözleşme + ürün akışı bu reddetme hakkını **gerçek** kılmalı.

> **Karar (STAT-3):** Hizmet verenin **kendi vergi mükellefiyeti** (esnaf/şahıs şirketi/şirket) zorunlu tutulur veya **belirli bir aylık eşiğin altındaysa "diğer kazanç" beyanı** bilgilendirmesi yapılır. Platform SGK/vergi yükümlüsü **değildir**; bu hizmet verenin sorumluluğudur (sözleşmede net). Bu, gelecekte gig-çalışan düzenlemesi gelirse (AB benzeri) yeniden değerlendirilir.

---

## 8. E-Ticaret / Aracı Hizmet Sağlayıcı Sorumluluğu — 6563 ETK

### 8.1 WashApp = Aracı Hizmet Sağlayıcı (AHS)

6563 ve değişiklikleriyle WashApp, başkalarının (hizmet verenlerin) hizmetini sunduğu bir **aracı hizmet sağlayıcıdır**. Bu, sorumluluğu **sınırlama imkanı** verir ama **bazı yükümlülükler** yükler:

| Yükümlülük | WashApp aksiyonu |
|------------|------------------|
| **ETBİS kaydı** | Faaliyete başlamadan ETBİS'e kayıt zorunlu |
| Hizmet sağlayıcı bilgilerini erişilebilir tutma | Her hizmet verenin doğrulanmış kimlik/iletişim bilgisi platformda |
| İçerik/ilan sorumluluğu sınırı | WashApp hizmeti bizzat sunmaz → kusurdan **birincil sorumlu hizmet verendir**; AHS sınırlı sorumluluk |
| Şikayet mekanizması | İtiraz/şikayet akışı (zaten escrow+dispute var) |
| Mesafeli sözleşme bilgilendirmesi | §9 |

> **Karar (ETK-1):** Kullanıcı sözleşmesinde WashApp'in rolü **net "aracı platform"** olarak tanımlanır: "Yıkama hizmetini WashApp DEĞİL, bağımsız hizmet veren sunar. WashApp eşleştirme, ödeme aracılığı ve güven altyapısı sağlar." Bu, hizmet kusurundan birincil sorumluluğu hizmet verene yıkar — **ANCAK** güven omurgası vaadimiz (fotoğraf kanıtı + garanti fonu) nedeniyle WashApp **gönüllü olarak ikincil/garanti sorumluluğu** üstlenir (bu pazarlama farkı; hukuken tazmin tavanıyla sınırlandırılır — §6).

---

## 9. Tüketici Hukuku — Mesafeli Sözleşme, Cayma, İade

### 9.1 Mesafeli Sözleşme

Müşteri uygulamadan sipariş = **mesafeli sözleşme** (6502 + Yönetmelik). Sipariş öncesi **ön bilgilendirme** zorunlu: hizmet niteliği, toplam fiyat (vergiler dahil), hizmet veren bilgisi, cayma hakkı durumu, şikayet yolu.

### 9.2 Cayma Hakkı — Kritik İstisna

> **Karar (TUK-1):** Genel kural 14 gün cayma hakkıdır; **ANCAK** Mesafeli Sözleşmeler Yönetmeliği, **tüketicinin onayıyla ifasına başlanan ve tamamlanan hizmetlerde cayma hakkını ortadan kaldırır.** WashApp akışı:
> - Sipariş anında müşteri **"hizmetin hemen ifasını onaylıyorum, ifa tamamlanınca cayma hakkım sona erer"** kutusunu işaretler (ön bilgilendirmeyle).
> - Yıkama tamamlandıktan sonra cayma yok; **ama itiraz/ayıplı hizmet hakkı saklı** (escrow 24s + dispute bunu zaten karşılıyor).
> - İfaya başlanmadan (hizmet veren varmadan) iptal → **tam iade** (provizyon serbest, capture yok).

### 9.3 Ayıplı Hizmet & Araç Hasarı

> **Karar (TUK-2):** "Aracım çizildi/hasar gördü" = **ayıplı hizmet + haksız fiil.** Çözüm akışı:
> 1. **Öncesi/sonrası fotoğraf kanıtı** (TikTak modeli) objektif delil → çoğu iddiayı en başta çözer (platform farkı).
> 2. Gerçek hasar varsa → **garanti fonu/sigortadan tazmin** (§6) → **hizmet verene rücu.**
> 3. Müşteri tazminle yetinmezse → genel mahkeme/Tüketici Hakem Heyeti yolu açık (sözleşme bunu engelleyemez, tüketici lehine emredici hüküm).

> **Karar (TUK-3 — delil değeri):** Fotoğraf kanıtının mahkemede **delil değeri** için, 02-veri-mimarisi'ndeki **SHA-256 hash + sunucu imzası + append-only + GPS/zaman damgası** zinciri kritik. Sözleşmeye **"tarafların bu fotoğraf kanıtını münhasır ve bağlayıcı delil olarak kabul ettiği"** (HMK m.193 delil sözleşmesi) maddesi konur → uyuşmazlıkta fotoğraf esas alınır.

---

## 10. Çevre / Belediye — Susuz Yıkama Zorunluluğu

> **Karar (CEV-1):** Sokakta/otoparkta sulu yıkama, su deşarjı + atık su + belediye zabıtası riski taşır (köpük/su yasağı). 01-pazarlama'daki **susuz nano-solüsyon / mobil vakumlu buharlı sistem zorunluluğu** burada **hukuki dayanak kazanır**: hizmet veren sözleşmesinde **"yalnızca susuz/onaylı solüsyon, su deşarjı yasak"** maddesi + ekipman doğrulaması (onboarding). Atık solüsyon/atık bertarafı için hizmet verene yükümlülük. Plaza/AVM otoparkı için **mülk sahibi/site yönetimi izni** (B2B sözleşmesinde alan kullanım izni) şart.

---

## 11. Gerekli Sözleşme & Politika Seti (Tam Liste)

### 11.1 Kullanıcıya Dönük (App içi, onaylı, versiyonlu)

| # | Belge | Taraf | Öncelik |
|---|-------|-------|---------|
| D1 | **Müşteri Kullanıcı Sözleşmesi** (mesafeli, aracı rolü, cayma, delil sözleşmesi) | Müşteri | P0 |
| D2 | **Hizmet Veren Sözleşmesi** (bağımsız yüklenici, komisyon, rücu, ekipman, susuz şart) | Hizmet veren | P0 |
| D3 | **Müşteri Aydınlatma Metni** (KVKK m.10) | Müşteri | P0 |
| D4 | **Hizmet Veren Aydınlatma Metni** (kimlik/adli sicil/konum) | Hizmet veren | P0 |
| D5 | **Açık Rıza Metni — Adli Sicil (özel nitelikli)** | Hizmet veren | P0 |
| D6 | **Açık Rıza Metni — Yurt Dışı Aktarım** (Supabase EU) | Her ikisi | P0 |
| D7 | **Ticari İleti / İYS Rızası** (opsiyonel, ayrı) | Her ikisi | P1 |
| D8 | **Ön Bilgilendirme Formu** (mesafeli sözleşme, sipariş öncesi) | Müşteri | P0 |
| D9 | **Garanti/Koruma Fonu Şartları** (tazmin tavanı, kapsam, "sigorta değildir") | Müşteri | P0 |
| D10 | **Çerez/SDK & İzin Politikası** (kamera, konum, push) | Her ikisi | P1 |

### 11.2 Kurumsal / Operasyonel

| # | Belge | Amaç | Öncelik |
|---|-------|------|---------|
| K1 | **VERBİS Kaydı + Kişisel Veri İşleme Envanteri** | KVKK zorunlu | P0 |
| K2 | **Kişisel Veri Saklama & İmha Politikası** (retention süreleri — §2.1) | KVKK | P0 |
| K3 | **Veri İhlali Müdahale Prosedürü** (72 saat KVKK bildirimi) | KVKK | P0 |
| K4 | **PSP Pazaryeri Sözleşmesi** (Iyzico submerchant/split) | 6493 escrow | P0 |
| K5 | **PSP Veri İşleyen Sözleşmesi** (DPA) | KVKK m.12 | P0 |
| K6 | **Supabase / Render Veri İşleyen Sözleşmesi (DPA) + SCC** | Yurt dışı aktarım | P0 |
| K7 | **Sigorta Grup Poliçesi Sözleşmesi** (AXA/Allianz — Faz-2) | 5684 | P1/Faz-2 |
| K8 | **B2B Filo/Plaza Sözleşmesi** (alan izni, toplu hizmet, fatura) | Ticari | P1 |
| K9 | **ETBİS Kaydı** | 6563 | P0 |
| K10 | **Hizmet Veren Onboarding/KYC Prosedürü** (adli sicil doğrula-ve-at) | İç kontrol | P0 |
| K11 | **İçerik/İtiraz/Şikayet Çözüm Prosedürü** (dispute SLA) | ETK + tüketici | P0 |
| K12 | **Gizlilik Politikası** (app store zorunlu — Apple/Google) | Mağaza | P0 |

---

## 12. Risk Matrisi (Olasılık × Etki)

| Risk | Olasılık | Etki | Skor | Azaltım |
|------|----------|------|------|---------|
| Lisanssız escrow (6493) | Orta | 🔴 Kapatma | **Kritik** | PSP pazaryeri modeli (§4) — para hiç elimize girmez |
| Adli sicil/özel nitelikli yurt dışı (KVKK) | Yüksek | 🔴 Kapatma + ceza | **Kritik** | Doğrula-ve-at + Frankfurt region + açık rıza (§3,§5) |
| Fon = lisanssız sigortacılık (5684) | Orta | 🟠 Ceza | **Yüksek** | "Garanti fonu", sigorta dili yok; Faz-2 gerçek poliçe (§6) |
| Hizmet veren işçi sayılma (SGK) | Orta-Yüksek | 🟠 Geriye dönük prim | **Yüksek** | Bağımlılık kırma + reddetme hakkı gerçek (§7) |
| Araç hasarı tazminat davası | Yüksek | 🟡 Mali | Orta | Fotoğraf delil sözleşmesi + fon/sigorta + rücu (§9) |
| KVKK açık rıza geri alınamayan veride hata | Orta | 🟡 İdari | Orta | Sözleşme ifası sebebine dayan, rızayı sınırla (§2.2) |
| ETBİS/VERBİS kaydı eksik | Düşük | 🟡 İdari ceza | Orta | Faaliyet öncesi kayıt (§2.4,§8) |
| Susuz olmayan yıkama → belediye | Orta | 🟡 Operasyon | Orta | Susuz zorunluluk sözleşmede (§10) |

---

## 13. EN KRİTİK 3 HUKUKİ BLOKÖR + AKSİYON

### 🔴 BLOKÖR 1 — Escrow'u kendimiz tutarsak 6493 ihlali (lisanssız ödeme hizmeti)

**Neden blokör:** Para WashApp hesabına girip orada bloke tutulup dağıtılırsa, lisanssız ödeme/elektronik para faaliyeti = **faaliyet durdurma + idari para cezası + cezai sorumluluk.** Bu, MVP'yi gün-1'de yasadışı yapar.

**Aksiyon:**
1. Iyzico ile **Pazaryeri (Marketplace/Submerchant + Split Payment)** sözleşmesi imzala; PayTR fallback. Para **PSP havuzunda** kalsın, WashApp **hiç dokunmasın**.
2. Escrow = **provizyon (auth) + onayda capture/split** (gerçek capture-gecikmesi gerekmez — model §4.2'de nihai).
3. Her hizmet veren **PSP nezdinde alt üye işyeri** olarak tanımlansın (onboarding zorunlu adımı).
4. **Hukuk bürosundan 6493 uyumluluk yazılı görüşü** al (model PSP'nin sorumluluğunu net üstlendiğini teyit etsin).

### 🔴 BLOKÖR 2 — KVKK: özel nitelikli veri (adli sicil) + yurt dışı aktarım (Supabase)

**Neden blokör:** Adli sicil = özel nitelikli; Supabase yurt dışı = aktarım. Yanlış kurgu = **KVKK soruşturması + yüksek idari para cezası + itibar.** Özel nitelikli verinin yurt dışına usulsüz aktarımı en ağır senaryo.

**Aksiyon:**
1. **Adli sicil/kimlik belgesi Supabase'e KALICI yüklenmez** → "doğrula-ve-at" (≤7 gün, sonra boolean + audit) (§5).
2. Supabase + Render **Frankfurt (EU) region**; **açık rıza + KVKK standart/uygun güvence sözleşmesi (SCC) + Supabase/Render DPA** (§3).
3. **Katmanlı rıza** (sözleşme / adli sicil / İYS ayrı kutular) + `kvkk_onay_ts`'e rıza tipi+versiyon+IP (§2.2).
4. **VERBİS kaydı + envanter + saklama-imha politikası + 72s ihlal prosedürü** faaliyet öncesi.
5. **KVKK avukatından yurt dışı aktarım + özel nitelikli veri görüşü** al.

### 🟠 BLOKÖR 3 — "Sigorta fonu" lisanssız sigortacılık + hizmet veren işçi sayılma (çifte tuzak)

**Neden blokör:** İkisi de gizli, geç patlayan ama büyük: (a) 15 TL fonu "sigorta" gibi işletmek **5684 lisanssız sigortacılık**; (b) iş garantisi + dispatch dayatması hizmet vereni **işçi** yapıp geriye dönük SGK/kıdem doğurur.

**Aksiyon:**
1. Fonu **"Hasar Tazmin Garanti Fonu" (sözleşmesel ticari garanti)** olarak konumla; **tazmin tavanı** belirle; "sigorta/prim/poliçe" dili **yasak** (§6). Pazarlama "güvence" der.
2. **Faz-2'de gerçek grup poliçesi** (AXA/Allianz) — hacim büyümeden geç (§6.2).
3. Hizmet veren = **bağımsız yüklenici**; **reddetme hakkı + münhasırlık yok + ekipman onun + iş başına ücret** fiilen uygulanır; "min. 3 iş garantisi" → **teşvik** olarak yeniden yazılır, dayatma değil (§7).
4. **İş + sigorta hukuku avukatından** statü ve fon yapısı görüşü al.

---

## 14. Önceki Devirlerle Tutarlılık Notu

| Önceki karar | Bu belgenin etkisi |
|--------------|---------------------|
| 01: "sigorta" değil "güvence" dili | ✅ Doğrulandı + hukuki gerekçe (§6) |
| 01: koruma fonu 15 TL (poliçe Faz-2) | ✅ "Garanti fonu" olarak, tazmin tavanıyla (§6) |
| 02: `evidence-kyc` private bucket | ⚠️ **DEĞİŞİKLİK:** adli sicil için kalıcı değil, ≤7 gün geçici (§5) |
| 02: KVKK retention cron | ✅ Adli sicil için gün-bazlı tetik ekle (§5) |
| 02: SHA-256 + append-only fotoğraf | ✅ Delil sözleşmesi maddesiyle mahkeme değeri kazanır (§9.3) |
| 03: mobil para/yazma asla Supabase'e değil | ✅ 6493 uyumuyla aynı yöne çalışır (§4) |
| 03/02: Iyzico 24s capture açık sorusu | ✅ **KAPANDI:** provizyon+capture/split nihai model (§4.2) |
| Supabase region (belirtilmemişti) | ⚠️ **KARAR:** Frankfurt/EU zorunlu (§3.2) |
| 01: hizmet verene "min 3 iş garantisi" | ⚠️ **GERİLİM:** SGK riski → "teşvik+reddetme hakkı" olarak yeniden kurgula (§7.2) |

---

*Belge sonu — 04-hukuk-risk.md*
