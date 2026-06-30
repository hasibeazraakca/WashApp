/** Ana ekran — profil/KVKK durumu + "Yeni Sipariş" + siparişlerim listesi. */
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import type { Order, Profile } from "@washapp/types";
import { api } from "../lib/api";
import { listMyOrders } from "../lib/queries";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, StatusBadge } from "../ui/theme";
import type { CustomerStackParamList } from "../navigation/types";

export function HomeScreen({ navigation }: { navigation: NavigationProp<CustomerStackParamList> }) {
  const { signOut } = useAuth();
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
      Alert.alert("Hata", e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onKvkk() {
    try {
      const me = await api.updateMe({ kvkk_onay: true });
      setProfile(me);
      Alert.alert("Teşekkürler", "KVKK aydınlatma onayı alındı. Artık sipariş verebilirsiniz.");
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "İşlem başarısız");
    }
  }

  const kvkkOk = !!profile?.kvkk_onay_ts;

  return (
    <View style={st.wrap}>
      <View style={st.header}>
        <View>
          <Text style={st.hi}>Merhaba{profile ? `, ${profile.ad_soyad}` : ""}</Text>
          <Text style={st.role}>{profile?.email}</Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={st.signout}>Çıkış</Text>
        </Pressable>
      </View>

      {!kvkkOk && profile && (
        <Card style={{ borderColor: COLORS.warn }}>
          <Text style={st.cardTitle}>KVKK onayı gerekli</Text>
          <Text style={st.cardText}>
            Sipariş verebilmek için aydınlatma metnini onaylayın (verileriniz Frankfurt/AB'de işlenir).
          </Text>
          <Button title="Onaylıyorum" onPress={onKvkk} variant="ghost" style={{ marginTop: 10 }} />
        </Card>
      )}

      <Button
        title="+ Yeni Sipariş"
        onPress={() => navigation.navigate("NewOrder")}
        disabled={!kvkkOk}
        style={{ marginBottom: 16 }}
      />

      <Text style={st.section}>Siparişlerim</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={st.empty}>Henüz siparişiniz yok. "Yeni Sipariş" ile başlayın.</Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("OrderTracking", { orderId: item.id })}>
            <Card>
              <View style={st.row}>
                <Text style={st.paket}>{item.paket}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={st.meta}>
                {new Date(item.created_at).toLocaleString("tr-TR")} · #{item.id.slice(0, 8)}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  hi: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  role: { fontSize: 13, color: COLORS.muted },
  signout: { color: COLORS.danger, fontWeight: "600" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardText: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  empty: { color: COLORS.muted, textAlign: "center", marginTop: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paket: { fontSize: 16, fontWeight: "700", color: COLORS.text, textTransform: "capitalize" },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
});
