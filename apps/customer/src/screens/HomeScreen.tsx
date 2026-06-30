import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AOV_TRY, priceBreakdown } from "@washapp/config";

/**
 * Minimal karsilama ekrani — iskele dogrulamasi.
 * Fiyat sabitlerinin paketten dogru aktigini gosterir (komisyon 0.22, fon 15, AOV 450).
 */
export function HomeScreen() {
  const p = priceBreakdown(AOV_TRY);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WashApp Müşteri</Text>
      <Text style={styles.subtitle}>Kapıda mobil oto yıkama</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Örnek fiyat (AOV {p.gmv} TL)</Text>
        <Text style={styles.line}>Komisyon (%{p.commissionRate * 100}): {p.commission} TL</Text>
        <Text style={styles.line}>Koruma fonu: {p.protectionFund} TL</Text>
        <Text style={styles.line}>Toplam bloke (escrow): {p.totalHold} TL</Text>
      </View>
      {/* TODO(Faz-1): "Siparis Ver" akisi (geofence + paket + escrow provizyon) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 16, color: "#555", marginTop: 4, marginBottom: 24 },
  card: { width: "100%", borderRadius: 12, padding: 16, backgroundColor: "#f2f4f7" },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  line: { fontSize: 14, color: "#333", marginVertical: 2 },
});
