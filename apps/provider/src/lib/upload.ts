/**
 * Foto yakalama + SHA-256 + imzali URL'e PUT — 3-Kalkan anti-fraud omurgasi.
 * KRITIK: sunucu, yuklenen dosyanin byte'larini YENIDEN hash'ler; istemci ayni
 * byte'lari hash'lemeli (uyusmazlik -> 409). Bu yuzden imagePicker base64'unu
 * byte'a cevirip hash'liyoruz; ayni dosya (uri) uploadAsync ile PUT ediliyor.
 * Galeri YASAK — yalniz uygulama-ici kamera (launchCameraAsync).
 */
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, val = 0, p = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = B64.indexOf(clean.charAt(i));
    if (idx < 0) continue;
    val = (val << 6) | idx;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[p++] = (val >> bits) & 0xff; }
  }
  return out.subarray(0, p);
}

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, "0");
  return s;
}

export interface CapturedPhoto {
  uri: string;
  sha256: string;
}

/** Uygulama-ici kamerayla foto cek + byte SHA-256 hesapla (galeri kullanilmaz). */
export async function captureAndHash(): Promise<CapturedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Kamera izni gerekli");
  const res = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.7,
    exif: false,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  const asset = res.assets[0];
  const bytes = b64ToBytes(asset.base64 as string);
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes as unknown as ArrayBuffer,
  );
  return { uri: asset.uri, sha256: toHex(digest) };
}

/** Imzali URL'e ham byte PUT (Supabase Storage signed upload). */
export async function putToSignedUrl(uploadUrl: string, uri: string, contentType = "image/jpeg"): Promise<void> {
  const r = await uploadAsync(uploadUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { "content-type": contentType },
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Yükleme başarısız (HTTP ${r.status})`);
}

/** Anlik konum (kanit GPS damgasi / plaza geofence). */
export async function currentGps(): Promise<{ lat: number; lon: number; accuracy_m?: number }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error("Konum izni gerekli");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? undefined };
}
