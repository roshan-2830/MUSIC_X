import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const CARD = "#14141b";

/**
 * A section that opens and closes.
 *
 * The event page had grown to the point where three long sections sat between the line-up and
 * the trip card, and everything below them was reached by scrolling past things most people
 * were not reading. Collapsed, each one is a single line that says what it holds and how much
 * of it there is; open, it is the whole thing.
 *
 * Reanimated rather than LayoutAnimation: the app already ships reanimated v4 for the splash,
 * it is the supported path under the New Architecture, and `LinearTransition` handles the
 * parent's height change without anyone measuring anything.
 */
export default function CollapsibleCard({
  title,
  subtitle,
  count,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** Shown as a pill in the header — the answer to "is it worth opening this". */
  count?: number | null;
  icon?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const turn = useSharedValue(defaultOpen ? 1 : 0);

  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 180}deg` }],
  }));

  const toggle = () => {
    turn.value = withTiming(open ? 0 : 1, { duration: 180 });
    setOpen((v) => !v);
  };

  return (
    <Animated.View style={styles.card} layout={LinearTransition.duration(200)}>
      <Pressable
        onPress={toggle}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? "Collapse" : "Expand"}`}
      >
        {icon ? (
          <View style={styles.headIcon}>
            <Ionicons name={icon as any} size={15} color={ACCENT} />
          </View>
        ) : null}

        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {count != null && count > 0 ? (
              <View style={styles.countPill}>
                <Text style={styles.countText}>{count}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            // Only while closed. Open, the content itself explains the section and the line
            // becomes a caption nobody reads twice.
            !open ? <Text style={styles.sub} numberOfLines={2}>{subtitle}</Text> : null
          ) : null}
        </View>

        <Animated.View style={chevron}>
          <Ionicons name="chevron-down" size={18} color={MUTED} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(110)}
          style={styles.body}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 16,
    marginTop: 18, overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 11, padding: 16 },
  headIcon: {
    width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(232,255,71,0.12)",
  },
  headText: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#f4f4f6", fontSize: 16, fontWeight: "800", flexShrink: 1 },
  countPill: {
    backgroundColor: "#22222c", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 1.5,
    minWidth: 22, alignItems: "center",
  },
  countText: { color: MUTED, fontSize: 11, fontWeight: "800" },
  sub: { color: MUTED, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
});
