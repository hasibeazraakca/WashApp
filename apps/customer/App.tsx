/**
 * WashApp — Müşteri (customer) app giriş noktası.
 * docs/03-yazilim-mimarisi.md §1.1 (Expo) + §1.3 (React Navigation 7 + TanStack Query).
 *
 * Auth gate: oturum yoksa Login; varsa Home → NewOrder → OrderTracking akışı.
 * Yazma/para/durum FastAPI'ye (canlı backend); okuma Supabase RLS.
 */
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "./src/state/auth";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { NewOrderScreen } from "./src/screens/NewOrderScreen";
import { OrderTrackingScreen } from "./src/screens/OrderTrackingScreen";
import { COLORS } from "./src/ui/theme";
import type { CustomerStackParamList } from "./src/navigation/types";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

function Routes() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: COLORS.bg }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!session) {
    return <LoginScreen />;
  }
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: "WashApp" }} />
      <Stack.Screen name="NewOrder" component={NewOrderScreen} options={{ title: "Yeni Sipariş" }} />
      <Stack.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ title: "Sipariş Takibi" }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer>
            <Routes />
          </NavigationContainer>
        </AuthProvider>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
