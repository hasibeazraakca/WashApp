/** Hizmet katalogu — kategoriye gore hizmetler. Yikama/detay -> siparis (foto+escrow),
 *  yag/lastik/bakim -> randevu talebi (fotosuz). Katalog Supabase RLS'ten okunur. */
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Service, ServiceCategory } from "@washapp/types";
import { listServiceCategories, listServices } from "../lib/queries";
import { Card, COLORS, Icon, IconChip, RADIUS, SPACING, TYPE, type IconName } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

// Feather ikon adi DB'den serbest metin gelir; gecersizse guvenli varsayilan.
const SAFE_ICONS = new Set<string>([
  "droplet", "wind", "disc", "tool", "grid", "zap", "star", "award",
  "filter", "settings", "battery-charging", "package",
]);
const icon = (n: string): IconName => (SAFE_ICONS.has(n) ? (n as IconName) : "tool");

export function ServicesScreen({ navigation }: { navigation: NavigationProp<CustomerStackParamList> }) {
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([listServiceCategories(), listServices()]);
      setCats(c);
      setServices(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const byCat = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of services) {
      const arr = m.get(s.kategori_id) ?? [];
      arr.push(s);
      m.set(s.kategori_id, arr);
    }
    return m;
  }, [services]);

  function onServicePress(s: Service) {
    if (s.randevu_modu) {
      navigation.navigate("ServiceRequest", { hizmetId: s.id, hizmetAd: s.ad, tabanFiyat: s.taban_fiyat, sureDk: s.sure_dk });
    } else {
      navigation.navigate("NewOrder", { hizmetId: s.id, hizmetKod: s.kod, hizmetAd: s.ad, tabanFiyat: s.taban_fiyat });
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center" }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 24 }}>
      <Text style={[TYPE.body, { marginBottom: SPACING.md }]}>Aracınıza gelen tüm hizmetler tek yerde. Yıkama ve detay foto‑kanıtlı; bakım/lastik randevu ile.</Text>
      {cats.map((cat) => {
        const items = byCat.get(cat.id) ?? [];
        if (items.length === 0) return null;
        return (
          <View key={cat.id} style={{ marginBottom: SPACING.lg }}>
            <View style={st.catHead}>
              <IconChip name={icon(cat.ikon)} tone="brand" />
              <Text style={TYPE.h2}>{cat.ad}</Text>
            </View>
            {items.map((s) => (
              <Card key={s.id} onPress={() => onServicePress(s)} style={{ marginTop: SPACING.sm }}>
                <View style={st.row}>
                  <Icon name={icon(s.ikon)} size={20} color={COLORS.inkSoft} />
                  <View style={{ flex: 1 }}>
                    <View style={st.titleRow}>
                      <Text style={TYPE.h2} numberOfLines={1}>{s.ad}</Text>
                      {s.randevu_modu ? (
                        <View style={[st.tag, { backgroundColor: COLORS.warnSoft }]}><Text style={[st.tagText, { color: COLORS.warn }]}>Randevu</Text></View>
                      ) : (
                        <View style={[st.tag, { backgroundColor: COLORS.brandSoft }]}><Icon name="camera" size={10} color={COLORS.brand} /><Text style={[st.tagText, { color: COLORS.brand }]}>Kanıtlı</Text></View>
                      )}
                    </View>
                    {!!s.aciklama && <Text style={TYPE.caption} numberOfLines={2}>{s.aciklama}</Text>}
                    <View style={st.metaRow}>
                      <Text style={st.price}>{s.randevu_modu ? "~" : ""}{Number(s.taban_fiyat).toFixed(0)}₺</Text>
                      {!!s.sure_dk && <><Text style={st.metaDot}>·</Text><Icon name="clock" size={12} color={COLORS.faint} /><Text style={st.meta}>{s.sure_dk} dk</Text></>}
                    </View>
                  </View>
                  <Icon name="chevron-right" size={20} color={COLORS.faint} />
                </View>
              </Card>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  catHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10.5, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  price: { fontSize: 15, fontWeight: "800", color: COLORS.ink },
  metaDot: { color: COLORS.faint, fontSize: 13 },
  meta: { fontSize: 12, fontWeight: "500", color: COLORS.faint },
});
