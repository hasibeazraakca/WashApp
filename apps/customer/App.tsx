/**
 * WashApp — Musteri (customer) app giris noktasi.
 * docs/03-yazilim-mimarisi.md §1.1 (Expo prebuild + dev-client), §1.3 (React Navigation 7 + TanStack Query).
 *
 * Bu minimal iskele: navigasyon stub + tek "Müşteri" karsilama ekrani.
 * Gercek ekranlar src/screens/ altinda olusturulacak (siparis ver, takip, onay/itiraz, abonelik, cuzdan).
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HomeScreen } from "./src/screens/HomeScreen";
import type { CustomerStackParamList } from "./src/navigation/types";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Home">
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "WashApp Müşteri" }}
            />
            {/* TODO(Faz-1): NewOrder, OrderTracking, Confirm, Subscription, Wallet ekranlari */}
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
