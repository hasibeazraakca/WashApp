/** Ana ekran — selamlama + KVKK + "3 Kalkan" + birincil CTA + siparis listesi. */
import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Order, Profile } from "@washapp/types";
import { api } from "../lib/api";
import { listMyOrders } from "../lib/queries";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, StatusBadge, TrustStrip, TYPE } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

const PAKET_AD: Record<string, string> = { dis_hizli: "Dış Hızlı", standart: "Standart", premium: "Premium Detay" };

export function HomeScreen({ navigation }: { navigation: NavigationProp<CustomerStackParamList> }) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, list] = await Promise.all([api.me(), listMyOrders()]);
      setProfile(me);
      setOrders(list);
    } catch (e) {
      Alert.alert("Bağlantı hatası", e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function onKvkk() {
    try {
      setProfile(await api.updateMe({ kvkk_onay: true }));
      Alert.alert("Teşekkürler", "Onay alındı — artık sipariş verebilirsiniz.");
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "İşlem başarısız");
    }
  }

  const kvkkOk = !!profile?.kvkk_onay_ts;
  const initial = (profile?.ad_soyad ?? "?").trim().charAt(0).toUpperCase();

  return (
    <FlatList
      style={{ backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: SPACING.lg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      data={orders}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.brand} />}
      ListHeaderComponent={
        <View>
          <View style={st.header}>
            <View style={{ flex: 1 }}>
              <Text style={TYPE.label}>Hoş geldiniz</Text>
              <Text style={TYPE.h1} numberOfLines={1}>{profile?.ad_soyad ?? "—"}</Text>
            </View>
            <View style={st.avatar}><Text style={st.avatarText}>{initial}</Text></View>
            <Icon name="log-out" size={20} color={COLORS.muted} style={{ padding: 8 }} onPress={signOut} />
          </View>

          <View style={{ marginVertical: SPACING.lg }}><TrustStrip /></View>

          {!kvkkOk && profile && (
            <Card style={{ borderColor: COLORS.warnSoft, backgroundColor: COLORS.warnSoft }}>
              <View style={st.kvkkRow}>
                <IconChip name="file-text" tone="warn" />
                <View style={{ flex: 1 }}>
                  <Text style={TYPE.h2}>KVKK onayı gerekli</Text>
                  <Text style={[TYPE.body, { fontSize: 13, marginTop: 2 }]}>Verileriniz Frankfurt/AB'de işlenir. Onaylayın, sipariş verin.</Text>
                </View>
              </View>
              <Button title="Aydınlatma metnini onaylıyorum" variant="secondary" onPress={onKvkk} style={{ marginTop: 12 }} />
            </Card>
          )}

          <Card style={st.heroCard}>
            <View style={st.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.heroTitle}>Aracını yıkat</Text>
                <Text style={st.heroSub}>Kapına gelsin · 30-45 dk · kanıtlı</Text>
              </View>
              <IconChip name="droplet" tone="brand" />
            </View>
            <Button title="Yeni Sipariş Ver" icon="plus" onPress={() => navigation.navigate("NewOrder")} disabled={!kvkkOk} style={{ marginTop: 14 }} />
          </Card>

          <Text style={[TYPE.h2, { marginTop: SPACING.xl, marginBottom: SPACING.md }]}>Siparişlerim</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={st.empty}>
          <View style={st.emptyIcon}><Icon name="inbox" size={28} color={COLORS.faint} /></View>
          <Text style={st.emptyTitle}>Henüz siparişiniz yok</Text>
          <Text style={st.emptyText}>"Yeni Sipariş Ver" ile ilk yıkamanızı başlatın.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => navigation.navigate("OrderTracking", { orderId: item.id })} style={{ marginBottom: SPACING.md }}>
          <View style={st.orderRow}>
            <IconChip name="truck" tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={TYPE.h2}>{PAKET_AD[item.paket] ?? item.paket}</Text>
              <Text style={TYPE.caption}>{new Date(item.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · #{item.id.slice(0, 6)}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={COLORS.faint} />
          </View>
          <View style={{ marginTop: 12 }}><StatusBadge status={item.status} /></View>
        </Card>
      )}
    />
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.onBrand, fontSize: 17, fontWeight: "800" },
  kvkkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroCard: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroTitle: { fontSize: 19, fontWeight: "800", color: "#fff" },
  heroSub: { fontSize: 13, color: "#CBD5E1", marginTop: 3 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  empty: { alignItems: "center", paddingVertical: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { ...TYPE.h2 },
  emptyText: { ...TYPE.body, fontSize: 13, color: COLORS.muted, textAlign: "center", marginTop: 4 },
});
