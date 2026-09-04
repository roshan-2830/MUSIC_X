/** The three-slide intro, shown once before anyone reaches the login screen.
 *
 * Straight from the mockup: Skip top-right, three dots with the active one widened into a
 * pill, a round accent chevron on the first two slides and a full-width "Get started" on
 * the last. Copy is the mockup's, word for word.
 *
 * Each slide is mounted alone and keyed on the index, which is what replays the entry
 * animation — the illustrations' one-shot `pop` and the headline's `fadeup` both restart
 * because React gives them fresh state. A paged ScrollView would keep all three mounted
 * and animating off-screen for no benefit, and paging behaves differently enough on
 * react-native-web to be worth avoiding while this is the first thing a stranger sees.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtBookItAll, ArtEveryConcert, ArtNeverMiss } from './intro-art';

const ACCENT = '#e8ff47';
const MUTED = '#9a9aa6';

const SLIDES = [
  {
    art: ArtEveryConcert,
    title: 'Every concert,\neverywhere',
    sub: 'Discover shows worldwide, tuned to the music you already love.',
  },
  {
    art: ArtBookItAll,
    title: 'Book it all in one place',
    sub: 'Tickets, hotel and flights — sorted from a single screen.',
  },
  {
    art: ArtNeverMiss,
    title: 'Never miss a beat',
    sub: 'Personalised picks, on-sale alerts and clips from every show.',
  },
] as const;

/** The mockup's `fadeup`: 12px up, fading in. */
function FadeUp({ delay, children, style }: {
  delay: number; children: React.ReactNode; style?: any;
}) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withDelay(delay, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, t]);
  const anim = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: 12 * (1 - t.value) }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function Dot({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Current slide' : 'Go to slide'}
      style={[styles.dot, active && styles.dotOn]}
    />
  );
}

export default function IntroSlides({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const Art = slide.art;
  const last = i === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.top}>
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      {/* key={i} is deliberate: it remounts the artwork so its entry animation replays. */}
      <View style={styles.stageWrap}>
        <Art key={i} />
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, n) => (
            <Dot key={n} active={n === i} onPress={() => setI(n)} />
          ))}
        </View>

        <FadeUp key={`t${i}`} delay={60}>
          <Text style={styles.title}>{slide.title}</Text>
        </FadeUp>
        <FadeUp key={`s${i}`} delay={140}>
          <Text style={styles.sub}>{slide.sub}</Text>
        </FadeUp>

        <View style={styles.action}>
          {last ? (
            <Pressable
              style={styles.cta}
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <Text style={styles.ctaText}>Get started</Text>
              <Ionicons name="arrow-forward" size={18} color="#0b0b0f" />
            </Pressable>
          ) : (
            <Pressable
              style={styles.fab}
              onPress={() => setI(i + 1)}
              accessibilityRole="button"
              accessibilityLabel="Next"
            >
              <Ionicons name="chevron-forward" size={24} color="#0b0b0f" />
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f' },
  top: { alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 6 },
  skip: { color: MUTED, fontSize: 14, fontWeight: '700' },

  stageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bottom: { paddingHorizontal: 24, paddingBottom: 28 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', marginBottom: 18 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a3a46' },
  // The active dot widens into a pill rather than just changing colour — the mockup's own
  // cue, and the one that still reads for someone who cannot separate grey from yellow.
  dotOn: { width: 20, backgroundColor: ACCENT },

  title: {
    color: '#f4f4f6', fontSize: 27, fontWeight: '800', textAlign: 'center',
    lineHeight: 36, letterSpacing: -0.3,
  },
  sub: {
    color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22,
    marginTop: 10, paddingHorizontal: 8,
  },

  action: { marginTop: 26, minHeight: 54, justifyContent: 'center' },
  fab: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, borderRadius: 27, backgroundColor: ACCENT,
  },
  ctaText: { color: '#0b0b0f', fontSize: 16, fontWeight: '800' },
});
