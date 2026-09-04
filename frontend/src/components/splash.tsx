/** The launch screen: logo, wordmark, a bouncing equaliser, tagline.
 *
 * Every value here was read out of the mockup's own CSS rather than eyeballed —
 *
 *   .splash        radial-gradient(120% 80% at 50% 32%, rgba(232,255,71,.14), transparent 60%)
 *   .splash-logo   pop 0.6s          64px tile, radius 18, gap 14
 *   .eq            fadeup 0.6s 0.3s  height 38, gap 6, bars 6px wide, radius 3
 *   @keyframes eq  0%,100% 10px → 50% 34px, 1s ease-in-out, infinite
 *   .splash-tag    fadeup 0.6s 0.55s
 *
 * The five bars are delayed 0s / .15s / .3s / .45s / .2s. That last one is not a typo and
 * not a ramp: the mockup deliberately breaks the sequence so the equaliser reads as sound
 * rather than as a mechanical wave. I nearly filled it in as 0.6s by pattern-matching.
 *
 * This is the in-app splash, drawn once React is up. The *native* splash — the frame iOS
 * shows before any JavaScript runs — is still Expo's blue #208AEF with Expo's own logo,
 * configured in app.json. That one needs a real PNG, and it is on the App Store blocker
 * list because a default-template launch screen reads to App Review as an unfinished app.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

const ACCENT = '#e8ff47';
const INK = '#0b0b0f';
const MUTED = '#9a9aa6';

// A fixed halo rather than a percentage of the viewport. Sized as a share of the window,
// the glow was a small tight circle on a phone and an enormous diffuse cloud across a
// desktop browser — the same code looking like two different designs.
const GLOW = 560;

const BAR_DELAYS = [0, 150, 300, 450, 200];
const BAR_MIN = 10;
const BAR_MAX = 34;

/** The mockup's `pop`: 0.6 → 1.08 → 1 with a fade. */
function usePop(delay: number) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      v.value = 1;
      return;
    }
    v.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(2.2)) }));
  }, [reduced, delay, v]);
  return v;
}

/** The mockup's `fadeup`: 12px up, fading in. */
function useFadeUp(delay: number) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      v.value = 1;
      return;
    }
    v.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, v]);
  return v;
}

function Bar({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      t.value = 0.5;   // a still equaliser at mid height, not a flat line
      return;
    }
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [reduced, delay, t]);
  // Height, not scale: the mockup grows the bar from its base, and scaleY would stretch
  // the rounded caps into ovals.
  const style = useAnimatedStyle(() => ({ height: BAR_MIN + (BAR_MAX - BAR_MIN) * t.value }));
  return <Animated.View style={[styles.bar, style]} />;
}

export default function Splash() {
  const pop = usePop(0);
  const eq = useFadeUp(300);
  const tag = useFadeUp(550);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + 0.4 * pop.value }],
  }));
  const eqStyle = useAnimatedStyle(() => ({
    opacity: eq.value,
    transform: [{ translateY: 12 * (1 - eq.value) }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value,
    transform: [{ translateY: 12 * (1 - tag.value) }],
  }));

  return (
    <View style={styles.container}>
      {/* The mockup's wash: radial-gradient(120% 80% at 50% 32%, rgba(232,255,71,.14),
          transparent 60%).
          First attempt stacked three translucent circles to fake it. That does not fake a
          gradient — each circle keeps its hard edge, so it rendered as three visible rings
          with the overlaps adding up in the middle. react-native-svg has RadialGradient,
          which is the actual tool. */}
      <View pointerEvents="none" style={styles.glowWrap}>
        <Svg width={GLOW} height={GLOW}>
          <Defs>
            <RadialGradient id="wash" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
              <Stop offset="45%" stopColor={ACCENT} stopOpacity={0.06} />
              <Stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={GLOW} height={GLOW} fill="url(#wash)" />
        </Svg>
      </View>

      <Animated.View style={[styles.logoRow, logoStyle]}>
        <View style={styles.mark}>
          {/* The mockup's own glyph: two note heads and a filled beam. Fills are set per
              shape rather than inherited from <Svg>, which is not reliable across
              react-native-svg and its web build. */}
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Circle cx={6.5} cy={17.5} r={2.6} fill={INK} />
            <Circle cx={17.5} cy={15.5} r={2.6} fill={INK} />
            <Path d="M9 17.5V6l11-2v11.5" fill={INK} />
          </Svg>
        </View>
        <Text style={styles.wordmark}>
          MUSIC<Text style={styles.wordmarkX}>X</Text>
        </Text>
      </Animated.View>

      <Animated.View style={[styles.eq, eqStyle]}>
        {BAR_DELAYS.map((d, i) => <Bar key={i} delay={d} />)}
      </Animated.View>

      <Animated.Text style={[styles.tag, tagStyle]}>Live music, everywhere.</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', gap: 20 },

  // Full bleed: the gradient itself carries the `at 50% 32%` offset.
  // Centred on the logo, which sits a little above the middle of the screen.
  glowWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', paddingBottom: 90,
  },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  // 34px / 800 / .04em — the mockup's .splash-logo .wd, to the number.
  wordmark: { color: '#f4f4f6', fontSize: 34, fontWeight: '800', letterSpacing: 1.36 },
  wordmarkX: { color: ACCENT },

  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 38 },
  bar: { width: 6, borderRadius: 3, backgroundColor: ACCENT },

  tag: { color: MUTED, fontSize: 15 },
});
