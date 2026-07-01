/**
 * WashApp — Müşteri (customer) app giriş noktası.
 * docs/03-yazilim-mimarisi.md §1.1 (Expo) + §1.3 (React Navigation 7 + TanStack Query).
 *
 * Akış: oturum yoksa Login → (kayıt/giriş) → profil eksikse zorunlu Onboarding
 * (ad-soyad/GSM/konum/KVKK) → Home → Services → NewOrder/ServiceRequest → Tracking.
 * Yazma/para/durum FastAPI'ye (canlı backend); okuma Supabase RLS.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Profile } from "@washapp/types";

import { AuthProvider, useAuth } from "./src/state/auth";
import { api } from "./src/lib/api";
import { LoginScreen } from "./src/screens/LoginScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ServicesScreen } from "./src/screens/ServicesScreen";
import { NewOrderScreen } from "./src/screens/NewOrderScreen";
import { ServiceRequestScreen } from "./src/screens/ServiceRequestScreen";
import { OrderTrackingScreen } from "./src/screens/OrderTrackingScreen";
import { COLORS } from "./src/ui/theme";
import type { CustomerStackParamList } from "./src/navigation/types";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

/** Profil tamam mı? Ad-soyad + telefon + KVKK onayı zorunlu (Google Play). */
function isProfileComplete(p: Profile | null): boolean {
  if (!p) return false;
  const adOk = !!p.ad_soyad && p.ad_soyad.trim().length >= 3 && p.ad_soyad !== "-";
  return adOk && !!p.telefon && !!p.kvkk_onay_ts;
}

const screenOptions = {
  headerStyle: { backgroundColor: COLORS.surface },
  headerTintColor: COLORS.brand,
  headerTitleStyle: { fontWeight: "800" as const, color: COLORS.ink },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: COLORS.bg },
};

function Spinner() {
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: COLORS.bg }}>
      <ActivityIndicator color={COLORS.brand} />
    </View>
  );
}

/** Oturum var → profil çek → eksikse Onboarding, tamamsa uygulama akışı. */
function AppGate() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setProfile(await api.me());
    } catch {
      setProfile(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (checking) return <Spinner />;
  if (!isProfileComplete(profile)) {
    return <OnboardingScreen profile={profile} onDone={refresh} />;
  }

  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Services" component={ServicesScreen} options={{ title: "Hizmetler", headerBackTitle: "Geri" }} />
      <Stack.Screen name="NewOrder" component={NewOrderScreen} options={{ title: "Yeni Sipariş", headerBackTitle: "Geri" }} />
      <Stack.Screen name="ServiceRequest" component={ServiceRequestScreen} options={{ title: "Randevu Talebi", headerBackTitle: "Geri" }} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} options={{ title: "Sipariş Takibi", headerBackTitle: "Geri" }} />
    </Stack.Navigator>
  );
}

function Routes() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <LoginScreen />;
  return <AppGate />;
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
