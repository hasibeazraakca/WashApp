/** Provider ana ekran — iş havuzu. Açık işler (üstlenilebilir) + aktif işlerim.
 *  Sipariş (yıkama) ve randevu talepleri tek listede; müsaitlik anahtarı. */
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OrderJob, ServiceRequestDetail } from "@washapp/types";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { currentGps } from "../lib/upload";
import { useAuth } from "../state/auth";
import { Card, COLORS, Icon, IconChip, RADIUS, SPACING, StatusBadge, TYPE } from "../ui/theme";
import type { ProviderStackParamList } from "../navigation/types";

const TALEP_DURUM: Record<string, { label: string; tone: "brand" | "success" | "warn" | "danger" }> = {
  yeni: { label: "Yeni", tone: "brand" },
  uslenildi: { label: "Üstlenildi", tone: "brand" },
  teklif_verildi: { label: "Fiyat verildi", tone: "warn" },
  planlandi: { label: "Planlandı", tone: "brand" },
  yolda: { label: "Yolda", tone: "brand" },
  tamamlandi: { label: "Tamamlandı", tone: "success" },
  iptal: { label: "İptal", tone: "danger" },
};

export function JobsScreen({ navigation }: { navigation: NavigationProp<ProviderStackParamList> }) {
  const { signOut, session } = useAuth();
  const insets = useSafeAreaInsets();
  const [openOrders, setOpenOrders] = useState<OrderJob[]>([]);
  const [myOrders, setMyOrders] = useState<OrderJob[]>([]);
  const [openReq, setOpenReq] = useState<ServiceRequestDetail[]>([]);
  const [myReq, setMyReq] = useState<ServiceRequestDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [musait, setMusait] = useState(false);
  const [busyMusait, setBusyMusait] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [oo, mo, orq, mrq] = await Promise.all([
        api.listOpenOrders(), api.listMyJobs(), api.listOpenRequests(), api.listMyRequests(),
      ]);
      setOpenOrders(oo); setMyOrders(mo); setOpenReq(orq); setMyReq(mrq);
    } catch (e) {
      Alert.alert("Bağlantı hatası", e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggleMusait(val: boolean) {
    setBusyMusait(true);
    try {
      const g = await currentGps();
      const { error } = await supabase.schema("app").from("hizmet_veren_konum").upsert({
        hizmet_veren_id: session?.user.id,
        konum: `SRID=4326;POINT(${g.lon} ${g.lat})`,
        musait: val,
        guncellendi: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      setMusait(val);
    } catch (e) {
      Alert.alert("Müsaitlik güncellenemedi", e instanceof Error ? e.message : "");
    } finally {
      setBusyMusait(false);
    }
  }

  const empty = openOrders.length + myOrders.length + openReq.length + myReq.length === 0;

  return (
    <ScrollView
      style={{ backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: SPACING.lg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.brand} />}
    >
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={TYPE.label}>Hizmet Veren</Text>
          <Text style={TYPE.h1}>İş Havuzu</Text>
        </View>
        <Icon name="log-out" size={20} color={COLORS.muted} style={{ padding: 8 }} onPress={signOut} />
      </View>

      <Card style={musait ? st.musaitCardOn : st.musaitCard}>
        <View style={st.rowBetween}>
          <View style={st.rowGap}>
            <IconChip name={musait ? "check-circle" : "power"} tone={musait ? "success" : "brand"} />
            <View>
              <Text style={TYPE.h2}>{musait ? "Müsaitsin" : "Müsait değilsin"}</Text>
              <Text style={TYPE.caption}>{musait ? "Yeni işler sana yönlendirilir" : "Aç, konumunla iş al"}</Text>
            </View>
          </View>
          <Switch value={musait} onValueChange={toggleMusait} disabled={busyMusait} trackColor={{ true: COLORS.success }} />
        </View>
      </Card>

      <Section title="Açık işler" icon="inbox" count={openOrders.length + openReq.length} />
      {openOrders.map((o) => (
        <OrderCard key={o.order_id} job={o} onPress={() => navigation.navigate("OrderJob", { orderId: o.order_id })} />
      ))}
      {openReq.map((r) => (
        <RequestCard key={r.id} req={r} onPress={() => navigation.navigate("RequestJob", { talepId: r.id })} />
      ))}
      {openOrders.length + openReq.length === 0 && <Text style={st.emptyLine}>Şu an açık iş yok.</Text>}

      <Section title="Aktif işlerim" icon="briefcase" count={myOrders.length + myReq.length} />
      {myOrders.map((o) => (
        <OrderCard key={o.order_id} job={o} onPress={() => navigation.navigate("OrderJob", { orderId: o.order_id })} />
      ))}
      {myReq.map((r) => (
        <RequestCard key={r.id} req={r} onPress={() => navigation.navigate("RequestJob", { talepId: r.id })} />
      ))}
      {myOrders.length + myReq.length === 0 && <Text style={st.emptyLine}>Üstlendiğin aktif iş yok.</Text>}

      {empty && !loading && (
        <View style={st.emptyBox}>
          <Icon name="coffee" size={28} color={COLORS.faint} />
          <Text style={st.emptyText}>Henüz iş yok. Aşağı çekip yenile.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Section({ title, icon, count }: { title: string; icon: "inbox" | "briefcase"; count: number }) {
  return (
    <View style={st.sectionHead}>
      <Icon name={icon} size={16} color={COLORS.muted} />
      <Text style={st.sectionTitle}>{title}</Text>
      <View style={st.countPill}><Text style={st.countText}>{count}</Text></View>
    </View>
  );
}

function OrderCard({ job, onPress }: { job: OrderJob; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ marginBottom: SPACING.sm }}>
      <View style={st.rowGap}>
        <IconChip name="droplet" tone="brand" />
        <View style={{ flex: 1 }}>
          <View style={st.rowBetween}>
            <Text style={TYPE.h2}>Yıkama · {job.paket}</Text>
            <Text style={st.money}>{Number(job.hizmet_veren_eline ?? job.gmv).toFixed(0)}₺</Text>
          </View>
          <Text style={TYPE.caption}>{job.plaka ?? "—"} · {job.plaza_ad ?? "Plaza"}{job.kat_park_no ? ` · ${job.kat_park_no}` : ""}</Text>
          <View style={{ marginTop: 8 }}><StatusBadge status={job.status} /></View>
        </View>
        <Icon name="chevron-right" size={20} color={COLORS.faint} />
      </View>
    </Card>
  );
}

function RequestCard({ req, onPress }: { req: ServiceRequestDetail; onPress: () => void }) {
  const d = TALEP_DURUM[req.durum] ?? { label: req.durum, tone: "brand" as const };
  const fiyat = req.fiyat_teklifi ?? req.tahmini_fiyat;
  const c = d.tone === "success" ? COLORS.success : d.tone === "warn" ? COLORS.warn : d.tone === "danger" ? COLORS.danger : COLORS.brand;
  const bg = d.tone === "success" ? COLORS.successSoft : d.tone === "warn" ? COLORS.warnSoft : d.tone === "danger" ? COLORS.dangerSoft : COLORS.brandSoft;
  return (
    <Card onPress={onPress} style={{ marginBottom: SPACING.sm }}>
      <View style={st.rowGap}>
        <IconChip name="tool" tone="warn" />
        <View style={{ flex: 1 }}>
          <View style={st.rowBetween}>
            <Text style={TYPE.h2} numberOfLines={1}>{req.hizmet_ad ?? "Hizmet"}</Text>
            <Text style={st.money}>{req.fiyat_teklifi ? "" : "~"}{Number(fiyat ?? 0).toFixed(0)}₺</Text>
          </View>
          <Text style={TYPE.caption}>{req.plaka ?? "—"}{req.plaza_ad ? ` · ${req.plaza_ad}` : ""}{req.kategori_ad ? ` · ${req.kategori_ad}` : ""}</Text>
          <View style={[st.badge, { backgroundColor: bg, marginTop: 8 }]}>
            <View style={[st.dot, { backgroundColor: c }]} /><Text style={[st.badgeText, { color: c }]}>{d.label}</Text>
          </View>
        </View>
        <Icon name="chevron-right" size={20} color={COLORS.faint} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: SPACING.md },
  musaitCard: { marginBottom: SPACING.md },
  musaitCardOn: { marginBottom: SPACING.md, borderColor: COLORS.success, backgroundColor: COLORS.successSoft },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  sectionTitle: { ...TYPE.label, textTransform: "uppercase", letterSpacing: 0.5 },
  countPill: { backgroundColor: COLORS.border, borderRadius: RADIUS.pill, minWidth: 20, paddingHorizontal: 7, paddingVertical: 1, alignItems: "center" },
  countText: { fontSize: 11, fontWeight: "800", color: COLORS.inkSoft },
  money: { fontSize: 15, fontWeight: "800", color: COLORS.ink },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  emptyLine: { ...TYPE.caption, paddingVertical: 6 },
  emptyBox: { alignItems: "center", gap: 10, paddingVertical: 32 },
  emptyText: { ...TYPE.body, fontSize: 13, color: COLORS.muted },
});
