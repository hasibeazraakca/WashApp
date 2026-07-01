/** Randevu talebi — yikama disi hizmet (yag/lastik/bakim). Fotosuz akis:
 *  arac + plaza + tercih notu -> FastAPI POST /services/requests. */
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Plaza, Vehicle } from "@washapp/types";
import { api } from "../lib/api";
import { listMyVehicles, listPlazalar } from "../lib/queries";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, TYPE, type IconName } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

export function ServiceRequestScreen() {
  const nav = useNavigation<NavigationProp<CustomerStackParamList>>();
  const { params } = useRoute<RouteProp<CustomerStackParamList, "ServiceRequest">>();
  const insets = useSafeAreaInsets();

  const [plazalar, setPlazalar] = useState<Plaza[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plazaId, setPlazaId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [katPark, setKatPark] = useState("");
  const [notlar, setNotlar] = useState("");
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

  async function onSubmit() {
    setBusy(true);
    try {
      await api.createServiceRequest({
        hizmet_id: params.hizmetId,
        arac_id: vehicleId ?? undefined,
        plaza_id: plazaId ?? undefined,
        kat_park_no: katPark || undefined,
        notlar: notlar || undefined,
      });
      Alert.alert("Talebiniz alındı", "Ekibimiz en kısa sürede sizinle iletişime geçip randevu planlayacak.", [
        { text: "Tamam", onPress: () => nav.navigate("Home") },
      ]);
    } catch (e) {
      Alert.alert("Talep oluşturulamadı", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  const section = (ic: IconName, title: string) => (
    <View style={st.sectionHead}><Icon name={ic} size={16} color={COLORS.muted} /><Text style={st.sectionTitle}>{title}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 24 }}>
        <Card style={st.heroCard}>
          <View style={st.heroRow}>
            <IconChip name="calendar" tone="warn" />
            <View style={{ flex: 1 }}>
              <Text style={TYPE.h2}>{params.hizmetAd}</Text>
              <Text style={TYPE.caption}>Tahmini ~{Number(params.tabanFiyat).toFixed(0)}₺{params.sureDk ? ` · ${params.sureDk} dk` : ""} · randevulu</Text>
            </View>
          </View>
          <View style={st.note}>
            <Icon name="info" size={13} color={COLORS.warn} />
            <Text style={st.noteText}>Bu hizmet randevuludur. Fiyat araç/parçaya göre kesinleşir; ekibimiz teyit eder.</Text>
          </View>
        </Card>

        {section("truck", "Araç")}
        {vehicles.map((v) => (
          <Card key={v.id} onPress={() => setVehicleId(v.id)} selected={vehicleId === v.id} style={{ marginBottom: SPACING.sm }}>
            <View style={st.rowBetween}>
              <View style={st.rowGap}><Icon name="truck" size={18} color={COLORS.inkSoft} /><Text style={TYPE.h2}>{v.plaka}</Text><Text style={TYPE.caption}>{v.arac_tipi}</Text></View>
              <Icon name={vehicleId === v.id ? "check-circle" : "circle"} size={22} color={vehicleId === v.id ? COLORS.brand : COLORS.border} />
            </View>
          </Card>
        ))}

        {section("map-pin", "Konum")}
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

        {section("message-square", "Not (opsiyonel)")}
        <View style={[st.inputWrap, { alignItems: "flex-start" }]}>
          <Icon name="edit-3" size={18} color={COLORS.faint} style={{ marginTop: 14 }} />
          <TextInput style={[st.input, { minHeight: 80, textAlignVertical: "top" }]} placeholder="Tercih ettiğiniz gün/saat, araç modeli, ek isteğiniz…" value={notlar} onChangeText={setNotlar} multiline placeholderTextColor={COLORS.faint} />
        </View>
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title="Randevu Talebi Gönder" icon="send" onPress={onSubmit} loading={busy} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  heroCard: { backgroundColor: COLORS.warnSoft, borderColor: COLORS.warnSoft },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  note: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  noteText: { flex: 1, fontSize: 12, color: COLORS.inkSoft, lineHeight: 17 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  sectionTitle: { ...TYPE.label, textTransform: "uppercase", letterSpacing: 0.5 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, backgroundColor: COLORS.surface, minHeight: 50, marginTop: 4 },
  input: { flex: 1, fontSize: 15, color: COLORS.ink, paddingVertical: 13 },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
});
