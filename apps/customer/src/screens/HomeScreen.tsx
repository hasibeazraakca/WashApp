/** Ana ekran — selamlama + KVKK + "3 Kalkan" + kampanyalar + birincil CTA + siparis listesi. */
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Campaign, Order, Profile } from "@washapp/types";
import { api } from "../lib/api";
import { listCampaigns, listMyOrders } from "../lib/queries";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SHADOW, SPACING, StatusBadge, TrustStrip, TYPE } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

const PAKET_AD: Record<string, string> = { dis_hizli: "Dış Hızlı", standart: "Standart", premium: "Premium Detay" };

export function HomeScreen({ navigation }: { navigation: NavigationProp<CustomerStackParamList> }) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Kampanyalar ikincil icerik — hata siparis akisini bloklamasin (sessiz gec).
    listCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
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

  const onCampaignPress = useCallback((c: Campaign) => {
    // Tiklamayi backend'e bildir (sayac orada artar — altin kural). Sonucu bekleme.
    api.trackCampaignClick(c.id).catch(() => {});
    if (c.hedef_url) Linking.openURL(c.hedef_url).catch(() => {});
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
                <Text style={st.heroTitle}>Aracına hizmet al</Text>
                <Text style={st.heroSub}>Yıkama · bakım · lastik — kapına gelsin</Text>
              </View>
              <IconChip name="droplet" tone="brand" />
            </View>
            <Button title="Hizmetlere Göz At" icon="grid" onPress={() => navigation.navigate("Services")} disabled={!kvkkOk} style={{ marginTop: 14 }} />
          </Card>

          {campaigns.length > 0 && (
            <View style={{ marginTop: SPACING.xl }}>
              <View style={st.sectionRow}>
                <Text style={TYPE.h2}>Kampanyalar</Text>
                <View style={st.tag}><Icon name="tag" size={12} color={COLORS.brand} /><Text style={st.tagText}>Fırsatlar</Text></View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: SPACING.lg, gap: SPACING.md }}
                style={{ marginTop: SPACING.md, marginHorizontal: -SPACING.lg, paddingHorizontal: SPACING.lg }}
              >
                {campaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} onPress={() => onCampaignPress(c)} />
                ))}
              </ScrollView>
            </View>
          )}

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

/** Kampanya afis karti — gorsel + baslik + sponsor. Tiklaninca sayac artar. */
function CampaignCard({ campaign, onPress }: { campaign: Campaign; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.campCard, pressed && { opacity: 0.9 }]}>
      <Image source={{ uri: campaign.gorsel_url }} style={st.campImg} resizeMode="cover" />
      <View style={st.campBody}>
        {!!campaign.sponsor_ad && (
          <View style={st.campSponsor}>
            <Icon name="award" size={11} color={COLORS.brand} />
            <Text style={st.campSponsorText} numberOfLines={1}>{campaign.sponsor_ad}</Text>
          </View>
        )}
        <Text style={st.campTitle} numberOfLines={2}>{campaign.baslik}</Text>
        {!!campaign.aciklama && <Text style={st.campDesc} numberOfLines={2}>{campaign.aciklama}</Text>}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brandSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: "700", color: COLORS.brand },
  campCard: { width: 280, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", ...SHADOW },
  campImg: { width: "100%", height: 130, backgroundColor: COLORS.surfaceAlt },
  campBody: { padding: SPACING.md },
  campSponsor: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  campSponsorText: { fontSize: 11, fontWeight: "700", color: COLORS.brand, flex: 1 },
  campTitle: { fontSize: 15, fontWeight: "800", color: COLORS.ink, letterSpacing: -0.2 },
  campDesc: { fontSize: 12.5, fontWeight: "500", color: COLORS.muted, marginTop: 3, lineHeight: 17 },
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
