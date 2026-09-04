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
import IntroSlides from '@/components/intro-slides';
import PickGenres from '@/components/pick-genres';
import Splash from '@/components/splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider } from '@/lib/profile';
import { SavesProvider } from '@/lib/saves';

SplashScreen.preventAutoHideAsync();

const ONBOARDED_KEY = 'mx_onboarded';
// The intro runs BEFORE anyone signs in, so there is no account to hang it off — it is
// remembered per device, unlike ONBOARDED_KEY which is per user. Someone who has seen the
// three slides and come back to log in should land on the login screen, not the pitch.
const INTRO_KEY = 'mx_intro_seen';

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
    // the door.
    //
    // Two screens, not three. There used to be a third branch that replaced the genre
    // screen with a search screen, which meant choosing between browsing and searching —
    // and silently dropped any follows already ticked, because they are only written on
    // Continue. PickGenres now carries the search box itself, so the flow is linear.
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {!skippedConnect ? (
          <ConnectMusic onDone={finish} onSkip={() => setSkippedConnect(true)} />
        ) : (
          <PickGenres onDone={finish} />
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
// The splash animation runs 0.55s before the tagline even starts, so a gate that clears
// in 200ms would show a logo mid-pop and cut. Hold it for one full beat; anything slower
// than that is real loading and needs no help.
const SPLASH_MS = 1700;

function Gate() {
  const { session, loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);
  // null = not read yet. Rendering the intro before the answer is back would flash the
  // pitch at a returning user for a frame, which is worse than a moment of the loader.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY)
      .then((v) => setIntroSeen(v === 'true'))
      .catch(() => setIntroSeen(true));   // unreadable storage: skip the pitch, never block
  }, []);

  if (loading || introSeen === null || !splashDone) return <Splash />;

  // Signed in → onboarding-or-app.
  if (session?.user) return <SignedInApp userId={session.user.id} />;

  // Signed out and has never seen the intro → the three slides, then the login screen.
  if (!introSeen) {
    const done = () => {
      setIntroSeen(true);
      AsyncStorage.setItem(INTRO_KEY, 'true').catch(() => {});  // best effort, never blocks
    };
    return <IntroSlides onDone={done} />;
  }

  return <AuthScreen />;
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
