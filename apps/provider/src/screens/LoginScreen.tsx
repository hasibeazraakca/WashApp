/** Provider giris — hizmet veren hesabi. Seed hesap on-dolu (pilot). */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, COLORS, Icon, RADIUS, SPACING, TrustStrip, TYPE } from "../ui/theme";
import { useAuth } from "../state/auth";

export function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("washapp.hv@example.com");
  const [password, setPassword] = useState("Test1234!");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  async function onLogin() {
    setErr(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  const field = (active: boolean) => [st.input, active && { borderColor: COLORS.brand, backgroundColor: COLORS.surface }];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={[st.wrap, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={st.brandRow}>
          <View style={st.logoBox}><Icon name="truck" size={26} color={COLORS.onBrand} /></View>
          <Text style={st.logo}>WashApp</Text>
        </View>
        <Text style={st.tag}>Hizmet Veren · iş havuzu, kanıtlı yıkama, kazanç.</Text>

        <View style={{ marginTop: SPACING.xl, marginBottom: SPACING.lg }}><TrustStrip /></View>

        <View style={st.form}>
          <Text style={TYPE.label}>E-posta</Text>
          <View style={field(focus === "email")}>
            <Icon name="mail" size={18} color={COLORS.faint} />
            <TextInput style={st.inputText} value={email} onChangeText={setEmail} onFocus={() => setFocus("email")} onBlur={() => setFocus(null)} autoCapitalize="none" keyboardType="email-address" placeholder="ornek@mail.com" placeholderTextColor={COLORS.faint} />
          </View>

          <Text style={[TYPE.label, { marginTop: SPACING.md }]}>Parola</Text>
          <View style={field(focus === "pw")}>
            <Icon name="lock" size={18} color={COLORS.faint} />
            <TextInput style={st.inputText} value={password} onChangeText={setPassword} onFocus={() => setFocus("pw")} onBlur={() => setFocus(null)} secureTextEntry={!show} placeholder="••••••••" placeholderTextColor={COLORS.faint} />
            <Icon name={show ? "eye-off" : "eye"} size={18} color={COLORS.muted} style={{ padding: 4 }} onPress={() => setShow((s) => !s)} />
          </View>

          {err && (
            <View style={st.errBox}><Icon name="alert-circle" size={15} color={COLORS.danger} /><Text style={st.errText}>{err}</Text></View>
          )}

          <Button title="Giriş Yap" icon="arrow-right" onPress={onLogin} loading={loading} style={{ marginTop: SPACING.lg }} />
          <Text style={st.hint}>Yıkamacı hesabı · Backend canlı (Frankfurt/AB · KVKK)</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.xl, flexGrow: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: { width: 52, height: 52, borderRadius: 15, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  logo: { ...TYPE.display, fontSize: 34 },
  tag: { ...TYPE.body, color: COLORS.muted, marginTop: 12 },
  form: { marginTop: SPACING.sm },
  input: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, backgroundColor: COLORS.surfaceAlt, marginTop: 6, minHeight: 52 },
  inputText: { flex: 1, fontSize: 16, color: COLORS.ink, paddingVertical: 14 },
  errBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.dangerSoft, borderRadius: RADIUS.sm, padding: 10, marginTop: 12 },
  errText: { flex: 1, color: COLORS.danger, fontSize: 13, fontWeight: "500" },
  hint: { ...TYPE.caption, textAlign: "center", marginTop: 16 },
});
