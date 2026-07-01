/** Sipariş (yıkama) iş akışı — provider. Üstlen → Vardım → 6 öncesi foto →
 *  Yıkamayı başlat → 6 sonrası foto → müşteri onayı. 3-Kalkan kanıt: in-app kamera. */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Order, OrderStatus } from "@washapp/types";
import { api } from "../lib/api";
import { captureAndHash, currentGps, putToSignedUrl } from "../lib/upload";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, StatusBadge, TYPE } from "../ui/theme";
import type { ProviderStackParamList } from "../navigation/types";

const ACILAR: { key: string; label: string }[] = [
  { key: "on_sol", label: "Ön Sol" }, { key: "on_sag", label: "Ön Sağ" },
  { key: "arka_sol", label: "Arka Sol" }, { key: "arka_sag", label: "Arka Sağ" },
  { key: "jant", label: "Jant" }, { key: "ic_torpido", label: "İç/Torpido" },
];
const EVRE_OF: Partial<Record<OrderStatus, "oncesi" | "sonrasi">> = { varildi: "oncesi", yikama: "sonrasi" };

export function OrderJobScreen() {
  const { params } = useRoute<RouteProp<ProviderStackParamList, "OrderJob">>();
  const insets = useSafeAreaInsets();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [activeAci, setActiveAci] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await api.getOrder(orderId));
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { void load(); setDone(new Set()); }, [load]));

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      if (okMsg) Alert.alert("Tamam", okMsg);
    } catch (e) {
      Alert.alert("İşlem başarısız", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  const status = order?.status;
  const evre = status ? EVRE_OF[status] : undefined;

  async function onCapture(aci: string) {
    if (!evre) return;
    setActiveAci(aci);
    try {
      const gps = await currentGps();
      const shot = await captureAndHash();
      if (!shot) return;
      const cihaz_ts = new Date().toISOString();
      const up = await api.getEvidenceUploadUrl({ order_id: orderId, evre, aci, sha256: shot.sha256, gps, cihaz_ts } as never);
      await putToSignedUrl(up.upload_url, shot.uri);
      const res = await api.confirmEvidence({ order_id: orderId, evre, aci, sha256: shot.sha256, gps, cihaz_ts });
      setDone((prev) => new Set(prev).add(aci));
      if (res.status) {
        // Faz tamamlandı (backend durum ilerletti) — yeniden yükle.
        await load();
        setDone(new Set());
        Alert.alert("Aşama tamam", evre === "oncesi" ? "6 öncesi fotoğraf tamamlandı." : "6 sonrası fotoğraf tamamlandı. Müşteri onayına gönderildi.");
      }
    } catch (e) {
      Alert.alert("Fotoğraf reddedildi", e instanceof Error ? e.message : "");
    } finally {
      setActiveAci(null);
    }
  }

  if (loading || !order) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center" }}><ActivityIndicator color={COLORS.brand} /></View>;
  }

  // Backend Order 'fiyat' (FiyatSnapshot) döndürür; paylaşılan TS tipinde alan adı farklı.
  const fiyat = (order as unknown as { fiyat?: { gmv?: number; hizmet_veren_eline?: number } }).fiyat;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 24 }}>
        <Card>
          <View style={st.rowGap}>
            <IconChip name="droplet" tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={TYPE.h2}>Yıkama · {order.paket}</Text>
              <Text style={TYPE.caption}>#{orderId.slice(0, 6)}</Text>
            </View>
            <Text style={st.money}>{Number(fiyat?.hizmet_veren_eline ?? fiyat?.gmv ?? 0).toFixed(0)}₺</Text>
          </View>
          <View style={{ marginTop: 12 }}><StatusBadge status={order.status} /></View>
        </Card>

        {/* Aşama aksiyonları */}
        <View style={{ marginTop: SPACING.lg, gap: SPACING.sm }}>
          {status === "olusturuldu" && (
            <Button title="İşi Üstlen" icon="check" loading={busy} onPress={() => act(() => api.claimOrder(orderId), "İşi üstlendiniz.")} />
          )}
          {status === "eslestirildi" && (
            <Button title="Vardım" icon="map-pin" loading={busy} onPress={() => act(() => api.arrive(orderId), "Varış bildirildi.")} />
          )}
          {status === "oncesi_foto_ok" && (
            <Button title="Yıkamayı Başlat" icon="play" loading={busy} onPress={() => act(() => api.startWash(orderId), "Yıkama başladı.")} />
          )}
          {(status === "sonrasi_foto_ok" || status === "musteri_onay") && (
            <Card style={{ backgroundColor: COLORS.warnSoft, borderColor: COLORS.warnSoft }}>
              <View style={st.rowGap}><Icon name="clock" size={18} color={COLORS.warn} /><Text style={[TYPE.body, { flex: 1, fontSize: 14 }]}>Müşteri onayı bekleniyor (24 saat içinde otomatik onaylanır).</Text></View>
            </Card>
          )}
          {status === "tamamlandi" && (
            <Card style={{ backgroundColor: COLORS.successSoft, borderColor: COLORS.successSoft }}>
              <View style={st.rowGap}><Icon name="check-circle" size={18} color={COLORS.success} /><Text style={[TYPE.body, { flex: 1, fontSize: 14 }]}>İş tamamlandı. Ödemeniz cüzdanınıza işlenecek.</Text></View>
            </Card>
          )}
        </View>

        {/* Foto ızgarası (öncesi/sonrası) */}
        {evre && (
          <View style={{ marginTop: SPACING.xl }}>
            <View style={st.sectionHead}>
              <Icon name="camera" size={16} color={COLORS.muted} />
              <Text style={st.sectionTitle}>{evre === "oncesi" ? "Öncesi" : "Sonrası"} fotoğraflar ({done.size}/6)</Text>
            </View>
            <Text style={st.note}>Plaza konumunda, uygulama içi kamerayla çekilir. Galeri kabul edilmez.</Text>
            <View style={st.grid}>
              {ACILAR.map((a) => {
                const ok = done.has(a.key);
                const loadingThis = activeAci === a.key;
                return (
                  <Pressable key={a.key} onPress={() => !ok && !busy && onCapture(a.key)} style={[st.tile, ok && st.tileOk]}>
                    {loadingThis ? (
                      <ActivityIndicator color={COLORS.brand} />
                    ) : (
                      <Icon name={ok ? "check-circle" : "camera"} size={22} color={ok ? COLORS.success : COLORS.brand} />
                    )}
                    <Text style={[st.tileText, ok && { color: COLORS.success }]}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  rowGap: { flexDirection: "row", alignItems: "center", gap: 12 },
  money: { fontSize: 18, fontWeight: "800", color: COLORS.ink },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  sectionTitle: { ...TYPE.label, textTransform: "uppercase", letterSpacing: 0.5 },
  note: { ...TYPE.caption, marginBottom: SPACING.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  tile: { width: "31.5%", aspectRatio: 1, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", gap: 8 },
  tileOk: { borderColor: COLORS.success, backgroundColor: COLORS.successSoft },
  tileText: { fontSize: 12, fontWeight: "700", color: COLORS.inkSoft },
});
