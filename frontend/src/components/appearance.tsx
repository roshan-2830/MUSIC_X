import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Theme, ThemeName } from "../lib/theme";
import { useThemeChoice, useThemedStyles } from "../lib/use-theme";

/** The three answers, and what each one actually promises.
 *
 *  "Default" is first and is the default, because someone who has already told their phone
 *  they prefer light should not have to tell us a second time. It is also a genuinely
 *  different answer from either fixed choice — it changes when the phone changes, including
 *  on a schedule the person may have set at sunset — so it is offered as its own option
 *  rather than implied by having picked neither.
 */
const OPTIONS: { value: ThemeName; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    value: "system",
    label: "Default",
    detail: "Follows your device",
    icon: "phone-portrait-outline",
  },
  {
    value: "light",
    label: "Light",
    detail: "Dark text on a warm off-white",
    icon: "sunny-outline",
  },
  {
    value: "dark",
    label: "Dark",
    detail: "How Music X was designed",
    icon: "moon-outline",
  },
];

export default function AppearanceView({ onClose }: { onClose: () => void }) {
  const { choice, setChoice, theme } = useThemeChoice();
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Appearance</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.group}>Theme</Text>

        {OPTIONS.map((o) => {
          const on = choice === o.value;
          return (
            <Pressable
              key={o.value}
              style={[styles.row, on && styles.rowOn]}
              // Applied the moment it is tapped, with no Save button. A theme is the one
              // setting whose result IS the confirmation — you can see whether you like it
              // before you leave the screen.
              onPress={() => setChoice(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.icon, on && styles.iconOn]}>
                <Ionicons name={o.icon} size={17} color={on ? theme.accentInk : theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
                <Text style={styles.detail}>
                  {o.value === "system" ? `${o.detail} — currently ${theme.mode}` : o.detail}
                </Text>
              </View>
              <Ionicons
                name={on ? "checkmark-circle" : "ellipse-outline"}
                size={21}
                color={on ? theme.accent : theme.outline}
              />
            </Pressable>
          );
        })}

        <Text style={styles.foot}>
          Kept on this device, so it applies before you sign in. Set it again on another
          phone or on the web and each keeps its own.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  head: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
  },
  title: { color: th.text, fontSize: 24, fontWeight: "800" },
  body: { padding: 16, paddingTop: 6 },
  group: {
    color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 10,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
    borderRadius: 16, padding: 14, marginBottom: 10,
  },
  rowOn: { borderColor: th.accent },
  icon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: th.panel2, alignItems: "center", justifyContent: "center",
  },
  iconOn: { backgroundColor: th.accentFill },
  label: { color: th.text, fontSize: 15.5, fontWeight: "800" },
  labelOn: { color: th.accent },
  detail: { color: th.muted, fontSize: 12.5, marginTop: 3 },
  foot: { color: th.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
