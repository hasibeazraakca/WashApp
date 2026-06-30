/**
 * Sipariş takip — canlı durum (poll + Supabase Realtime), onay/itiraz aksiyonları.
 * Durum makinesi: olusturuldu→eslestirildi→varildi→...→musteri_onay→tamamlandi.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ORDER_STATUSES, type Order, type OrderStatus } from "@washapp/types";
import { api } from "../lib/api";
import { subscribeOrderStatus } from "@washapp/supabase";
import { Button, Card, COLORS, StatusBadge } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

// Müşteriye gösterilen ilerleme adımları (itiraz/iptal hariç ana hat).
const STEPS: OrderStatus[] = [
  "olusturuldu",
  "eslestirildi",
  "varildi",
  "oncesi_foto_ok",
  "yikama",
  "sonrasi_foto_ok",
  "musteri_onay",
  "tamamlandi",
];
const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  olusturuldu: "Sipariş alındı",
  eslestirildi: "Yıkamacı atandı",
  varildi: "Yıkamacı geldi",
  oncesi_foto_ok: "Öncesi fotoğraflar",
  yikama: "Yıkanıyor",
  sonrasi_foto_ok: "Sonrası fotoğraflar",
  musteri_onay: "Onayınız bekleniyor",
  tamamlandi: "Tamamlandı",
};

export function OrderTrackingScreen() {
  const route = useRoute<RouteProp<CustomerStackParamList, "OrderTracking">>();
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await api.getOrder(orderId));
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "Sipariş okunamadı");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, 5000); // yedek: Realtime + 5sn poll
    let unsub = () => {};
    try {
      unsub = subscribeOrderStatus(orderId, () => void load());
    } catch {
      /* Realtime opsiyonel; poll yeter */
    }
    return () => {
      clearInterval(poll);
      unsub();
    };
  }, [orderId, load]);

  async function onConfirm() {
    setBusy(true);
    try {
      await api.confirmOrder(orderId);
      await load();
      Alert.alert("Teşekkürler", "Yıkama onaylandı, sipariş tamamlandı.");
    } catch (e) {
      Alert.alert("Onaylanamadı", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function onDispute() {
    setBusy(true);
    try {
      await api.openDispute(orderId, "musteri_itiraz", "Yıkama beklendiği gibi değil");
      await load();
      Alert.alert("İtiraz açıldı", "Operasyon ekibi inceleyecek (fotoğraf kanıtı ile).");
    } catch (e) {
      Alert.alert("İtiraz açılamadı", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const curIdx = STEPS.indexOf(order.status);
  const canConfirm = order.status === "musteri_onay";
  const canDispute = order.status === "musteri_onay" || order.status === "sonrasi_foto_ok";

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <View style={st.row}>
          <Text style={st.paket}>{order.paket}</Text>
          <StatusBadge status={order.status} />
        </View>
        <Text style={st.meta}>#{order.id.slice(0, 8)}</Text>
        {order.pricing && (
          <Text style={st.price}>
            Bloke: {order.pricing.toplam_bloke?.toFixed?.(2) ?? order.pricing.toplam_bloke} ₺ · Yıkamacı:{" "}
            {order.pricing.hizmet_veren_eline?.toFixed?.(2) ?? order.pricing.hizmet_veren_eline} ₺
          </Text>
        )}
      </Card>

      <Card>
        {STEPS.map((s, i) => {
          const done = curIdx >= 0 && i <= curIdx;
          const active = i === curIdx;
          return (
            <View key={s} style={st.step}>
              <View style={[st.dot, done && st.dotDone, active && st.dotActive]}>
                {done && <Text style={st.dotCheck}>✓</Text>}
              </View>
              <Text style={[st.stepLabel, active && { fontWeight: "800", color: COLORS.text }]}>
                {STEP_LABEL[s]}
              </Text>
            </View>
          );
        })}
        {(order.status === "itiraz" || order.status === "iptal") && (
          <Text style={st.warn}>Durum: {order.status}</Text>
        )}
      </Card>

      {canConfirm && (
        <Card style={{ borderColor: COLORS.ok }}>
          <Text style={st.cardTitle}>Yıkama tamamlandı</Text>
          <Text style={st.cardText}>
            Öncesi/sonrası fotoğrafları inceleyin. Onaylarsanız ödeme yıkamacıya geçer (24s içinde
            onaylamazsanız otomatik onaylanır).
          </Text>
          <Button title="Onayla ve Tamamla" onPress={onConfirm} loading={busy} style={{ marginTop: 10 }} />
          <Button title="İtiraz Et" onPress={onDispute} variant="danger" style={{ marginTop: 8 }} />
        </Card>
      )}
      {!canConfirm && canDispute && (
        <Button title="İtiraz Et" onPress={onDispute} variant="danger" loading={busy} />
      )}

      <Text style={st.help}>
        Durum yıkamacı ve operasyon adımlarıyla otomatik ilerler (canlı). Bu ekran 5 sn'de bir +
        Realtime ile güncellenir.
      </Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paket: { fontSize: 18, fontWeight: "800", color: COLORS.text, textTransform: "capitalize" },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  price: { fontSize: 13, color: COLORS.text, marginTop: 8 },
  step: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, marginRight: 12, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: COLORS.ok, borderColor: COLORS.ok },
  dotActive: { borderColor: COLORS.primary },
  dotCheck: { color: "#fff", fontSize: 12, fontWeight: "800" },
  stepLabel: { fontSize: 14, color: COLORS.muted },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardText: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  warn: { color: COLORS.danger, fontWeight: "700", marginTop: 8 },
  help: { fontSize: 12, color: COLORS.muted, marginTop: 16, marginBottom: 40, textAlign: "center" },
});
