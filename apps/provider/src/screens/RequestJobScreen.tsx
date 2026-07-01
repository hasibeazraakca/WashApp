/** Randevu talebi detayı (provider) — üstlen / fiyat ver / durum ilerlet / foto ekle. */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MediaItem, ServiceRequestDetail } from "@washapp/types";
import { api } from "../lib/api";
import { captureAndHash, putToSignedUrl } from "../lib/upload";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, TYPE } from "../ui/theme";
import type { ProviderStackParamList } from "../navigation/types";

const DURUM_LABEL: Record<string, string> = {
  yeni: "Yeni", uslenildi: "Üstlenildi", teklif_verildi: "Fiyat verildi",
  planlandi: "Planlandı", yolda: "Yolda", tamamlandi: "Tamamlandı", iptal: "İptal",
};

export function RequestJobScreen() {
  const nav = useNavigation<NavigationProp<ProviderStackParamList>>();
  const { params } = useRoute<RouteProp<ProviderStackParamList, "RequestJob">>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const talepId = params.talepId;

  const [req, setReq] = useState<ServiceRequestDetail | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fiyat, setFiyat] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([api.getRequest(talepId), api.listRequestMedia(talepId).catch(() => [])]);
      setReq(r); setMedia(m);
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [talepId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const mine = !!req?.hizmet_veren_id && req.hizmet_veren_id === session?.user.id;

  async function run(fn: () => Promise<ServiceRequestDetail>, okMsg?: string) {
    setBusy(true);
    try {
      const r = await fn();
      setReq(r);
      if (okMsg) Alert.alert("Tamam", okMsg);
    } catch (e) {
      Alert.alert("İşlem başarısız", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function onQuote() {
    const v = Number(fiyat.replace(",", "."));
    if (!v || v <= 0) { Alert.alert("Geçersiz fiyat", "Pozitif bir tutar girin."); return; }
    await run(() => api.quoteRequest(talepId, v), "Fiyat teklifiniz iletildi.");
    setFiyat("");
  }

  async function onPhoto() {
    if (!mine) return;
    setBusy(true);
    try {
      const shot = await captureAndHash();
      if (!shot) return;
      const up = await api.requestMediaUploadUrl(talepId);
      await putToSignedUrl(up.upload_url, shot.uri);
      await api.addRequestMedia(talepId, { storage_path: up.storage_path, asama: req?.durum });
      await load();
    } catch (e) {
      Alert.alert("Fotoğraf yüklenemedi", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !req) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center" }}><ActivityIndicator color={COLORS.brand} /></View>;
  }

  const fiyatGoster = req.fiyat_teklifi ?? req.tahmini_fiyat;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 24 }}>
        <Card>
          <View style={st.rowGap}>
            <IconChip name="tool" tone="warn" />
            <View style={{ flex: 1 }}>
              <Text style={TYPE.h2}>{req.hizmet_ad ?? "Hizmet"}</Text>
              <Text style={TYPE.caption}>{req.kategori_ad ?? ""} · {DURUM_LABEL[req.durum] ?? req.durum}</Text>
            </View>
            <Text style={st.money}>{req.fiyat_teklifi ? "" : "~"}{Number(fiyatGoster ?? 0).toFixed(0)}₺</Text>
          </View>
          <View style={st.divider} />
          <Info icon="truck" label="Araç" value={`${req.plaka ?? "—"}${req.arac_tipi ? ` · ${req.arac_tipi}` : ""}`} />
          <Info icon="map-pin" label="Konum" value={`${req.plaza_ad ?? "—"}${req.kat_park_no ? ` · ${req.kat_park_no}` : ""}`} />
          {!!req.notlar && <Info icon="message-square" label="Not" value={req.notlar} />}
        </Card>

        {/* Aksiyonlar */}
        <View style={{ marginTop: SPACING.lg, gap: SPACING.sm }}>
          {req.durum === "yeni" && (
            <Button title="İşi Üstlen" icon="check" loading={busy} onPress={() => run(() => api.claimRequest(talepId), "İşi üstlendiniz.")} />
          )}

          {mine && (req.durum === "uslenildi" || req.durum === "teklif_verildi") && (
            <Card style={{ padding: SPACING.md }}>
              <Text style={TYPE.label}>Fiyat ver</Text>
              <View style={st.fiyatRow}>
                <View style={st.inputWrap}>
                  <Icon name="tag" size={16} color={COLORS.faint} />
                  <TextInput style={st.input} value={fiyat} onChangeText={setFiyat} keyboardType="numeric" placeholder={`${Number(req.tahmini_fiyat ?? 0).toFixed(0)}`} placeholderTextColor={COLORS.faint} />
                  <Text style={st.tl}>₺</Text>
                </View>
                <Button title="Gönder" full={false} loading={busy} onPress={onQuote} style={{ minWidth: 96 }} />
              </View>
            </Card>
          )}

          {mine && (req.durum === "uslenildi" || req.durum === "teklif_verildi") && (
            <Button title="Randevuyu Planla" icon="calendar" variant="secondary" loading={busy} onPress={() => run(() => api.updateRequestStatus(talepId, "planlandi"), "Planlandı.")} />
          )}
          {mine && req.durum === "planlandi" && (
            <Button title="Yola Çıktım" icon="navigation" loading={busy} onPress={() => run(() => api.updateRequestStatus(talepId, "yolda"), "Yolda olarak işaretlendi.")} />
          )}
          {mine && req.durum === "yolda" && (
            <Button title="İşi Tamamla" icon="check-circle" loading={busy} onPress={() => run(() => api.updateRequestStatus(talepId, "tamamlandi"), "Tamamlandı.")} />
          )}
          {mine && req.durum !== "tamamlandi" && req.durum !== "iptal" && (
            <Button title="İptal Et" icon="x" variant="danger" loading={busy} onPress={() => run(() => api.updateRequestStatus(talepId, "iptal"))} />
          )}
        </View>

        {/* Foto */}
        {mine && (
          <View style={{ marginTop: SPACING.xl }}>
            <View style={st.sectionHead}>
              <Icon name="camera" size={16} color={COLORS.muted} />
              <Text style={st.sectionTitle}>İş fotoğrafları</Text>
            </View>
            {media.length > 0 && (
              <View style={st.grid}>
                {media.map((m) => (
                  <Image key={m.id} source={{ uri: m.signed_url }} style={st.thumb} />
                ))}
              </View>
            )}
            <Button title="Fotoğraf Ekle" icon="camera" variant="secondary" loading={busy} onPress={onPhoto} style={{ marginTop: media.length ? SPACING.sm : 0 }} />
            <Text style={st.hint}>Uygulama içi kamera · her aşamada belge bırakabilirsiniz.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Info({ icon, label, value }: { icon: "truck" | "map-pin" | "message-square"; label: string; value: string }) {
  return (
    <View style={st.infoRow}>
      <Icon name={icon} size={16} color={COLORS.faint} />
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  rowGap: { flexDirection: "row", alignItems: "center", gap: 12 },
  money: { fontSize: 18, fontWeight: "800", color: COLORS.ink },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  infoLabel: { fontSize: 12, fontWeight: "700", color: COLORS.muted, width: 54 },
  infoValue: { flex: 1, fontSize: 14, color: COLORS.ink },
  fiyatRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, backgroundColor: COLORS.surface, minHeight: 50 },
  input: { flex: 1, fontSize: 16, color: COLORS.ink, paddingVertical: 12 },
  tl: { fontSize: 16, fontWeight: "700", color: COLORS.inkSoft },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: SPACING.sm },
  sectionTitle: { ...TYPE.label, textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 92, height: 92, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceAlt },
  hint: { ...TYPE.caption, marginTop: 8 },
});
