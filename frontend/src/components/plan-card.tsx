import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  clearTicket, declareTicket, getPlan, markAttended, pasteTicket, Plan, PlanStep,
  setPlanNote, setPlanReminder,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const CARD = "#14141b";
const GOOD = "#7ef0b2";
const INK = "#101204";

const REMINDERS: { key: "minimal" | "normal" | "high"; label: string; note: string }[] = [
  { key: "minimal", label: "Minimal", note: "Just a heads-up the week of the show." },
  { key: "normal", label: "Normal", note: "On-sale, a week before, and day-of." },
  { key: "high", label: "High", note: "Everything — on-sale, price drops, set times & day-of." },
];

/** One node on the rail, plus the line that reaches it.
 *
 *  The connector belongs to the step on its right rather than being drawn between them, so a
 *  four-step rail is four identical pieces and the "reached" colour cannot end up out of step
 *  with the node it leads to.
 */
function Step({ step, first }: { step: PlanStep; first: boolean }) {
  const on = step.reached || step.current;
  return (
    <View style={styles.step}>
      {!first ? <View style={[styles.conn, on && styles.connOn]} /> : <View style={styles.conn0} />}
      <View style={[
        styles.node,
        step.reached && styles.nodeDone,
        step.current && styles.nodeNow,
        step.locked && !on && styles.nodeLocked,
      ]}>
        {step.reached ? <Ionicons name="checkmark" size={15} color={INK} /> : null}
        {step.current ? <View style={styles.dot} /> : null}
        {step.locked && !on ? <Ionicons name="lock-closed" size={10} color={MUTED} /> : null}
      </View>
      <Text style={[
        styles.stepLabel,
        step.current && styles.stepLabelNow,
        step.reached && styles.stepLabelDone,
      ]} numberOfLines={1}>
        {step.label}
      </Text>
    </View>
  );
}

/**
 * "Your plan" — the four calendar states of PRD F3, and the things that move them.
 *
 * Three of the four move on their own: saving gives Interested; picking a hotel, inviting
 * somebody or writing a note gives Planning; the show happening with a ticket on record gives
 * Attended. Only the ticket needs telling, and only because a purchase happens on a seller's
 * site that never reports back to us — so it is asked for rather than assumed.
 *
 * The state is computed on the server from those facts, never stored as a transition, so this
 * screen only ever renders what is already true.
 */
