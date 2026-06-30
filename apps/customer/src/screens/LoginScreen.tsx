/** Giris ekrani — Supabase Auth (email/parola). Demo icin seed kullanici on-dolu. */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, COLORS } from "../ui/theme";
import { useAuth } from "../state/auth";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("washapp.musteri@example.com");
  const [password, setPassword] = useState("Test1234!");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={st.wrap}
    >
      <Text style={st.logo}>WashApp</Text>
      <Text style={st.sub}>Kapıda mobil oto yıkama</Text>

      <View style={st.form}>
        <Text style={st.label}>E-posta</Text>
        <TextInput
          style={st.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="ornek@mail.com"
        />
        <Text style={st.label}>Parola</Text>
        <TextInput style={st.input} value={password} onChangeText={setPassword} secureTextEntry />
        {err && <Text style={st.err}>{err}</Text>}
        <Button title="Giriş Yap" onPress={onLogin} loading={loading} style={{ marginTop: 8 }} />
        <Text style={st.hint}>
          Demo: seed müşteri hesabı ön-dolu. Backend canlı (Render + Supabase Frankfurt).
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: COLORS.bg },
  logo: { fontSize: 40, fontWeight: "800", color: COLORS.primary, textAlign: "center" },
  sub: { fontSize: 15, color: COLORS.muted, textAlign: "center", marginTop: 4, marginBottom: 28 },
  form: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.text, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
  hint: { fontSize: 12, color: COLORS.muted, textAlign: "center", marginTop: 16 },
});
