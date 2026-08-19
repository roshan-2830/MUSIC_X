import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

export default function AuthScreen() {
  const { signIn, signUp, sendOtp, verifyOtp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isOtp = mode === "login" && method === "otp";
  const showCode = isOtp && otpSent;
  const showPassword = mode === "signup" || (mode === "login" && method === "password");

  function reset() {
    setError(null);
    setNotice(null);
    setOtpSent(false);
    setCode("");
  }
  function switchMode(m: "login" | "signup") {
    setMode(m);
    setMethod("password");
    reset();
  }

  async function submit() {
    setError(null);
    if (busy) return;

    if (!showCode && !email.trim()) return setError("Enter your email.");
    if (showPassword && !password) return setError("Enter your password.");
    if (showCode && code.trim().length < 6) return setError("Enter the code from your email.");

    setBusy(true);
    let res: { error: string | null } = { error: null };
    if (mode === "signup") {
      res = await signUp(email.trim(), password);
    } else if (method === "password") {
      res = await signIn(email.trim(), password);
    } else if (!otpSent) {
      res = await sendOtp(email.trim());
      if (!res.error) {
        setOtpSent(true);
        setNotice(`We emailed a 6-digit code to ${email.trim()}.`);
      }
    } else {
      res = await verifyOtp(email.trim(), code.trim());
    }
    setBusy(false);
    if (res.error) setError(res.error);
    // On success the auth listener flips the session → the gate shows the app.
  }

  const buttonLabel = mode === "signup"
    ? "Create account"
    : method === "password"
      ? "Log in"
      : otpSent
        ? "Verify & continue"
        : "Send me a code";

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.inner}>
          <Text style={styles.logo}>MUSIC<Text style={styles.accent}>X</Text></Text>
          <Text style={styles.h}>{mode === "login" ? "Welcome back" : "Create your account"}</Text>
          <Text style={styles.sub}>
            {mode === "login"
              ? "Log in to pick up where you left off."
              : "Join and start discovering shows you’ll love."}
          </Text>

          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, mode === "login" && styles.segOn]} onPress={() => switchMode("login")}>
              <Text style={[styles.segText, mode === "login" && styles.segTextOn]}>Log in</Text>
            </Pressable>
            <Pressable style={[styles.segBtn, mode === "signup" && styles.segOn]} onPress={() => switchMode("signup")}>
              <Text style={[styles.segText, mode === "signup" && styles.segTextOn]}>Sign up</Text>
            </Pressable>
          </View>

          {!showCode && (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
              />
            </>
          )}

          {showPassword && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={mode === "login" ? "Your password" : "Create a password (min 6)"}
                placeholderTextColor={MUTED}
                secureTextEntry
                autoCapitalize="none"
                editable={!busy}
              />
            </>
          )}

          {showCode && (
            <>
              <Text style={styles.label}>Login code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="••••••••"
                placeholderTextColor={MUTED}
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                editable={!busy}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice && !error ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable style={[styles.btn, busy && styles.btnBusy]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#0b0b0f" /> : <Text style={styles.btnText}>{buttonLabel}</Text>}
          </Pressable>

          {/* method switches (login only) */}
          {mode === "login" && method === "password" && (
            <Text style={styles.link} onPress={() => { setMethod("otp"); reset(); }}>
              Log in with a one-time code instead
            </Text>
          )}
          {isOtp && !otpSent && (
            <Text style={styles.link} onPress={() => { setMethod("password"); reset(); }}>
              Use a password instead
            </Text>
          )}
          {showCode && (
            <View style={styles.otpLinks}>
              <Text style={styles.link} onPress={submit}>Resend code</Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.link} onPress={() => { setMethod("password"); reset(); }}>Use password</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  flex: { flex: 1 },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { color: "#f4f4f6", fontSize: 30, fontWeight: "800", letterSpacing: 1, textAlign: "center" },
  accent: { color: ACCENT },
  h: { color: "#f4f4f6", fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: 20 },
  sub: { color: MUTED, fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 22 },
  seg: { flexDirection: "row", backgroundColor: "#14141b", borderRadius: 12, padding: 4, borderWidth: 1, borderColor: "#26262f", marginBottom: 18 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segOn: { backgroundColor: ACCENT },
  segText: { color: "#d6d6de", fontWeight: "700" },
  segTextOn: { color: "#0b0b0f", fontWeight: "800" },
  label: { color: MUTED, fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#14141b", borderWidth: 1, borderColor: "#26262f", borderRadius: 12, paddingHorizontal: 14, height: 48, color: "#f4f4f6", fontSize: 15 },
  codeInput: { fontSize: 22, fontWeight: "800", letterSpacing: 5, textAlign: "center" },
  error: { color: "#ff6b6b", fontSize: 13, marginTop: 14, textAlign: "center" },
  notice: { color: "#7ef0b2", fontSize: 13, marginTop: 14, textAlign: "center" },
  btn: { backgroundColor: ACCENT, borderRadius: 14, height: 50, alignItems: "center", justifyContent: "center", marginTop: 22 },
  btnBusy: { opacity: 0.7 },
  btnText: { color: "#0b0b0f", fontSize: 16, fontWeight: "800" },
  link: { color: ACCENT, fontWeight: "700", fontSize: 14, textAlign: "center", marginTop: 18 },
  otpLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 18 },
  dot: { color: MUTED },
});
