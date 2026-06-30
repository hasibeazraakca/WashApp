import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PROVIDER_MIN_RATING, priceBreakdown } from "@washapp/config";

/**
 * Minimal karsilama ekrani — iskele dogrulamasi.
 * Hizmet verenin tipik kazancini (payout) paketten dogru gosterir.
 */
export function HomeScreen() {
  const p = priceBreakdown();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WashApp Hizmet Veren</Text>
      <Text style={styles.subtitle}>İş havuzu · kanıt · kazanç</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Örnek iş kazancı</Text>
        <Text style={styles.line}>GMV: {p.gmv} TL</Text>
        <Text style={styles.line}>Eline geçen (payout): {p.providerPayout} TL</Text>
        <Text style={styles.line}>Aktiflik puan eşiği: {PROVIDER_MIN_RATING}</Text>
      </View>
      {/* TODO(Faz-1): "VARDIM" akisi (geofence) + ONCESI/SONRASI in-app kamera (anti-fraud) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 16, color: "#555", marginTop: 4, marginBottom: 24 },
  card: { width: "100%", borderRadius: 12, padding: 16, backgroundColor: "#eef6f0" },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  line: { fontSize: 14, color: "#333", marginVertical: 2 },
});
