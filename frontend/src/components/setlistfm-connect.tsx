/**
 * The one-line invitation to connect setlist.fm, on Home.
 *
 * IT MUST BE DISMISSIBLE AND IT MUST STAY DISMISSED. Most people have never heard of
 * setlist.fm, and an app that keeps asking them for an account they do not have is nagging
 * about its own plumbing. So: offered once, and if waved away, never again on this device —
 * with the full screen still reachable from inside the Passport for anybody who changes their
 * mind.
 *
 * It also hides itself the moment an account IS connected. A permanent status panel in the
 * middle of Home is settings information sitting in somebody's content.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import { getSetlistfmLink } from "../lib/api";

const DISMISSED = "mx_setlistfm_dismissed";

export default function SetlistfmConnect({ onOpen }: { onOpen: () => void }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    // Asked-and-declined beats everything: never re-offer, whatever the server says.
    const dismissed = await AsyncStorage.getItem(DISMISSED).catch(() => null);
    if (dismissed === "true") return setShow(false);
    try {
      const link = await getSetlistfmLink();
      // Nothing to offer if the feature is off, or if they already connected.
      setShow(link.available && !link.username);
    } catch {
      setShow(false);
    }
  }, []);
  useEffect(() => { check(); }, [check]);

  const dismiss = useCallback(() => {
    setShow(false);
    AsyncStorage.setItem(DISMISSED, "true").catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.invite} onPress={onOpen}>
        <Ionicons name="cloud-download-outline" size={16} color={th.accent} />
        <Text style={styles.inviteText}>
          Been to shows before Music X? Import them from setlist.fm
        </Text>
        <Ionicons name="chevron-forward" size={15} color={th.accent} />
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={10} style={styles.no}>
        <Text style={styles.noText}>I don’t use setlist.fm</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 16 },
  invite: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line3,
  },
  inviteText: { color: th.text2, fontSize: 13, fontWeight: "600", flex: 1 },
  no: { alignSelf: "center", paddingVertical: 8 },
  noText: { color: th.muted, fontSize: 11, textDecorationLine: "underline" },
});
