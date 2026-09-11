/**
 * The chosen theme, and the hook that lets a StyleSheet depend on it.
 *
 * Three choices, not two: "system" follows the phone and is the default, because a person
 * who has already told their phone they prefer light should not have to tell us again.
 *
 * Stored on the DEVICE, not the account. AsyncStorage is already here for the Supabase
 * session, it works before anyone signs in — which matters, because the auth screen has to
 * render in the right theme too — and it needs no migration. The trade-off is real and
 * accepted: set it on a phone and a laptop keeps its own setting.
 *
 * Why styles come from a factory
 * ------------------------------
 * `StyleSheet.create` runs once at module load, so a stylesheet built from literals can
 * never change theme. `useThemedStyles(makeStyles)` calls the factory with the live theme
 * and memoises per theme object, so a switch restyles the app without a reload and without
 * rebuilding a stylesheet on every render.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { useColorScheme } from "react-native";

import { dark, light, Theme, ThemeName } from "./theme";

const KEY = "musicx.theme";

type Ctx = {
  theme: Theme;
  /** What the user chose — "system", not the resolved value. The settings screen needs to
   *  show which option is ticked, and "system" is a different answer from "dark". */
  choice: ThemeName;
  setChoice: (name: ThemeName) => void;
  /** False until the stored choice has been read, so nothing paints the wrong theme and
   *  then flips. */
  ready: boolean;
};

const ThemeCtx = createContext<Ctx>({
  theme: dark, choice: "system", setChoice: () => {}, ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeName>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (alive && (v === "dark" || v === "light" || v === "system")) {
          setChoiceState(v);
        }
      })
      // A device that cannot read its own storage still gets an app: fall through to
      // "system" rather than blocking on it.
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const setChoice = useCallback((name: ThemeName) => {
    setChoiceState(name);                    // paint immediately; persist behind it
    AsyncStorage.setItem(KEY, name).catch(() => {});
  }, []);

  // "system" with no OS answer resolves to dark, which is this app's own identity — not to
  // light, which is what a generic default would pick.
  const theme = useMemo(() => {
    const resolved = choice === "system" ? (system ?? "dark") : choice;
    return resolved === "light" ? light : dark;
  }, [choice, system]);

  const value = useMemo(() => ({ theme, choice, setChoice, ready }),
                        [theme, choice, setChoice, ready]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** The live palette. */
export function useTheme(): Theme {
  return useContext(ThemeCtx).theme;
}

/** The palette plus the setter, for the Appearance screen. */
export function useThemeChoice() {
  const { choice, setChoice, theme, ready } = useContext(ThemeCtx);
  return { choice, setChoice, theme, ready };
}

/**
 * Build a stylesheet from the live theme, memoised per theme.
 *
 * Usage, and the reason the factory lives at module scope:
 *
 *   const makeStyles = (t: Theme) => StyleSheet.create({ … });   // outside the component
 *   const styles = useThemedStyles(makeStyles);                  // inside it
 *
 * Declared outside so the identity is stable — a factory defined inline would be a new
 * function every render and defeat the memo.
 */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
