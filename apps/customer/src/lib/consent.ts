/**
 * KVKK aydinlatma metni — konum + bildirim rizasi dahil (Google Play zorunlulugu).
 * Onboarding'de gosterilir; onay -> PATCH /me { kvkk_onay: true } (kvkk_onay_ts).
 * Veriler Supabase Frankfurt/AB'de islenir (docs: KVKK karari).
 */
export const KVKK_METNI = `WashApp olarak kişisel verileriniz 6698 sayılı KVKK kapsamında, Frankfurt/AB (eu-central-1) sunucularında işlenir.

Topladığımız veriler ve amaçları:
• Ad-soyad ve telefon: hizmetin sunulması, yıkamacı/servis ile iletişim ve sipariş bilgilendirmesi.
• Konum: siparişinizin doğru adreste ve pilot hizmet bölgesi içinde olduğunun doğrulanması (geofence) ve size en yakın hizmet verenin eşleştirilmesi.
• Araç/plaka bilgisi: hizmetin ilgili araca uygulanması ve fotoğraf kanıtının eşleştirilmesi.
• Bildirimler: sipariş durumu, yıkamacının gelişi ve onay hatırlatmaları için push bildirim gönderimi.

Fotoğraf kanıtları yalnızca uygulama içi kamerayla, GPS + zaman damgalı ve değiştirilemez (SHA-256 imzalı) olarak saklanır; anlaşmazlık ve hasar garantisi için kullanılır.

"Onaylıyorum" diyerek; kişisel verilerinizin yukarıdaki amaçlarla işlenmesini, KONUM ve BİLDİRİM izinlerinin bu amaçlarla kullanılmasını kabul etmiş olursunuz. İzinleri cihaz ayarlarından dilediğiniz zaman geri alabilirsiniz.`;
