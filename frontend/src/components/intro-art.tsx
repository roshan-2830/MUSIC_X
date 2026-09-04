/** The three intro illustrations.
 *
 * All three are supplied artwork, adapted — the per-file notes in ./art/ record what was
 * changed and why. This file is only the frame: it sizes each one and gives it an
 * entrance. No looping motion; these are illustrations, not animations.
 *
 * SIZES ARE PER SLIDE because the sources are not the same shape: the concert art is
 * landscape (750x500), booking is roughly square once cropped, listening is square. The
 * carousel centres whatever it is handed and the headline sits in a fixed block beneath,
 * so a different height per slide does not shift the text.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import ArtBooking from './art/art-booking';
import ArtConcert from './art/art-concert';
import ArtListening from './art/art-listening';

// About the width of a phone screen less its margins. The first pass drew these at 240
// and they read as icons rather than illustrations.
const W = 330;

/** A one-shot entrance: rise and settle. */
function Enter({ children }: { children: React.ReactNode }) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      v.value = 1;
      return;
    }
    v.value = withDelay(60, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
  }, [reduced, v]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 1.6),
    transform: [{ translateY: 16 * (1 - v.value) }, { scale: 0.95 + 0.05 * v.value }],
  }));
  return <Animated.View style={style} pointerEvents="none">{children}</Animated.View>;
}

export function ArtEveryConcert() {
  return (
    <Enter>
      <View style={styles.stage}>
        {/* 750x500 source, so the height follows that ratio instead of being forced square. */}
        <ArtConcert width={W} height={W * (500 / 750)} />
      </View>
    </Enter>
  );
}

export function ArtBookItAll() {
  return (
    <Enter>
      <View style={styles.stage}>
        <ArtBooking width={W} height={W * (281 / 330)} />
      </View>
    </Enter>
  );
}

export function ArtNeverMiss() {
  return (
    <Enter>
      <View style={styles.stage}>
        <ArtListening width={W} height={W} />
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
});
