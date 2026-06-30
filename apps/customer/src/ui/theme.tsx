/** Minimal ortak UI parcalari (buton, kart, durum rozeti) — tek stil kaynagi. */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import type { OrderStatus } from "@washapp/types";

export const COLORS = {
  primary: "#0B6BCB",
  primaryDark: "#084e95",
  bg: "#F7F9FC",
  card: "#FFFFFF",
  border: "#E3E8EF",
  text: "#0F172A",
  muted: "#64748B",
  ok: "#16A34A",
  warn: "#D97706",
  danger: "#DC2626",
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  style?: ViewStyle;
}) {
  const bg =
    variant === "primary" ? COLORS.primary : variant === "danger" ? COLORS.danger : "transparent";
  const fg = variant === "ghost" ? COLORS.primary : "#fff";
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={[
        s.btn,
        { backgroundColor: bg, opacity: isOff ? 0.55 : 1, borderWidth: variant === "ghost" ? 1 : 0 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[s.btnText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  olusturuldu: "Oluşturuldu",
  eslestirildi: "Eşleştirildi",
  varildi: "Yıkamacı geldi",
  oncesi_foto_ok: "Öncesi fotoğraf tamam",
  yikama: "Yıkanıyor",
  sonrasi_foto_ok: "Sonrası fotoğraf tamam",
  musteri_onay: "Onayınızı bekliyor",
  tamamlandi: "Tamamlandı",
  itiraz: "İtiraz açıldı",
  iptal: "İptal",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const color =
    status === "tamamlandi"
      ? COLORS.ok
      : status === "iptal" || status === "itiraz"
        ? COLORS.danger
        : status === "musteri_onay"
          ? COLORS.warn
          : COLORS.primary;
  return (
    <View style={[s.badge, { backgroundColor: color + "1A", borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", borderColor: COLORS.primary },
  btnText: { fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  badge: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
});
