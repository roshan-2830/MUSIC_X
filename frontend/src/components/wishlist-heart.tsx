import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";
import { useWishlist } from "../lib/wishlist";

/**
 * The wishlist control, wherever an ARTIST is listed.
 *
 * Never on an event card, a calendar card or an event page — narrowed there on 2026-09-10
 * after using it. Save and wishlist answer questions at different levels (a DATE versus an
 * ACT), and sitting them side by side hid that rather than showing it: hearting from a card
 * added the headliner, which is a silent artist-level effect on something that is mostly a
 * date. So the rule is one line long — a heart appears next to an artist, and nowhere else.
 *
 * One component and not the same twenty lines in each of the three places it appears —
 * the same reason venue_lookup.key exists on the backend: two copies of a rule drift.
 *
 * It renders NOTHING without a name, so a caller can pass whatever it has and let this
 * decide. A heart that silently does nothing is worse than no heart.
 *
 * The caller owns POSITION, this owns behaviour and the icon. `variant` is only about what
 * the heart sits on:
 *
 *   panel  in an artist list — the search rows, the Following list, the Home strip.
 *   page   the 48pt button in the artist page's action row.
 */
export default function WishlistHeart({
  artistName, artistId, imageUrl, variant = "panel", style,
}: {
  artistName: string | null | undefined;
  artistId?: string | null;
  imageUrl?: string | null;
  variant?: "panel" | "page";
  style?: StyleProp<ViewStyle>;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { isWished, toggle } = useWishlist();

  if (!artistName) return null;

  const on = isWished(artistName);
  const off = variant === "page" ? th.text : th.muted;

  return (
    <Pressable
      onPress={() => toggle({ name: artistName, image_url: imageUrl, artist_id: artistId })}
      hitSlop={8}
      accessibilityRole="button"
      // Says what it DOES, not what it is. "Heart" tells a screen reader nothing, and this
      // sits next to a bookmark that means something quite different.
      accessibilityLabel={on
        ? `${artistName} is on your wishlist`
        : `Add ${artistName} to your wishlist`}
      accessibilityState={{ selected: on }}
      style={[variant === "page" && styles.pageBtn, variant === "page" && on && styles.pageBtnOn, style]}
    >
      <Ionicons
        name={on ? "heart" : "heart-outline"}
        size={variant === "page" ? 20 : 15}
        // On a page button the fill IS the accent, so the icon flips to the ink that
        // belongs on it. Everywhere else a filled heart takes the accent itself.
        color={on ? (variant === "page" ? th.accentInk : th.accent) : off}
      />
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  pageBtn: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: th.line,
    alignItems: "center", justifyContent: "center",
  },
  pageBtnOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },
});
