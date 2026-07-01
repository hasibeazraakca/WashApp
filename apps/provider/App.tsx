/**
 * WashApp — Hizmet Veren (provider) app giriş noktası.
 * Auth gate: oturum yoksa Login; varsa iş havuzu → sipariş/talep detay akışı.
 * Yazma/durum/kanıt FastAPI'ye; okuma Supabase RLS. Kamera = in-app (anti-fraud).
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
import { JobsScreen } from "./src/screens/JobsScreen";
import { OrderJobScreen } from "./src/screens/OrderJobScreen";
import { RequestJobScreen } from "./src/screens/RequestJobScreen";
import { COLORS } from "./src/ui/theme";
import type { ProviderStackParamList } from "./src/navigation/types";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<ProviderStackParamList>();

function Routes() {
  const { session, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", backgroundColor: COLORS.bg }}><ActivityIndicator color={COLORS.brand} /></View>;
  }
  if (!session) return <LoginScreen />;
  return (
    <Stack.Navigator
      initialRouteName="Jobs"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.brand,
        headerTitleStyle: { fontWeight: "800", color: COLORS.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Stack.Screen name="Jobs" component={JobsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OrderJob" component={OrderJobScreen} options={{ title: "Yıkama İşi", headerBackTitle: "Geri" }} />
      <Stack.Screen name="RequestJob" component={RequestJobScreen} options={{ title: "Randevu İşi", headerBackTitle: "Geri" }} />
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
        <StatusBar style="dark" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
