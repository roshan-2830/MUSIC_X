import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Theme } from "./theme";
import { useTheme, useThemedStyles } from "./use-theme";

/**
 * The one transient message in the app.
 *
 * Why a plain positioned View and not a Modal
 * -------------------------------------------
 * A Modal would stack above the app's own modals, which is tempting, because the heart and
 * the bookmark both live inside modal screens. But a Modal is a separate window: it swallows
 * every touch in its area for as long as it is up, so a 2.2-second confirmation would make
 * the app unresponsive for 2.2 seconds. A confirmation that costs you a tap is not a
 * confirmation.
 *
 * So the host is an absolutely-positioned View with pointerEvents="box-none": touches pass
 * straight through it to whatever is underneath, and only the pill itself — and its Undo —
 * can be tapped. The cost is that one host at the root cannot appear above a Modal, so the
 * modal screens that own a heart or a bookmark render a <ToastHost/> of their own. The
 * provider holds the message; a host only draws it, so however many are mounted, the topmost
 * one is what you see.
 *
 * MESSAGES ARE ANNOUNCED, not just drawn. A visual-only confirmation is no confirmation for
 * someone using a screen reader, and this is the app's only feedback for a one-tap action.
 */
const DURATION = 2200;   // the Me tab's existing toast timing, so the app has one rhythm

type ToastAction = { label: string; onPress: () => void };

type ToastState = { message: string; action?: ToastAction; id: number } | null;

type ToastContextValue = {
  /** Show a message. A second call replaces the first and restarts the clock — no queue,
   *  so hearting five acts quickly leaves the one you just touched on screen. */
  show: (message: string, action?: ToastAction) => void;
  hide: () => void;
  toast: ToastState;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clear();
    setToast(null);
  }, [clear]);

  const show = useCallback((message: string, action?: ToastAction) => {
    if (!message) return;
    clear();
    seq.current += 1;
    setToast({ message, action, id: seq.current });
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      /* announcing is a courtesy; never let it break the action it is describing */
    }
    timer.current = setTimeout(() => setToast(null), DURATION);
  }, [clear]);

  useEffect(() => clear, [clear]);

  const value = useMemo(() => ({ show, hide, toast }), [show, hide, toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // Deliberately forgiving: a provider that has not mounted yet must not crash the action
  // it was only meant to describe.
  return ctx ?? { show: () => {}, hide: () => {}, toast: null };
}

/**
 * Draws the current message, wherever it is mounted.
 *
 * Mount one inside any Modal that owns a heart or a bookmark — the root host is behind the
 * modal and therefore invisible there. Mounting several is safe and intended: only the
 * topmost is on screen.
 */
export function ToastHost() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { toast, hide } = useToast();

  if (!toast) return null;

  return (
    // box-none, so the app underneath stays usable while this is up.
    <View style={styles.layer} pointerEvents="box-none">
      <View
        style={[styles.pill, { marginBottom: insets.bottom + (Platform.OS === "web" ? 24 : 12) }]}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.text} numberOfLines={1}>{toast.message}</Text>
        {toast.action ? (
          <Pressable
            onPress={() => { toast.action!.onPress(); hide(); }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Text style={styles.action}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  layer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "flex-end",
    // Above the tab bar and anything else in the screen it is mounted in.
    zIndex: 999,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 14,
    maxWidth: "92%",
    // Sits ON the app rather than in it: the panel3 surface with a hairline, so it reads
    // as a temporary object in both themes.
    backgroundColor: th.panel3, borderWidth: 1, borderColor: th.line,
    borderRadius: 13, paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: th.shadow, shadowOpacity: 0.35, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  text: { color: th.text, fontSize: 13.5, fontWeight: "600", flexShrink: 1 },
  action: { color: th.accent, fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
});