export default function PlanCard({
  eventId, saved, onSaveRequested,
}: {
  eventId: string;
  /** Whether the show is saved, from the same hook the Save button uses — so tapping Save
   *  refreshes this card without it having to poll. */
  saved: boolean;
  /** Awaited before the plan is re-read. Returning the promise matters: the save is a request,
   *  and reading the plan before it lands gives back the state from before the tap — which is
   *  exactly the stale "Save this show to start planning" this replaced. */
  onSaveRequested: () => Promise<void> | void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await getPlan(eventId);
    setPlan(p);
    setNoteText(p?.note ?? "");
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  // Re-read when the show is saved or unsaved ELSEWHERE on the page — the Save button in the
  // action row is looking at the same fact, and a stale stepper beside a filled bookmark is
  // worse than a moment's delay. Saves made from this card are handled by awaiting the request
  // instead, because this effect fires on the optimistic flag rather than on the response.
  useEffect(() => { load(); }, [saved, load]);

  const apply = async (fn: () => Promise<Plan | null>) => {
    setBusy(true);
    setProblem(null);
    const p = await fn();
    if (p) setPlan(p); else setProblem("That didn't work — try again in a moment.");
    setBusy(false);
  };

  const submitPaste = async () => {
    const text = pasteText.trim();
    if (text.length < 20) {
      setProblem("Paste the whole confirmation — that's too short to read.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const r = await pasteTicket(eventId, text);
    setBusy(false);
    if (!r) { setProblem("That didn't work — try again in a moment."); return; }
    if (r.plan) setPlan(r.plan);
    if (r.confident) {
      setPasteOpen(false);
      setPasteText("");
      setMessage(r.message);
      setTimeout(() => setMessage(null), 5000);
    } else {
      // Not an error and not a refusal — we could not tell. Said plainly, with what was and
      // was not recognised, so somebody can see why rather than guessing at us.
      setProblem(r.message ?? "We couldn't match that to this show.");
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.h}>Your plan</Text>
        <View style={styles.state}><ActivityIndicator color={ACCENT} /></View>
      </View>
    );
  }
  if (!plan) return null;

  const level = REMINDERS.find((r) => r.key === plan.reminder_level) ?? REMINDERS[1];

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Your plan</Text>
      <Text style={styles.sub}>Track this show from first spark to “I was there.”</Text>

      <View style={styles.rail}>
        {plan.steps.map((s, i) => <Step key={s.key} step={s} first={i === 0} />)}
      </View>

      <View style={styles.guide}>
        <View style={[styles.guideDot, plan.state === "confirmed" && { backgroundColor: GOOD },
                      plan.state === "attended" && { backgroundColor: ACCENT }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.guideHead}>{plan.headline}</Text>
          {plan.hint ? <Text style={styles.guideHint}>{plan.hint}</Text> : null}
        </View>
      </View>

      {/* Unsaved: one button, and nothing else. A tracker for a show nobody has saved is a form
          asking to be filled in for no reason. */}
      {!plan.saved ? (
        <Pressable
          style={styles.primary}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onSaveRequested();
              await load();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <ActivityIndicator color={INK} /> : (
            <>
              <Ionicons name="bookmark" size={15} color={INK} />
              <Text style={styles.primaryText}>Save this show to start planning</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {plan.saved ? (
        <>
          {/* ── the ticket, which is the only step that needs telling ───────────── */}
          {!plan.ticket ? (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Ionicons name="ticket-outline" size={14} color={ACCENT} />
                <Text style={styles.blockTitle}>YOUR TICKET</Text>
              </View>
              <Text style={styles.blockNote}>
                We can't see purchases — they happen on the seller's site. Paste your
                confirmation and we'll read the seller and reference out of it.
              </Text>

              {!pasteOpen ? (
                <>
                  <Pressable style={styles.primary} onPress={() => setPasteOpen(true)}>
                    <Ionicons name="clipboard-outline" size={15} color={INK} />
                    <Text style={styles.primaryText}>Paste my confirmation</Text>
                  </Pressable>
                  <Pressable style={styles.ghost} onPress={() => apply(() => declareTicket(eventId))}
                             disabled={busy}>
                    <Text style={styles.ghostText}>I have a ticket, no email to hand</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.paste}
                    placeholder={"Paste the whole confirmation email here…"}
                    placeholderTextColor={MUTED}
                    value={pasteText}
                    onChangeText={setPasteText}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    autoCorrect={false}
                  />
                  <Text style={styles.blockNote}>
                    We keep only the seller and the reference. The rest of the email — your name,
                    address, card digits — is never stored.
                  </Text>
                  <View style={styles.row}>
                    <Pressable style={[styles.ghost, { flex: 1, marginTop: 0 }]}
                               onPress={() => { setPasteOpen(false); setPasteText(""); setProblem(null); }}>
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]}
                               onPress={submitPaste} disabled={busy}>
                      {busy ? <ActivityIndicator color={INK} />
                            : <Text style={styles.primaryText}>Read it</Text>}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ) : (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Ionicons name="checkmark-circle" size={14} color={GOOD} />
                <Text style={[styles.blockTitle, { color: GOOD }]}>TICKET SAVED</Text>
              </View>
              <Text style={styles.ticketLine}>
                {[plan.ticket.provider, plan.ticket.reference && `ref ${plan.ticket.reference}`]
                  .filter(Boolean).join(" · ") || "You said you have a ticket"}
              </Text>
              <Text style={styles.blockNote}>
                {plan.ticket.source === "pasted"
                  ? "Read from your confirmation."
                  : "You told us — we can't see purchases ourselves."}
              </Text>
              <Pressable style={styles.ghost} onPress={() => apply(() => clearTicket(eventId))}
                         disabled={busy}>
                <Text style={styles.ghostText}>Remove ticket</Text>
              </Pressable>
            </View>
          )}

          {/* ── "I was there", the PRD's check-in route, only after the show ────── */}
          {plan.past && plan.state !== "attended" ? (
            <Pressable style={styles.primary} onPress={() => apply(() => markAttended(eventId))}
                       disabled={busy}>
              <Ionicons name="checkmark-done" size={15} color={INK} />
              <Text style={styles.primaryText}>I was there</Text>
            </Pressable>
          ) : null}

          {/* ── reminders ───────────────────────────────────────────────────────── */}
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Ionicons name="notifications-outline" size={14} color={ACCENT} />
              <Text style={styles.blockTitle}>REMINDERS</Text>
            </View>
            <View style={styles.seg}>
              {REMINDERS.map((r) => (
                <Pressable key={r.key}
                           style={[styles.segCell, plan.reminder_level === r.key && styles.segOn]}
                           onPress={() => apply(() => setPlanReminder(eventId, r.key))}>
                  <Text style={[styles.segText,
                                plan.reminder_level === r.key && styles.segTextOn]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.blockNote}>{level.note}</Text>
          </View>

          {/* ── notes ───────────────────────────────────────────────────────────── */}
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Ionicons name="chatbubble-outline" size={14} color={ACCENT} />
              <Text style={styles.blockTitle}>YOUR NOTES</Text>
            </View>
            {noteOpen ? (
              <>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Anything you want to remember…"
                  placeholderTextColor={MUTED}
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                />
                <View style={styles.row}>
                  <Pressable style={[styles.ghost, { flex: 1, marginTop: 0 }]}
                             onPress={() => { setNoteOpen(false); setNoteText(plan.note ?? ""); }}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]}
                             onPress={async () => {
                               await apply(() => setPlanNote(eventId, noteText));
                               setNoteOpen(false);
                             }}
                             disabled={busy}>
                    <Text style={styles.primaryText}>Save note</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {plan.note ? <Text style={styles.noteBody}>{plan.note}</Text> : null}
                <Pressable style={styles.noteBtn} onPress={() => setNoteOpen(true)}>
                  <Ionicons name={plan.note ? "create-outline" : "add"} size={14} color={ACCENT} />
                  <Text style={styles.noteBtnText}>{plan.note ? "Edit note" : "Add a note"}</Text>
                </Pressable>
              </>
            )}
          </View>

          {message ? (
            <View style={[styles.flash, { borderColor: "rgba(126,240,178,0.4)" }]}>
              <Ionicons name="checkmark-circle" size={14} color={GOOD} />
              <Text style={[styles.flashText, { color: GOOD }]}>{message}</Text>
            </View>
          ) : null}
          {problem ? (
            <View style={[styles.flash, { borderColor: "rgba(255,122,107,0.4)" }]}>
              <Ionicons name="alert-circle" size={14} color="#ff7a6b" />
              <Text style={[styles.flashText, { color: "#ff7a6b" }]}>{problem}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 16,
    padding: 16, marginTop: 18,
  },
  h: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  sub: { color: MUTED, fontSize: 13, marginTop: 3, marginBottom: 20, lineHeight: 18 },

  rail: { flexDirection: "row" },
  step: { flex: 1, alignItems: "center" },
  // The connector reaches LEFT from its own node, so each step owns the line that leads to it.
  conn: {
    position: "absolute", top: 15, right: "50%", left: -8, height: 2,
    backgroundColor: LINE,
  },
  connOn: { backgroundColor: ACCENT },
  conn0: { height: 0 },
  node: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: LINE,
    alignItems: "center", justifyContent: "center", backgroundColor: CARD,
  },
  nodeDone: { backgroundColor: ACCENT, borderColor: ACCENT },
  nodeNow: { borderColor: ACCENT, backgroundColor: CARD },
  nodeLocked: { borderStyle: "dashed" },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: ACCENT },
  stepLabel: { color: MUTED, fontSize: 11.5, fontWeight: "700", marginTop: 8 },
  stepLabelNow: { color: ACCENT, fontWeight: "800" },
  stepLabelDone: { color: "#f4f4f6" },

  guide: { flexDirection: "row", gap: 9, marginTop: 18, alignItems: "flex-start" },
  guideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: MUTED, marginTop: 5 },
  guideHead: { color: "#f4f4f6", fontSize: 13.5, fontWeight: "700" },
  guideHint: { color: MUTED, fontSize: 12.5, marginTop: 2, lineHeight: 17 },

  block: { borderTopWidth: 1, borderTopColor: LINE, marginTop: 18, paddingTop: 14 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  blockTitle: { color: MUTED, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.9 },
  blockNote: { color: MUTED, fontSize: 11.5, lineHeight: 16, marginTop: 8 },

  seg: { flexDirection: "row", backgroundColor: "#0f0f14", borderRadius: 999, padding: 3, gap: 3 },
  segCell: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 999 },
  segOn: { backgroundColor: ACCENT },
  segText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  segTextOn: { color: INK, fontWeight: "800" },

  paste: {
    backgroundColor: "#0f0f14", borderWidth: 1, borderColor: LINE, borderRadius: 11,
    color: "#f4f4f6", fontSize: 13, padding: 12, minHeight: 110, marginTop: 4,
  },
  noteInput: {
    backgroundColor: "#0f0f14", borderWidth: 1, borderColor: LINE, borderRadius: 11,
    color: "#f4f4f6", fontSize: 13.5, padding: 12, minHeight: 70,
  },
  noteBody: { color: "#e6e6ec", fontSize: 13.5, lineHeight: 19, marginBottom: 4 },
  noteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  noteBtnText: { color: ACCENT, fontSize: 13.5, fontWeight: "800" },

  ticketLine: { color: "#f4f4f6", fontSize: 14, fontWeight: "700" },

  row: { flexDirection: "row", gap: 9, marginTop: 12 },
  primary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13, marginTop: 14,
  },
  primaryText: { color: INK, fontSize: 14, fontWeight: "800" },
  ghost: {
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: LINE,
    borderRadius: 11, paddingVertical: 11, marginTop: 9,
  },
  ghostText: { color: MUTED, fontSize: 12.5, fontWeight: "700" },

  state: { paddingVertical: 26, alignItems: "center" },
  flash: {
    flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 11,
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 14,
  },
  flashText: { fontSize: 12.5, fontWeight: "700", flex: 1, lineHeight: 17 },
});
