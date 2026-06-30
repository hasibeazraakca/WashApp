/**
 * Yeni siparis — paket + arac + plaza + canli fiyat -> FastAPI POST.
 * Konum demo icin Maslak (pilot geofence ici); gercekte cihaz GPS'i (Faz-2).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COMMISSION_RATE, PROTECTION_FUND_TRY, SUV_SURCHARGE_RATE } from "@washapp/config";
import type { OrderPackage, Plaza, Vehicle } from "@washapp/types";
import { api } from "../lib/api";
import { addVehicle, listMyVehicles, listPlazalar } from "../lib/queries";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, TYPE, type IconName } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

const PAKETLER: { key: OrderPackage; ad: string; aciklama: string; base: number; icon: IconName }[] = [
  { key: "dis_hizli", ad: "Dış Hızlı", aciklama: "Dış + cam + jant", base: 280, icon: "zap" },
  { key: "standart", ad: "Standart", aciklama: "Dış + iç + torpido", base: 450, icon: "star" },
  { key: "premium", ad: "Premium Detay", aciklama: "Buhar + koku + cila", base: 750, icon: "award" },
];
const MASLAK = { lat: 41.079, lon: 29.011 };

export function NewOrderScreen() {
  const nav = useNavigation<NavigationProp<CustomerStackParamList>>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id ?? "";

  const [plazalar, setPlazalar] = useState<Plaza[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plazaId, setPlazaId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [paket, setPaket] = useState<OrderPackage>("standart");
  const [katPark, setKatPark] = useState("");
  const [newPlaka, setNewPlaka] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pz, vs] = await Promise.all([listPlazalar(), listMyVehicles()]);
        setPlazalar(pz); setVehicles(vs);
        if (pz[0]) setPlazaId(pz[0].id);
        if (vs[0]) setVehicleId(vs[0].id);
      } catch (e) {
        Alert.alert("Hata", e instanceof Error ? e.message : "Veriler yüklenemedi");
      }
    })();
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const fiyat = useMemo(() => {
    const suv = selectedVehicle?.arac_tipi === "suv";
    const base = PAKETLER.find((p) => p.key === paket)!.base;
    const gmv = Math.round(base * (suv ? 1 + SUV_SURCHARGE_RATE : 1) * 100) / 100;
    const komisyon = Math.round(gmv * COMMISSION_RATE * 100) / 100;
    return { gmv, komisyon, fon: PROTECTION_FUND_TRY, bloke: gmv + PROTECTION_FUND_TRY, eline: gmv - komisyon, suv };
  }, [paket, selectedVehicle]);

  async function onAddVehicle() {
    if (!newPlaka.trim()) return;
    try {
      const v = await addVehicle({ musteri_id: userId, plaka: newPlaka, arac_tipi: "sedan" });
      setVehicles((p) => [v, ...p]); setVehicleId(v.id); setNewPlaka("");
    } catch (e) {
      Alert.alert("Araç eklenemedi", e instanceof Error ? e.message : "");
    }
  }

  async function onSubmit() {
    if (!vehicleId || !plazaId) { Alert.alert("Eksik", "Araç ve plaza seçin."); return; }
    setBusy(true);
    try {
      const res = await api.createOrder({
        arac_id: vehicleId, plaza_id: plazaId, paket, konum: MASLAK,
        kat_park_no: katPark || undefined, zaman_penceresi: new Date().toISOString(),
        odeme_yontemi: "-", subscription_kullan: false,
      } as never);
      nav.navigate("OrderTracking", { orderId: res.order_id });
    } catch (e) {
      Alert.alert("Sipariş oluşturulamadı", e instanceof Error ? e.message : "");
    } finally { setBusy(false); }
  }

  const section = (icon: IconName, title: string) => (
    <View style={st.sectionHead}><Icon name={icon} size={16} color={COLORS.muted} /><Text style={st.sectionTitle}>{title}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 24 }}>
        {section("package", "Paket seç")}
        {PAKETLER.map((p) => {
          const on = paket === p.key;
          return (
            <Card key={p.key} onPress={() => setPaket(p.key)} selected={on} style={{ marginBottom: SPACING.sm }}>
              <View style={st.paketRow}>
                <IconChip name={p.icon} tone={on ? "brand" : "brand"} />
                <View style={{ flex: 1 }}>
                  <Text style={TYPE.h2}>{p.ad}</Text>
                  <Text style={TYPE.caption}>{p.aciklama}</Text>
                </View>
                <Text style={[st.paketPrice, on && { color: COLORS.brand }]}>{p.base}₺</Text>
                <Icon name={on ? "check-circle" : "circle"} size={22} color={on ? COLORS.brand : COLORS.border} />
              </View>
            </Card>
          );
        })}

        {section("truck", "Araç")}
        {vehicles.map((v) => (
          <Card key={v.id} onPress={() => setVehicleId(v.id)} selected={vehicleId === v.id} style={{ marginBottom: SPACING.sm }}>
            <View style={st.rowBetween}>
              <View style={st.rowGap}><Icon name="truck" size={18} color={COLORS.inkSoft} /><Text style={TYPE.h2}>{v.plaka}</Text><Text style={TYPE.caption}>{v.arac_tipi}</Text></View>
              <Icon name={vehicleId === v.id ? "check-circle" : "circle"} size={22} color={vehicleId === v.id ? COLORS.brand : COLORS.border} />
            </View>
          </Card>
        ))}
        <View style={st.addRow}>
          <View style={st.inputWrap}>
            <Icon name="plus" size={18} color={COLORS.faint} />
            <TextInput style={st.input} placeholder="Yeni plaka (34ABC123)" autoCapitalize="characters" value={newPlaka} onChangeText={setNewPlaka} placeholderTextColor={COLORS.faint} />
          </View>
          <Button title="Ekle" variant="secondary" full={false} onPress={onAddVehicle} style={{ minWidth: 80 }} />
        </View>

        {section("map-pin", "Plaza / Otopark")}
        {plazalar.map((pz) => (
          <Card key={pz.id} onPress={() => setPlazaId(pz.id)} selected={plazaId === pz.id} style={{ marginBottom: SPACING.sm }}>
            <View style={st.rowBetween}>
              <View style={st.rowGap}><Icon name="map-pin" size={18} color={COLORS.inkSoft} /><Text style={TYPE.h2}>{pz.ad}</Text></View>
              <Icon name={plazaId === pz.id ? "check-circle" : "circle"} size={22} color={plazaId === pz.id ? COLORS.brand : COLORS.border} />
            </View>
          </Card>
        ))}
        <View style={st.inputWrap}>
          <Icon name="hash" size={18} color={COLORS.faint} />
          <TextInput style={st.input} placeholder="Kat / park no (örn. B2-142)" value={katPark} onChangeText={setKatPark} placeholderTextColor={COLORS.faint} />
        </View>

        <Card style={st.priceCard}>
          <View style={st.rowBetween}>
            <Text style={st.priceHead}>Fiyat özeti</Text>
            {fiyat.suv && <View style={st.suvTag}><Text style={st.suvText}>SUV +%15</Text></View>}
          </View>
          <PriceRow k="Yıkama bedeli" v={fiyat.gmv} />
          <PriceRow k="Hasar koruma fonu" v={fiyat.fon} />
          <View style={st.priceDivider} />
          <PriceRow k="Toplam (escrow bloke)" v={fiyat.bloke} bold />
          <View style={st.escrowNote}>
            <Icon name="lock" size={13} color={COLORS.brand} />
            <Text style={st.escrowText}>Para onayınıza kadar bloke; onaylayınca yıkamacıya geçer.</Text>
          </View>
        </Card>
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title="Sipariş Ver" icon="check" onPress={onSubmit} loading={busy} />
      </View>
    </View>
  );
}

function PriceRow({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <View style={st.priceRow}>
      <Text style={[TYPE.body, { fontSize: 14 }, bold && { fontWeight: "800", color: COLORS.ink }]}>{k}</Text>
      <Text style={[st.priceVal, TYPE.num, bold && { fontWeight: "800", fontSize: 17, color: COLORS.ink }]}>{v.toFixed(2)} ₺</Text>
    </View>
  );
}

const st = StyleSheet.create({
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  sectionTitle: { ...TYPE.label, textTransform: "uppercase", letterSpacing: 0.5 },
  paketRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  paketPrice: { fontSize: 16, fontWeight: "800", color: COLORS.inkSoft },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 10 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, backgroundColor: COLORS.surface, minHeight: 50, marginTop: 4 },
  input: { flex: 1, fontSize: 15, color: COLORS.ink, paddingVertical: 13 },
  priceCard: { marginTop: SPACING.xl, backgroundColor: COLORS.brandSoft, borderColor: COLORS.brandBorder },
  priceHead: { ...TYPE.h2 },
  suvTag: { backgroundColor: COLORS.warnSoft, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 },
  suvText: { fontSize: 11, fontWeight: "700", color: COLORS.warn },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  priceVal: { fontSize: 14, fontWeight: "600", color: COLORS.inkSoft },
  priceDivider: { height: 1, backgroundColor: COLORS.brandBorder, marginTop: 12 },
  escrowNote: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  escrowText: { flex: 1, fontSize: 12, color: COLORS.inkSoft, lineHeight: 17 },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
});
