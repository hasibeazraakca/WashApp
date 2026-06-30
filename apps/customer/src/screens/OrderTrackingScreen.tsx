/**
 * Siparis takip — ikonlu dikey zaman cizelgesi (canli: poll + Realtime) + onay/itiraz.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Order, OrderStatus } from "@washapp/types";
import { api } from "../lib/api";
import { subscribeOrderStatus } from "@washapp/supabase";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, StatusBadge, TYPE, type IconName } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

const STEPS: { key: OrderStatus; label: string; icon: IconName }[] = [
  { key: "olusturuldu", label: "Sipariş alındı", icon: "shopping-bag" },
  { key: "eslestirildi", label: "Yıkamacı atandı", icon: "user-check" },
  { key: "varildi", label: "Yıkamacı geldi", icon: "map-pin" },
  { key: "oncesi_foto_ok", label: "Öncesi fotoğraflar", icon: "camera" },
  { key: "yikama", label: "Yıkanıyor", icon: "droplet" },
  { key: "sonrasi_foto_ok", label: "Sonrası fotoğraflar", icon: "camera" },
  { key: "musteri_onay", label: "Onayınız bekleniyor", icon: "clock" },
  { key: "tamamlandi", label: "Tamamlandı", icon: "check-circle" },
];
const ORDER_IDX: Record<string, number> = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

export function OrderTrackingScreen() {
  const { orderId } = useRoute<RouteProp<CustomerStackParamList, "OrderTracking">>().params;
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOrder(await api.getOrder(orderId)); }
    catch (e) { Alert.alert("Hata", e instanceof Error ? e.message : "Okunamadı"); }
  }, [orderId]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, 5000);
    let unsub = () => {};
    try { unsub = subscribeOrderStatus(orderId, () => void load()); } catch { /* poll yeter */ }
    return () => { clearInterval(poll); unsub(); };
  }, [orderId, load]);

  async function onConfirm() {
    setBusy(true);
    try { await api.confirmOrder(orderId); await load(); Alert.alert("Teşekkürler", "Yıkama onaylandı, sipariş tamamlandı."); }
    catch (e) { Alert.alert("Onaylanamadı", e instanceof Error ? e.message : ""); }
    finally { setBusy(false); }
  }
  async function onDispute() {
    setBusy(true);
    try { await api.openDispute(orderId, "musteri_itiraz", "Yıkama beklendiği gibi değil"); await load(); Alert.alert("İtiraz açıldı", "Operasyon ekibi fotoğraf kanıtıyla inceleyecek."); }
    catch (e) { Alert.alert("İtiraz açılamadı", e instanceof Error ? e.message : ""); }
    finally { setBusy(false); }
  }

  if (!order) return <View style={st.center}><ActivityIndicator color={COLORS.brand} /></View>;

  const curIdx = ORDER_IDX[order.status] ?? -1;
  const sapma = order.status === "itiraz" || order.status === "iptal";
  const canConfirm = order.status === "musteri_onay";
  const canDispute = order.status === "musteri_onay" || order.status === "sonrasi_foto_ok";
  const p = order.pricing;
  const num = (n?: number) => (typeof n === "number" ? n.toFixed(2) : String(n ?? "—"));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 24 }}>
        <Card>
          <View style={st.topRow}>
            <IconChip name="truck" tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={TYPE.h1} numberOfLines={1}>{order.paket}</Text>
              <Text style={TYPE.caption}>#{order.id.slice(0, 8)}</Text>
            </View>
            <StatusBadge status={order.status} />
          </View>
          {p && (
            <View style={st.escrowBox}>
              <View style={st.escrowItem}><Icon name="lock" size={15} color={COLORS.brand} /><Text style={st.escrowK}>Bloke</Text><Text style={[st.escrowV, TYPE.num]}>{num(p.toplam_bloke)} ₺</Text></View>
              <View style={st.escrowSep} />
              <View style={st.escrowItem}><Icon name="user" size={15} color={COLORS.muted} /><Text style={st.escrowK}>Yıkamacı</Text><Text style={[st.escrowV, TYPE.num]}>{num(p.hizmet_veren_eline)} ₺</Text></View>
            </View>
          )}
        </Card>

        <Card style={{ marginTop: SPACING.md }}>
          <Text style={[TYPE.label, { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }]}>Durum</Text>
          {STEPS.map((s, i) => {
            const done = curIdx >= i && !sapma;
            const active = curIdx === i && !sapma;
            const last = i === STEPS.length - 1;
            return (
              <View key={s.key} style={st.step}>
                <View style={st.stepIconCol}>
                  <View style={[st.node, done ? st.nodeDone : st.nodeIdle, active && st.nodeActive]}>
                    <Icon name={done ? "check" : s.icon} size={14} color={done ? "#fff" : active ? COLORS.brand : COLORS.faint} />
                  </View>
                  {!last && <View style={[st.connector, done && curIdx > i && { backgroundColor: COLORS.brand }]} />}
                </View>
                <Text style={[st.stepLabel, active && { color: COLORS.ink, fontWeight: "700" }, done && !active && { color: COLORS.inkSoft }]}>{s.label}</Text>
              </View>
            );
          })}
          {sapma && (
            <View style={[st.sapma, { backgroundColor: COLORS.dangerSoft }]}>
              <Icon name="alert-triangle" size={16} color={COLORS.danger} />
              <Text style={st.sapmaText}>{order.status === "itiraz" ? "İtirazınız inceleniyor." : "Sipariş iptal edildi."}</Text>
            </View>
          )}
        </Card>

        {canConfirm && (
          <Card style={{ marginTop: SPACING.md, borderColor: COLORS.successSoft }}>
            <View style={st.topRow}>
              <IconChip name="check-circle" tone="success" />
              <View style={{ flex: 1 }}>
                <Text style={TYPE.h2}>Yıkama tamamlandı</Text>
                <Text style={[TYPE.body, { fontSize: 13, marginTop: 2 }]}>Fotoğrafları inceleyin. Onaylarsanız ödeme yıkamacıya geçer (24s içinde otomatik onaylanır).</Text>
              </View>
            </View>
            <Button title="Onayla ve Tamamla" icon="check" onPress={onConfirm} loading={busy} style={{ marginTop: 14 }} />
            <Button title="İtiraz Et" variant="danger" icon="flag" onPress={onDispute} style={{ marginTop: 10 }} />
          </Card>
        )}
        {!canConfirm && canDispute && (
          <Button title="İtiraz Et" variant="danger" icon="flag" onPress={onDispute} loading={busy} style={{ marginTop: SPACING.md }} />
        )}

        <View style={st.liveHint}>
          <Icon name="radio" size={13} color={COLORS.muted} />
          <Text style={st.liveText}>Canlı izleniyor · durum otomatik güncellenir</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  escrowBox: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md, padding: 12, marginTop: 14 },
  escrowItem: { flex: 1, alignItems: "center", gap: 3 },
  escrowK: { fontSize: 11, color: COLORS.muted, fontWeight: "600" },
  escrowV: { fontSize: 16, fontWeight: "800", color: COLORS.ink },
  escrowSep: { width: 1, height: 36, backgroundColor: COLORS.border },
  step: { flexDirection: "row", gap: 12 },
  stepIconCol: { alignItems: "center", width: 30 },
  node: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  nodeIdle: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  nodeActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandSoft },
  nodeDone: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  connector: { width: 2, flex: 1, minHeight: 18, backgroundColor: COLORS.border, marginVertical: 2 },
  stepLabel: { ...TYPE.body, fontSize: 14, color: COLORS.muted, paddingTop: 5, paddingBottom: 10, flex: 1 },
  sapma: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: RADIUS.sm, padding: 11, marginTop: 6 },
  sapmaText: { flex: 1, color: COLORS.danger, fontWeight: "600", fontSize: 13 },
  liveHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACING.lg },
  liveText: { ...TYPE.caption },
});
