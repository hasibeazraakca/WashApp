/**
 * WashApp — Hizmet Veren (provider) app giris noktasi.
 * docs/03-yazilim-mimarisi.md §1.1 / §1.4 (ayri binary: kamera + arka plan konum izinleri agir).
 *
 * Bu minimal iskele: navigasyon stub + tek "Hizmet Veren" karsilama ekrani.
 * Gercek ekranlar src/screens/ altinda: is havuzu, varis, ONCESI/SONRASI kamera, kazanc.
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HomeScreen } from "./src/screens/HomeScreen";
import type { ProviderStackParamList } from "./src/navigation/types";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<ProviderStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Home">
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "WashApp Hizmet Veren" }}
            />
            {/* TODO(Faz-1): JobPool, Arrive, EvidenceCamera (vision-camera), Earnings ekranlari */}
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
