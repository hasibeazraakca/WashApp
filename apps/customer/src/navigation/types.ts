/** Musteri app navigasyon param listesi (React Navigation 7 native-stack). */
export type CustomerStackParamList = {
  Home: undefined;
  NewOrder: undefined;
  OrderTracking: { orderId: string };
};
