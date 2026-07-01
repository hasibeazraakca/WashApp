/**
 * Zorunlu ilk kurulum (Google Play) — ad-soyad + GSM + konum ZORUNLU;
 * bildirim izni istenir; KVKK aydinlatma (konum+bildirim rizasi dahil) onaylanir.
 * Onay -> PATCH /me { ad_soyad, telefon, kvkk_onay } -> gate profili tekrar okur.
 */
import React, { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Profile } from "@washapp/types";
import { api } from "../lib/api";
import { KVKK_METNI } from "../lib/consent";
import { requestLocation, requestNotifications } from "../lib/permissions";
import { useAuth } from "../state/auth";
import { Button, Card, COLORS, Icon, IconChip, RADIUS, SPACING, TYPE } from "../ui/theme";

/** 10 haneli TR GSM'i +90 formatina getir (0/90 on ekleri temizlenir). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 || !d.startsWith("5")) return null;
  return `+90${d}`;
}

export function OnboardingScreen({ profile, onDone }: { profile: Profile | null; onDone: () => void }) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [ad, setAd] = useState(profile?.ad_soyad && profile.ad_soyad !== "-" ? profile.ad_soyad : "");
  const [tel, setTel] = useState("");
  const [locGranted, setLocGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [kvkk, setKvkk] = useState(false);
  const [showMetin, setShowMetin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const phoneOk = useMemo(() => normalizePhone(tel) !== null, [tel]);
  const canSubmit = ad.trim().length >= 3 && phoneOk && locGranted && kvkk;

  async function onLocation() {
    const r = await requestLocation();
    setLocGranted(r.granted);
    if (!r.granted) {
      Alert.alert("Konum gerekli", "Siparişlerin doğru adreste doğrulanabilmesi için konum izni zorunludur. Lütfen ayarlardan izin verin.");
    }
  }

  async function onNotif() {
    const ok = await requestNotifications();
    setNotifGranted(ok);
  }

  async function onSubmit() {
    const telefon = normalizePhone(tel);
    if (!ad.trim() || !telefon || !locGranted || !kvkk) return;
    setBusy(true);
    try {
      await api.updateMe({ ad_soyad: ad.trim(), telefon, kvkk_onay: true });
      onDone();
    } catch (e) {
      Alert.alert("Kaydedilemedi", e instanceof Error ? e.message : "Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const field = (active: boolean) => [st.input, active && { borderColor: COLORS.brand, backgroundColor: COLORS.surface }];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={st.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={TYPE.label}>Son bir adım</Text>
            <Text style={TYPE.h1}>Hesabını tamamla</Text>
          </View>
          <Icon name="log-out" size={20} color={COLORS.muted} style={{ padding: 8 }} onPress={signOut} />
        </View>
        <Text style={[TYPE.body, { marginTop: 6 }]}>Hizmet verebilmemiz için birkaç bilgi ve izin gerekiyor.</Text>

        <View style={{ height: SPACING.lg }} />

        <Text style={TYPE.label}>Ad Soyad</Text>
        <View style={field(focus === "ad")}>
          <Icon name="user" size={18} color={COLORS.faint} />
          <TextInput style={st.inputText} value={ad} onChangeText={setAd} onFocus={() => setFocus("ad")} onBlur={() => setFocus(null)} placeholder="Adınız Soyadınız" placeholderTextColor={COLORS.faint} />
        </View>

        <Text style={[TYPE.label, { marginTop: SPACING.md }]}>Cep telefonu (GSM)</Text>
        <View style={field(focus === "tel")}>
          <Icon name="phone" size={18} color={COLORS.faint} />
          <Text style={st.prefix}>+90</Text>
          <TextInput style={st.inputText} value={tel} onChangeText={setTel} onFocus={() => setFocus("tel")} onBlur={() => setFocus(null)} keyboardType="phone-pad" placeholder="5XX XXX XX XX" placeholderTextColor={COLORS.faint} maxLength={13} />
          {phoneOk && <Icon name="check" size={16} color={COLORS.success} />}
        </View>

        <Text style={[TYPE.label, { marginTop: SPACING.lg, marginBottom: SPACING.sm }]}>İzinler</Text>
        <Card style={{ marginBottom: SPACING.sm }}>
          <PermRow icon="map-pin" title="Konum" desc="Sipariş adresini doğrulamak için (zorunlu)" granted={locGranted} onPress={onLocation} />
        </Card>
        <Card>
          <PermRow icon="bell" title="Bildirim" desc="Sipariş durumu ve hatırlatmalar için" granted={notifGranted} onPress={onNotif} optional />
        </Card>

        <Pressable onPress={() => setKvkk((v) => !v)} style={st.kvkkRow} hitSlop={6}>
          <View style={[st.checkbox, kvkk && { backgroundColor: COLORS.brand, borderColor: COLORS.brand }]}>
            {kvkk && <Icon name="check" size={14} color={COLORS.onBrand} />}
          </View>
          <Text style={st.kvkkText}>
            <Text style={{ fontWeight: "700", color: COLORS.ink }}>KVKK aydınlatma metnini</Text> okudum; konum ve bildirim izinlerinin belirtilen amaçlarla işlenmesini onaylıyorum.
          </Text>
        </Pressable>
        <Pressable onPress={() => setShowMetin((v) => !v)} hitSlop={6}>
          <Text style={st.link}>{showMetin ? "Metni gizle" : "Aydınlatma metnini oku"}</Text>
        </Pressable>
        {showMetin && (
          <Card style={{ marginTop: SPACING.sm, backgroundColor: COLORS.surfaceAlt }}>
            <Text style={st.metin}>{KVKK_METNI}</Text>
          </Card>
        )}

        <Button title="Onayla ve Devam Et" icon="arrow-right" onPress={onSubmit} loading={busy} disabled={!canSubmit} style={{ marginTop: SPACING.lg }} />
        {!canSubmit && <Text style={st.hint}>Ad-soyad, geçerli GSM, konum izni ve KVKK onayı gereklidir.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PermRow({ icon, title, desc, granted, onPress, optional }: { icon: "map-pin" | "bell"; title: string; desc: string; granted: boolean; onPress: () => void; optional?: boolean }) {
  return (
    <View style={st.permRow}>
      <IconChip name={icon} tone={granted ? "success" : "brand"} />
      <View style={{ flex: 1 }}>
        <Text style={TYPE.h2}>{title}{optional ? " " : ""}<Text style={st.opt}>{optional ? "(opsiyonel)" : ""}</Text></Text>
        <Text style={TYPE.caption}>{desc}</Text>
      </View>
      {granted ? (
        <View style={st.grantedTag}><Icon name="check" size={14} color={COLORS.success} /><Text style={st.grantedText}>Verildi</Text></View>
      ) : (
        <Button title="İzin ver" variant="secondary" full={false} onPress={onPress} style={{ minWidth: 92 }} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "flex-start" },
  input: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, backgroundColor: COLORS.surfaceAlt, marginTop: 6, minHeight: 52 },
  inputText: { flex: 1, fontSize: 16, color: COLORS.ink, paddingVertical: 14 },
  prefix: { fontSize: 16, fontWeight: "700", color: COLORS.inkSoft },
  permRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  opt: { fontSize: 12, fontWeight: "500", color: COLORS.faint },
  grantedTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.successSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 6 },
  grantedText: { fontSize: 12, fontWeight: "700", color: COLORS.success },
  kvkkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: SPACING.lg },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  kvkkText: { flex: 1, fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 20 },
  link: { color: COLORS.brand, fontWeight: "700", fontSize: 13, marginTop: 10 },
  metin: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 19 },
  hint: { ...TYPE.caption, textAlign: "center", marginTop: 10 },
});
