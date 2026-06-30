/**
 * Yeni sipariş — paket + araç + plaza seç, canlı fiyat göster, FastAPI'ye POST.
 * Konum demo için Maslak (pilot geofence içi) sabit; gerçekte cihaz GPS'i (Faz-2).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { COMMISSION_RATE, PROTECTION_FUND_TRY, SUV_SURCHARGE_RATE } from "@washapp/config";
import type { OrderPackage, Plaza, Vehicle } from "@washapp/types";
import { api } from "../lib/api";
import { addVehicle, listMyVehicles, listPlazalar } from "../lib/queries";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

const PAKET_BASE: Record<OrderPackage, number> = { dis_hizli: 280, standart: 450, premium: 750 };
const PAKET_AD: Record<OrderPackage, string> = {
  dis_hizli: "Dış Hızlı",
  standart: "Standart",
  premium: "Premium Detay",
};
// Demo konum: Maslak (pilot poligon içi) — backend ST_Within ile doğrular.
const MASLAK = { lat: 41.079, lon: 29.011 };

export function NewOrderScreen() {
  const nav = useNavigation<NavigationProp<CustomerStackParamList>>();
  const { session } = useAuth();
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
        setPlazalar(pz);
        setVehicles(vs);
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
    const gmv = Math.round(PAKET_BASE[paket] * (suv ? 1 + SUV_SURCHARGE_RATE : 1) * 100) / 100;
    const komisyon = Math.round(gmv * COMMISSION_RATE * 100) / 100;
    return { gmv, komisyon, fon: PROTECTION_FUND_TRY, bloke: gmv + PROTECTION_FUND_TRY, eline: gmv - komisyon };
  }, [paket, selectedVehicle]);

  async function onAddVehicle() {
    if (!newPlaka.trim()) return;
    try {
      const v = await addVehicle({ musteri_id: userId, plaka: newPlaka, arac_tipi: "sedan" });
      setVehicles((p) => [v, ...p]);
      setVehicleId(v.id);
      setNewPlaka("");
    } catch (e) {
      Alert.alert("Araç eklenemedi", e instanceof Error ? e.message : "");
    }
  }

  async function onSubmit() {
    if (!vehicleId || !plazaId) {
      Alert.alert("Eksik", "Araç ve plaza seçin.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.createOrder({
        arac_id: vehicleId,
        plaza_id: plazaId,
        paket,
        konum: MASLAK,
        kat_park_no: katPark || undefined,
        zaman_penceresi: new Date().toISOString(),
        odeme_yontemi: "-",
        subscription_kullan: false,
      } as never);
      nav.navigate("OrderTracking", { orderId: res.order_id });
    } catch (e) {
      Alert.alert("Sipariş oluşturulamadı", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={st.h}>Paket</Text>
      <View style={st.seg}>
        {(Object.keys(PAKET_BASE) as OrderPackage[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPaket(p)}
            style={[st.segItem, paket === p && st.segActive]}
          >
            <Text style={[st.segText, paket === p && st.segTextActive]}>{PAKET_AD[p]}</Text>
            <Text style={[st.segPrice, paket === p && st.segTextActive]}>{PAKET_BASE[p]}₺</Text>
          </Pressable>
        ))}
      </View>

      <Text style={st.h}>Araç</Text>
      {vehicles.map((v) => (
        <Pressable key={v.id} onPress={() => setVehicleId(v.id)}>
          <Card style={vehicleId === v.id ? st.pick : undefined}>
            <Text style={st.cardTitle}>
              {v.plaka} · {v.arac_tipi}
            </Text>
          </Card>
        </Pressable>
      ))}
      <View style={st.addRow}>
        <TextInput
          style={st.input}
          placeholder="Yeni plaka (34ABC123)"
          autoCapitalize="characters"
          value={newPlaka}
          onChangeText={setNewPlaka}
        />
        <Button title="Ekle" onPress={onAddVehicle} variant="ghost" style={{ paddingHorizontal: 18 }} />
      </View>

      <Text style={st.h}>Plaza / Otopark</Text>
      {plazalar.map((pz) => (
        <Pressable key={pz.id} onPress={() => setPlazaId(pz.id)}>
          <Card style={plazaId === pz.id ? st.pick : undefined}>
            <Text style={st.cardTitle}>{pz.ad}</Text>
          </Card>
        </Pressable>
      ))}
      <TextInput
        style={[st.input, { marginTop: 4 }]}
        placeholder="Kat / park no (örn. B2-142)"
        value={katPark}
        onChangeText={setKatPark}
      />

      <Card style={{ marginTop: 16, backgroundColor: "#EFF6FF", borderColor: COLORS.primary }}>
        <Text style={st.cardTitle}>Fiyat özeti{selectedVehicle?.arac_tipi === "suv" ? " (SUV +%15)" : ""}</Text>
        <Row k="Yıkama bedeli" v={`${fiyat.gmv.toFixed(2)} ₺`} />
        <Row k="Koruma fonu" v={`${fiyat.fon.toFixed(2)} ₺`} />
        <Row k="Toplam bloke (escrow)" v={`${fiyat.bloke.toFixed(2)} ₺`} bold />
        <Text style={st.note}>Para onaya kadar bloke tutulur (F2). Onaylayınca yıkamacıya geçer.</Text>
      </Card>

      <Button title="Sipariş Ver" onPress={onSubmit} loading={busy} style={{ marginTop: 8, marginBottom: 40 }} />
    </ScrollView>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={st.priceRow}>
      <Text style={[st.priceK, bold && { fontWeight: "800", color: COLORS.text }]}>{k}</Text>
      <Text style={[st.priceV, bold && { fontWeight: "800" }]}>{v}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  h: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginTop: 14, marginBottom: 8 },
  seg: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  segActive: { borderColor: COLORS.primary, backgroundColor: "#EFF6FF" },
  segText: { fontSize: 13, fontWeight: "600", color: COLORS.muted, textAlign: "center" },
  segTextActive: { color: COLORS.primary },
  segPrice: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  pick: { borderColor: COLORS.primary, borderWidth: 2 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, backgroundColor: "#fff" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  priceK: { fontSize: 14, color: COLORS.muted },
  priceV: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  note: { fontSize: 12, color: COLORS.muted, marginTop: 10 },
});
