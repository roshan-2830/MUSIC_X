import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import AuthScreen from '@/components/auth-screen';
import ConnectMusic from '@/components/connect-music';
import FollowArtists from '@/components/follow-artists';
import PickGenres from '@/components/pick-genres';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider } from '@/lib/profile';
import { SavesProvider } from '@/lib/saves';

SplashScreen.preventAutoHideAsync();

const ONBOARDED_KEY = 'mx_onboarded';

function Loader() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0b0b0f', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#e8ff47" size="large" />
    </View>
  );
}

// After sign-in: show the one-time "follow your artists" onboarding, then the tab app.
// The onboarding flag is scoped PER USER (not per device), so every new account gets it.
function SignedInApp({ userId }: { userId: string }) {
  const [ready, setReady] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [skippedConnect, setSkippedConnect] = useState(false);
  // Set when someone would rather name an artist than pick genres. Genres are the
  // default fallback because most people cannot recall an artist on demand, but a
  // few arrive knowing exactly who they want and must not be made to browse.
  const [wantsSearch, setWantsSearch] = useState(false);
  const key = `${ONBOARDED_KEY}_${userId}`;

  useEffect(() => {
    setReady(false);
    AsyncStorage.getItem(key)
      .then((v) => setOnboarding(v !== 'true'))
      .finally(() => setReady(true));
  }, [key]);

  if (!ready) return <Loader />;

  if (onboarding) {
    const finish = () => {
      AsyncStorage.setItem(key, 'true').catch(() => {});
      setOnboarding(false);
    };
    // Connect a listening history FIRST — it is the shortest path to real
    // recommendations. Anyone who skips picks genres instead and gets real artists to
    // follow, since most people do not have a Last.fm account and must not be stuck at
    // the door. Search stays one tap away for the few who already know who they want.
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {!skippedConnect ? (
          <ConnectMusic onDone={finish} onSkip={() => setSkippedConnect(true)} />
        ) : wantsSearch ? (
          <FollowArtists onDone={finish} />
        ) : (
          <PickGenres onDone={finish} onSearch={() => setWantsSearch(true)} />
        )}
      </SafeAreaProvider>
    );
  }

  return (
    <ProfileProvider>
      <SavesProvider>
        <AppTabs />
      </SavesProvider>
    </ProfileProvider>
  );
}

// Decides what to show based on login state.
function Gate() {
  const { session, loading } = useAuth();

  if (loading) return <Loader />;

  // Signed in → onboarding-or-app.  Signed out → the login screen.
  return session?.user ? <SignedInApp userId={session.user.id} /> : <AuthScreen />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}
