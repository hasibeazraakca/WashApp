/** Musteri app navigasyon param listesi (React Navigation 7 native-stack). */
export type CustomerStackParamList = {
  Home: undefined;
  Services: undefined;
  // Katalogtan secilen full-akis hizmet (yikama/detay) — foto+escrow siparisi.
  NewOrder: { hizmetId?: string; hizmetKod?: string; hizmetAd?: string; tabanFiyat?: number } | undefined;
  // randevu_modu hizmet (yag/lastik/bakim) — fotosuz talep.
  ServiceRequest: { hizmetId: string; hizmetAd: string; tabanFiyat: number; sureDk?: number };
  OrderTracking: { orderId: string };
};
