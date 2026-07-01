/**
 * Cihaz izinleri — konum + bildirim. Onboarding'de zorunlu akista kullanilir.
 * OneSignal ILERIDE: push token'i OneSignal SDK'sina devredilecek (dev/prod build;
 * Expo Go remote push SDK 53+ desteklemez). Simdilik yalniz IZIN alinir.
 */
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

export interface LocationResult {
  granted: boolean;
  lat?: number;
  lon?: number;
  accuracy_m?: number;
}

/** Konum izni iste + verilirse anlik konumu dondur (geofence/servis icin). */
export async function requestLocation(): Promise<LocationResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { granted: false };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      granted: true,
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ?? undefined,
    };
  } catch {
    // Izin var ama konum alinamadi (GPS kapali vb.) — izin yeterli sayilir.
    return { granted: true };
  }
}

/**
 * Bildirim izni iste. Android 13+ POST_NOTIFICATIONS runtime izni gerektirir.
 * OneSignal baglanana kadar yalniz izin durumu tutulur (push token ALINMAZ).
 */
export async function requestNotifications(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}
