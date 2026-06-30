/**
 * WashApp tasarim sistemi — tek stil kaynagi (ui-ux-pro-max design system).
 * Premium slate yapi + guven mavisi CTA + temiz yuzeyler. Kirmizi YALNIZ yikici aksiyon.
 * Ikonlar Feather (@expo/vector-icons, Expo Go'da hazir) — emoji ikon YOK.
 */
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { OrderStatus } from "@washapp/types";

export const COLORS = {
  ink: "#0F172A", // birincil metin (slate-900)
  inkSoft: "#334155", // slate-700
  muted: "#64748B", // ikincil metin (slate-500)
  faint: "#94A3B8", // slate-400

  bg: "#F1F5F9", // uygulama arka plani (slate-100)
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC", // slate-50
  border: "#E2E8F0", // slate-200

  brand: "#2563EB", // birincil CTA (blue-600) — guven/temizlik
  brandDark: "#1D4ED8",
  brandSoft: "#EFF6FF", // blue-50 tint
  brandBorder: "#BFDBFE", // blue-200

  success: "#16A34A",
  successSoft: "#DCFCE7",
  warn: "#B45309",
  warnSoft: "#FEF3C7",
  danger: "#DC2626", // YALNIZ yikici (itiraz/iptal)
  dangerSoft: "#FEE2E2",

  onBrand: "#FFFFFF",
} as const;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/** Yumusak kart golgesi (iOS shadow + Android elevation). */
export const SHADOW = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const TYPE = StyleSheet.create({
  display: { fontSize: 30, fontWeight: "800", color: COLORS.ink, letterSpacing: -0.5 },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.ink, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: "700", color: COLORS.ink },
  body: { fontSize: 15, fontWeight: "400", color: COLORS.inkSoft, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.muted },
  caption: { fontSize: 12, fontWeight: "500", color: COLORS.faint },
  // Fiyat/sayi sutunlari icin sabit-genislik rakam (layout kaymasi yok).
  num: { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] },
});

export type IconName = React.ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  size = 20,
  color = COLORS.ink,
  style,
  onPress,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: TextStyle;
  onPress?: () => void;
}) {
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      style={style}
      onPress={onPress}
      suppressHighlighting
      {...(onPress ? { hitSlop: 10, accessibilityRole: "button" } : null)}
    />
  );
}

// ---------------------------------------------------------------------------
// Button — birincil/ikincil/ghost/danger; bas-feedback (scale) + loading + ikon
// ---------------------------------------------------------------------------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  style,
  full = true,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: BtnVariant;
  icon?: IconName;
  style?: ViewStyle;
  full?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  const palette: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: COLORS.brand, fg: COLORS.onBrand },
    secondary: { bg: COLORS.surface, fg: COLORS.ink, border: COLORS.border },
    ghost: { bg: "transparent", fg: COLORS.brand, border: COLORS.brandBorder },
    danger: { bg: COLORS.surface, fg: COLORS.danger, border: COLORS.dangerSoft },
  };
  const p = palette[variant];
  const off = disabled || loading;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, full && { alignSelf: "stretch" }, style]}>
      <Pressable
        onPress={onPress}
        disabled={off}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        android_ripple={{ color: "#00000010" }}
        style={[
          bs.btn,
          {
            backgroundColor: p.bg,
            borderWidth: p.border ? 1 : 0,
            borderColor: p.border,
            opacity: off ? 0.5 : 1,
            ...(variant === "primary" ? SHADOW : null),
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <View style={bs.btnRow}>
            {icon && <Icon name={icon} size={18} color={p.fg} />}
            <Text style={[bs.btnText, { color: p.fg }]}>{title}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function Card({
  children,
  style,
  onPress,
  selected,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  selected?: boolean;
}) {
  const content = (
    <View
      style={[
        bs.card,
        SHADOW,
        selected && { borderColor: COLORS.brand, borderWidth: 2, backgroundColor: COLORS.brandSoft },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: "#00000008", borderless: false }}>
      {content}
    </Pressable>
  );
}

/** Renkli yuvarlak ikon rozeti (kart basliklari icin). */
export function IconChip({ name, tone = "brand" }: { name: IconName; tone?: "brand" | "success" | "warn" | "danger" }) {
  const map = {
    brand: [COLORS.brandSoft, COLORS.brand],
    success: [COLORS.successSoft, COLORS.success],
    warn: [COLORS.warnSoft, COLORS.warn],
    danger: [COLORS.dangerSoft, COLORS.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[bs.chip, { backgroundColor: bg }]}>
      <Icon name={name} size={18} color={fg} />
    </View>
  );
}

const STATUS_META: Record<OrderStatus, { label: string; tone: "brand" | "success" | "warn" | "danger" }> = {
  olusturuldu: { label: "Oluşturuldu", tone: "brand" },
  eslestirildi: { label: "Eşleştirildi", tone: "brand" },
  varildi: { label: "Yıkamacı geldi", tone: "brand" },
  oncesi_foto_ok: { label: "Öncesi fotoğraf", tone: "brand" },
  yikama: { label: "Yıkanıyor", tone: "brand" },
  sonrasi_foto_ok: { label: "Sonrası fotoğraf", tone: "brand" },
  musteri_onay: { label: "Onayını bekliyor", tone: "warn" },
  tamamlandi: { label: "Tamamlandı", tone: "success" },
  itiraz: { label: "İtiraz açıldı", tone: "danger" },
  iptal: { label: "İptal", tone: "danger" },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status] ?? { label: status, tone: "brand" as const };
  const c =
    m.tone === "success" ? COLORS.success : m.tone === "warn" ? COLORS.warn : m.tone === "danger" ? COLORS.danger : COLORS.brand;
  const bg =
    m.tone === "success" ? COLORS.successSoft : m.tone === "warn" ? COLORS.warnSoft : m.tone === "danger" ? COLORS.dangerSoft : COLORS.brandSoft;
  return (
    <View style={[bs.badge, { backgroundColor: bg }]}>
      <View style={[bs.dot, { backgroundColor: c }]} />
      <Text style={[bs.badgeText, { color: c }]}>{m.label}</Text>
    </View>
  );
}

/** "3 Kalkan" guven seridi — urunun ana farki, her ekranda gorunur. */
export function TrustStrip({ compact }: { compact?: boolean }) {
  const items: { icon: IconName; label: string }[] = [
    { icon: "camera", label: "Fotoğraf kanıtı" },
    { icon: "lock", label: "Güvenli ödeme" },
    { icon: "shield", label: "Hasar garantisi" },
  ];
  return (
    <View style={[bs.trust, compact && { paddingVertical: 8 }]}>
      {items.map((it, i) => (
        <View key={it.label} style={bs.trustItem}>
          <Icon name={it.icon} size={15} color={COLORS.brand} />
          <Text style={bs.trustText}>{it.label}</Text>
          {i < items.length - 1 && <View style={bs.trustSep} />}
        </View>
      ))}
    </View>
  );
}

const bs = StyleSheet.create({
  btn: { borderRadius: RADIUS.md, paddingVertical: 15, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minHeight: 50 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { fontSize: 16, fontWeight: "700" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  chip: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  trust: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 11, paddingHorizontal: 12 },
  trustItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, position: "relative" },
  trustText: { fontSize: 11.5, fontWeight: "600", color: COLORS.inkSoft },
  trustSep: { position: "absolute", right: 0, width: 1, height: 18, backgroundColor: COLORS.border },
});
