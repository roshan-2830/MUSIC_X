/**
 * My bookings — the trip ledger.
 *
 * One card per show, holding the three things a night away actually costs you: the ticket, the
 * bed, and the way there. Each card says how many of the three are done, what has been spent,
 * and whether a free-cancellation window is about to shut.
 *
 * WHY THE APP KEEPS THIS AT ALL, when the confirmations are already in an inbox: an inbox has
 * one email per booking and no idea that three of them are the same weekend. Nothing here is
 * pulled from anywhere — every line is something the person recorded — and the footer says so,
 * because "we never read your mail" is only worth saying where somebody might wonder.
 *
 * MONEY IS NEVER CONVERTED. A trip paid for in two currencies shows "£309 + €240". We hold no
 * exchange rate we would defend, and one confident wrong total is worse than two right numbers.
 * The server sums per currency; this screen only joins them with a plus.
 *
 * A STAY IS NOT A BOOKING UNLESS IT SAYS SO. A hotel chosen in our own search carries
 * source='picked' and no money has moved; one the person booked elsewhere and typed in here
 * says 'recorded'. The two are labelled differently on the row, because calling the first a
 * reservation would be the app claiming something it did not do.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import DayPicker, { shortDay, todayISO } from "./day-picker";
import EventDetailView from "./event-detail";
import {
  Bookings, Money, MusicEvent, MyShow, StayLine, TicketLine, TravelLine, TravelMode, Trip,
  addTravelLeg, clearStayBase, getBookings, getMyShows, recordStay, removeTravelLeg,
  setTicketCost,
} from "../lib/api";
import { coverColor, flagEmoji, formatDay, zonedDay } from "../lib/format";


/** The codes on the quick-pick row. Not a validated list of world currencies — just the ones
 *  worth one tap. Anything else is typed in, and the server takes any three letters. */
const CURRENCIES = ["GBP", "EUR", "USD", "INR", "AUD", "CAD", "JPY", "SEK"];

const SYMBOL: Record<string, string> = {
  GBP: "£", EUR: "€", USD: "$", INR: "₹", JPY: "¥", AUD: "A$", CAD: "C$",
};

const MODES: { key: TravelMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "plane", label: "Flight", icon: "airplane-outline" },
  { key: "train", label: "Train", icon: "train-outline" },
  { key: "bus", label: "Bus", icon: "bus-outline" },
  { key: "car", label: "Drive", icon: "car-outline" },
];
const modeOf = (m: TravelMode) => MODES.find((x) => x.key === m) ?? MODES[0];

/** "£220" — the symbol where we know one, otherwise the code, which is never wrong. */
function money(m: Money): string {
  const sym = SYMBOL[m.currency];
  const n = Math.round(m.amount).toLocaleString();
  return sym ? `${sym}${n}` : `${n} ${m.currency}`;
}
const moneyList = (ms: Money[]): string => ms.map(money).join(" + ");

/** The eyebrow on a card. Null date says so rather than counting down to nothing. */
function countdown(days: number | null): string {
  if (days === null) return "DATE TBA";
  if (days < 0) return "ATTENDED";
  if (days === 0) return "TONIGHT";
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}

/* ------------------------------------------------------------------ small pieces */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fld}>{label}</Text>
      {children}
    </View>
  );
}

function DateField({ value, placeholder, onPress }: {
  value: string | null; placeholder: string; onPress: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.input} onPress={onPress}>
      <Text style={value ? styles.inputT : styles.inputPh}>
        {value ? shortDay(value) : placeholder}
      </Text>
      <Ionicons name="calendar-outline" size={16} color={th.muted} />
    </Pressable>
  );
}

/** Currency then amount, on one line, because neither means anything alone. The code is a
 *  scrollable row of one-tap choices plus a three-letter box for everything else. */
function MoneyField({ currency, amount, onCurrency, onAmount }: {
  currency: string; amount: string;
  onCurrency: (c: string) => void; onAmount: (a: string) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: 6, paddingVertical: 2,
                                           alignItems: "center" }}>
        {CURRENCIES.map((c) => (
          <Pressable key={c} onPress={() => onCurrency(c)}
                     style={[styles.chip, currency === c && styles.chipOn]}>
            <Text style={[styles.chipT, currency === c && styles.chipTOn]}>
              {SYMBOL[c] ? `${SYMBOL[c]} ${c}` : c}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <TextInput
          style={[styles.input, { width: 88 }]}
          value={currency}
          onChangeText={(t) => onCurrency(t.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
          placeholder="CUR" placeholderTextColor={th.muted}
          autoCapitalize="characters" maxLength={3}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={amount} onChangeText={(t) => onAmount(t.replace(/[^0-9.]/g, ""))}
          placeholder="Total cost (optional)" placeholderTextColor={th.muted}
          keyboardType="decimal-pad" inputMode="decimal"
        />
      </View>
    </>
  );
}

/** The shell every add-sheet sits in: title, scrollable body, one primary button. */
function Sheet({ visible, title, note, saving, error, cta, onClose, onSave, children }: {
  visible: boolean; title: string; note?: string; saving: boolean; error: string | null;
  cta: string; onClose: () => void; onSave: () => void; children: React.ReactNode;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <KeyboardAvoidingView style={{ flex: 1 }}
                              behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 40 }}>
              <Ionicons name="close" size={22} color={th.text} />
            </Pressable>
            <Text style={styles.headT}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
                      keyboardShouldPersistTaps="handled">
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {children}
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.foot}>
            <Pressable style={[styles.btn, saving && styles.btnOff]} disabled={saving}
                       onPress={onSave}>
              {saving ? <ActivityIndicator color={th.accentInk} />
                : <Text style={styles.btnT}>{cta}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/* -------------------------------------------------------------------- the sheets */

type DateTarget = "in" | "out" | "when" | "cancel" | null;

function StaySheet({ trip, onClose, onSaved }: {
  trip: Trip; onClose: () => void; onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = trip.stay;
  // A stay defaults to the night OF the show and out the morning after — the shape of nearly
  // every one of these, and the two taps most people would otherwise make.
  //
  // The show's day in the VENUE's timezone, not UTC. A 20:00 concert in Hollywood is 03:00
  // the next day in UTC, so slicing the timestamp would have offered a check-in the day
  // after the gig while the card above it said the 29th.
  const showDay = trip.event.starts_at
    ? zonedDay(trip.event.starts_at, trip.event.timezone) : todayISO();
  const nextDay = new Date(new Date(showDay + "T12:00:00").getTime() + 86400000)
    .toISOString().slice(0, 10);

  const [name, setName] = useState(s?.name ?? "");
  const [cin, setCin] = useState<string | null>(s?.check_in ?? showDay);
  const [cout, setCout] = useState<string | null>(s?.check_out ?? nextDay);
  const [cur, setCur] = useState(s?.currency ?? "GBP");
  const [cost, setCost] = useState(s?.cost != null ? String(s.cost) : "");
  const [ref, setRef] = useState(s?.booking_ref ?? "");
  const [cx, setCx] = useState<string | null>(s?.free_cancel_until ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<DateTarget>(null);

  async function save() {
    if (!name.trim()) { setError("Add the hotel name."); return; }
    setSaving(true); setError(null);
    try {
      await recordStay(trip.event.id, {
        name: name.trim(),
        check_in: cin, check_out: cout,
        cost: cost ? Number(cost) : null,
        currency: cost ? cur : null,
        booking_ref: ref.trim() || null,
        free_cancel_until: cx,
      });
      onSaved();
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Sheet visible title={s ? "Edit your stay" : "Add your stay"}
             note={`Record the place you booked for ${trip.event.title}. Nothing here is shared `
               + `— it is your record, not a reservation we hold.`}
             saving={saving} error={error} cta="Save to my trip"
             onClose={onClose} onSave={save}>
        <Field label="Hotel or place">
          <TextInput style={styles.input} value={name} onChangeText={setName}
                     placeholder="e.g. Michelberger Hotel" placeholderTextColor={th.muted} />
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Check-in">
              <DateField value={cin} placeholder="Pick a day" onPress={() => setDate("in")} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Check-out">
              <DateField value={cout} placeholder="Pick a day" onPress={() => setDate("out")} />
            </Field>
          </View>
        </View>
        <Field label="What it cost">
          <MoneyField currency={cur} amount={cost} onCurrency={setCur} onAmount={setCost} />
        </Field>
        <Field label="Booking reference (optional)">
          <TextInput style={styles.input} value={ref} onChangeText={setRef}
                     placeholder="e.g. Booking.com #12345" placeholderTextColor={th.muted} />
        </Field>
        <Field label="Free-cancel until (optional)">
          <DateField value={cx} placeholder="No free cancellation"
                     onPress={() => setDate("cancel")} />
        </Field>
        <Text style={styles.hint}>
          <Ionicons name="notifications-outline" size={12} color={th.muted} />
          {"  We’ll flag it here the week your cancellation window closes."}
        </Text>
      </Sheet>

      <DayPicker
        visible={date === "in"} value={cin} title="Check-in" from={showDay ? null : undefined}
        onClose={() => setDate(null)}
        onChange={(d) => { setCin(d); if (d && cout && cout < d) setCout(null); }} />
      <DayPicker
        visible={date === "out"} value={cout} title="Check-out" from={cin || undefined}
        onClose={() => setDate(null)} onChange={setCout} />
      <DayPicker
        visible={date === "cancel"} value={cx} title="Free-cancel until"
        onClose={() => setDate(null)} onChange={setCx} />
    </>
  );
}

function TravelSheet({ trip, homeCity, onClose, onSaved }: {
  trip: Trip; homeCity: string | null; onClose: () => void; onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showDay = trip.event.starts_at
    ? zonedDay(trip.event.starts_at, trip.event.timezone) : null;   // venue's day, not UTC
  const [mode, setMode] = useState<TravelMode>("plane");
  const [from, setFrom] = useState(homeCity ?? "");
  const [to, setTo] = useState(trip.event.city ?? "");
  const [when, setWhen] = useState<string | null>(showDay);
  const [cur, setCur] = useState("GBP");
  const [cost, setCost] = useState("");
  const [ref, setRef] = useState("");
  const [cx, setCx] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<DateTarget>(null);

  async function save() {
    if (!from.trim() || !to.trim()) { setError("Add where you're going from and to."); return; }
    setSaving(true); setError(null);
    try {
      await addTravelLeg(trip.event.id, {
        mode, from_label: from.trim(), to_label: to.trim(), travel_on: when,
        cost: cost ? Number(cost) : null,
        currency: cost ? cur : null,
        booking_ref: ref.trim() || null,
        free_cancel_until: cx,
      });
      onSaved();
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Sheet visible title="Add a travel leg"
             note="Flight, train, bus or a drive — whatever gets you there. Add the way back as
                   a second leg."
             saving={saving} error={error} cta="Save to my trip"
             onClose={onClose} onSave={save}>
        <Field label="How you’re going">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {MODES.map((m) => (
              <Pressable key={m.key} onPress={() => setMode(m.key)}
                         style={[styles.modeBtn, mode === m.key && styles.modeOn]}>
                <Ionicons name={m.icon} size={17} color={mode === m.key ? th.accentInk : th.text2} />
                <Text style={[styles.modeT, mode === m.key && styles.modeTOn]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="From">
              <TextInput style={styles.input} value={from} onChangeText={setFrom}
                         placeholder="Home" placeholderTextColor={th.muted} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To">
              <TextInput style={styles.input} value={to} onChangeText={setTo}
                         placeholder="The show" placeholderTextColor={th.muted} />
            </Field>
          </View>
        </View>
        <Field label="When">
          <DateField value={when} placeholder="Pick a day" onPress={() => setDate("when")} />
        </Field>
        <Field label="What it cost">
          <MoneyField currency={cur} amount={cost} onCurrency={setCur} onAmount={setCost} />
        </Field>
        <Field label="Booking reference (optional)">
          <TextInput style={styles.input} value={ref} onChangeText={setRef}
                     placeholder="e.g. BA #ABC123" placeholderTextColor={th.muted} />
        </Field>
        <Field label="Free-cancel until (optional)">
          <DateField value={cx} placeholder="No free cancellation"
                     onPress={() => setDate("cancel")} />
        </Field>
      </Sheet>

      <DayPicker visible={date === "when"} value={when} title="Travel day" from={null}
                 onClose={() => setDate(null)} onChange={setWhen} />
      <DayPicker visible={date === "cancel"} value={cx} title="Free-cancel until"
                 onClose={() => setDate(null)} onChange={setCx} />
    </>
  );
}

function TicketCostSheet({ trip, onClose, onSaved }: {
  trip: Trip; onClose: () => void; onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = trip.ticket;
  const [cur, setCur] = useState(t.currency ?? "GBP");
  const [cost, setCost] = useState(t.cost != null ? String(t.cost) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(clear = false) {
    setSaving(true); setError(null);
    try {
      await setTicketCost(trip.event.id, clear || !cost ? null : Number(cost),
                          clear || !cost ? null : cur);
      onSaved();
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setSaving(false); }
  }

  return (
    <Sheet visible title="What the ticket cost"
           note={"Only what you actually paid. We will not guess it from the listing price — "
             + "that is the cheapest tier advertised, and it would make your trip total a "
             + "number nobody was charged."}
           saving={saving} error={error} cta="Save" onClose={onClose} onSave={() => save()}>
      <Field label={trip.event.title}>
        <MoneyField currency={cur} amount={cost} onCurrency={setCur} onAmount={setCost} />
      </Field>
      {t.cost != null ? (
        <Pressable onPress={() => save(true)} style={styles.rmBtn}>
          <Text style={styles.rmT}>Remove the price</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

/** Picking which saved show a new trip belongs to. The ledger only holds shows with something
 *  booked against them, so without this there is no way in for somebody whose first act is
 *  booking the hotel. */
function StartTripSheet({ onClose, onPick }: {
  onClose: () => void; onPick: (e: MusicEvent) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [shows, setShows] = useState<MyShow[] | null>(null);
  useEffect(() => {
    getMyShows()
      .then((d) => setShows(d.shows.filter((s) => s.state !== "attended"
                                              && s.state !== "missed")))
      .catch(() => setShows([]));
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={10} style={{ width: 40 }}>
            <Ionicons name="close" size={22} color={th.text} />
          </Pressable>
          <Text style={styles.headT}>Start a trip</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={[styles.note, { paddingHorizontal: 16 }]}>
          Pick one of your saved shows and add the stay or the travel you have booked.
        </Text>
        {shows === null ? <ActivityIndicator color={th.accent} style={{ marginTop: 30 }} /> : (
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            {shows.map((s) => (
              <Pressable key={s.id} style={styles.pickRow} onPress={() => onPick(s)}>
                <View style={[styles.thumb,
                              { backgroundColor: coverColor(s.headliner || s.title) }]}>
                  <Text style={{ fontSize: 17 }}>{flagEmoji(s.country)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowT} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.rowD} numberOfLines={1}>
                    {formatDay(s.starts_at, s.timezone)}{s.city ? ` · ${s.city}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={th.muted} />
              </Pressable>
            ))}
            {!shows.length ? (
              <Text style={styles.emptyT}>
                {"You have no upcoming saved shows yet.\nSave one first, then come back."}
              </Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ ledger card */

function LedgerLine({ icon, title, tag, sub, warn, cost, onPress, onRemove }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; tag?: string; sub?: string;
  warn?: string | null; cost?: string | null;
  onPress?: () => void; onRemove?: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.lg} onPress={onPress} disabled={!onPress}>
      <View style={styles.lgIcon}><Ionicons name={icon} size={16} color={th.accent} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={styles.lgT} numberOfLines={1}>{title}</Text>
          {tag ? (
            <View style={styles.lgTag}>
              <Ionicons name="checkmark" size={10} color={th.accent} />
              <Text style={styles.lgTagT}>{tag}</Text>
            </View>
          ) : null}
        </View>
        {sub ? <Text style={styles.lgS} numberOfLines={1}>{sub}</Text> : null}
        {warn ? (
          <Text style={styles.lgWarn}>
            <Ionicons name="notifications-outline" size={11} color={th.warn} />{`  ${warn}`}
          </Text>
        ) : null}
      </View>
      {cost ? <Text style={styles.lgCost}>{cost}</Text> : null}
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={{ paddingLeft: 6 }}>
          <Ionicons name="close" size={16} color={th.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function AddLine({ icon, title, sub, go, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; sub: string;
  /** True when this leads to another screen rather than opening a form here. */
  go?: boolean;
  onPress: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.lg} onPress={onPress}>
      <View style={styles.lgIconOff}><Ionicons name={icon} size={16} color={th.muted} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.lgT, { color: th.muted }]}>{title}</Text>
        <Text style={styles.lgS}>{sub}</Text>
      </View>
      <Ionicons name={go ? "chevron-forward" : "add"} size={go ? 16 : 18} color={th.accent} />
    </Pressable>
  );
}

/** The line under a ticket row. Whatever we know about it, then the invitation to add the
 *  price — which has to change once a price exists, or the row keeps asking for something it
 *  is already showing on the right. */
function ticketSub(t: TicketLine): string {
  const known = [t.provider, t.reference].filter(Boolean).join(" · ");
  const price = t.cost == null ? "Tap to add what you paid" : "Tap to change the price";
  return known ? `${known} · ${price.toLowerCase()}` : price;
}

function stayDates(s: StayLine): string {
  const bits: string[] = [];
  if (s.check_in) bits.push(shortDay(s.check_in));
  if (s.check_out) bits.push(shortDay(s.check_out));
  const dates = bits.join(" → ");
  return [dates, s.booking_ref].filter(Boolean).join(" · ");
}

function legSub(l: TravelLine): string {
  return [l.travel_on ? shortDay(l.travel_on) : null, l.booking_ref]
    .filter(Boolean).join(" · ");
}

function TripCard({ trip, homeCity, onOpenEvent, onChanged }: {
  trip: Trip; homeCity: string | null; onOpenEvent: () => void; onChanged: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [sheet, setSheet] = useState<"stay" | "travel" | "ticket" | null>(null);
  const e = trip.event;
  const spend = trip.spend.length ? moneyList(trip.spend) : null;
  const cost = (amount: number | null, currency: string | null) =>
    amount != null && currency ? money({ amount, currency })
      : amount != null ? String(Math.round(amount)) : null;

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpenEvent}
                 style={[styles.cardHead, { backgroundColor: coverColor(e.headliner || e.title) }]}>
        <Text style={styles.cardWhen}>{countdown(trip.days_until)}</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>{e.title}</Text>
        <Text style={styles.cardLoc} numberOfLines={1}>
          {flagEmoji(e.country)} {e.city ?? "—"} · {formatDay(e.starts_at, e.timezone)}
        </Text>
      </Pressable>

      <View style={styles.cardStat}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          {[trip.ticket.booked, !!trip.stay, trip.travel.length > 0].map((on, i) => (
            <View key={i} style={[styles.dot, on && styles.dotOn]} />
          ))}
          <Text style={styles.cardStatT}>
            {trip.stages_done}/{trip.stages_total} booked
          </Text>
        </View>
        {spend ? <Text style={styles.cardSpend}>{spend}</Text> : null}
      </View>

      {/* The banner says THAT something is closing; the rows below say which and when. The
          two used to print the same date one line apart. */}
      {trip.cancel_soon ? (
        <View style={styles.alert}>
          <Ionicons name="notifications" size={13} color={th.warn} />
          <Text style={styles.alertT}>
            {trip.cancel_soon === 1
              ? "A free-cancellation window closes this week — see below."
              : `${trip.cancel_soon} free-cancellation windows close this week.`}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardBody}>
        {trip.ticket.booked ? (
          <LedgerLine
            icon="ticket-outline"
            title={e.title}
            tag="Ticket saved"
            sub={ticketSub(trip.ticket)}
            cost={cost(trip.ticket.cost, trip.ticket.currency)}
            onPress={() => setSheet("ticket")}
          />
        ) : (
          <AddLine icon="ticket-outline" title="Get your ticket"
                   sub="Opens the show page" go onPress={onOpenEvent} />
        )}

        {trip.stay ? (
          <LedgerLine
            icon="bed-outline"
            title={trip.stay.name}
            // 'picked' means they pointed at it in our search and paid nothing. Saying
            // "Booked" there would be the app inventing a reservation.
            tag={trip.stay.source === "picked" ? "Your base" : "Booked"}
            sub={stayDates(trip.stay)}
            warn={trip.stay.cancel_soon
                  ? `Free-cancel closes ${shortDay(trip.stay.free_cancel_until)}` : null}
            cost={cost(trip.stay.cost, trip.stay.currency)}
            onPress={() => setSheet("stay")}
            onRemove={async () => { await clearStayBase(e.id); onChanged(); }}
          />
        ) : (
          <AddLine icon="bed-outline" title="Add your stay"
                   sub="Hotel, or wherever you’re crashing" onPress={() => setSheet("stay")} />
        )}

        {trip.travel.map((l) => (
          <LedgerLine
            key={l.id}
            icon={modeOf(l.mode).icon}
            title={`${l.from_label ?? ""} → ${l.to_label ?? ""}`}
            tag={modeOf(l.mode).label}
            sub={legSub(l)}
            warn={l.cancel_soon
                  ? `Free-cancel closes ${shortDay(l.free_cancel_until)}` : null}
            cost={cost(l.cost, l.currency)}
            onRemove={async () => { await removeTravelLeg(e.id, l.id); onChanged(); }}
          />
        ))}
        <AddLine icon="airplane-outline"
                 title={trip.travel.length ? "Add another leg" : "Add flight, train or drive"}
                 sub={trip.travel.length ? "The way back, or the next hop"
                                         : "How you’re getting there"}
                 onPress={() => setSheet("travel")} />
      </View>

      {sheet === "stay" ? (
        <StaySheet trip={trip} onClose={() => setSheet(null)}
                   onSaved={() => { setSheet(null); onChanged(); }} />
      ) : null}
      {sheet === "travel" ? (
        <TravelSheet trip={trip} homeCity={homeCity} onClose={() => setSheet(null)}
                     onSaved={() => { setSheet(null); onChanged(); }} />
      ) : null}
      {sheet === "ticket" ? (
        <TicketCostSheet trip={trip} onClose={() => setSheet(null)}
                         onSaved={() => { setSheet(null); onChanged(); }} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ the screen */

/** A show picked in "Start a trip" has no ledger row yet, so one is faked locally just to open
 *  the sheet against. Nothing is written until the sheet saves — which is what creates the
 *  real row, and the reload after it brings back the server's version. */
function blankTrip(e: MusicEvent): Trip {
  return {
    event: e,
    ticket: { booked: false, provider: null, reference: null, source: null, at: null,
              cost: null, currency: null },
    stay: null, travel: [], stages_done: 0, stages_total: 3, spend: [],
    days_until: null, cancel_soon: 0,
  };
}

export default function MyBookingsView({ onClose, homeCity }:
  { onClose: () => void; homeCity?: string | null }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [data, setData] = useState<Bookings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [newTrip, setNewTrip] = useState<MusicEvent | null>(null);
  const [newKind, setNewKind] = useState<"stay" | "travel" | null>(null);

  const load = useCallback(() => {
    getBookings()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const total = useMemo(() => (data?.spend.length ? moneyList(data.spend) : "—"), [data]);
  const empty = !!data && !data.upcoming.length && !data.past.length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={22} color={th.text} />
        </Pressable>
        <Text style={styles.headT}>My bookings</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? <ActivityIndicator color={th.accent} style={{ marginTop: 40 }} /> : error ? (
        <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 28 }}>
          <Text style={styles.emptyT}>{error}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryT}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 44 }}>
          {empty ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIc}>
                <Ionicons name="ticket-outline" size={26} color={th.accent} />
              </View>
              <Text style={styles.emptyH}>No trips booked yet</Text>
              <Text style={styles.emptyT}>
                Once you have a ticket, a bed or a way there, this becomes your trip ledger —
                what is booked, what is not, and what it all cost, on one card per show.
              </Text>
              <Pressable style={styles.cta} onPress={() => setStarting(true)}>
                <Text style={styles.ctaT}>Start a trip</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.summary}>
                <View style={styles.sumCell}>
                  <Text style={styles.sumN}>{data!.trips}</Text>
                  <Text style={styles.sumL}>{data!.trips === 1 ? "Trip" : "Trips"}</Text>
                </View>
                <View style={styles.sumCell}>
                  <Text style={styles.sumN} numberOfLines={1} adjustsFontSizeToFit>{total}</Text>
                  <Text style={styles.sumL}>All-in</Text>
                </View>
                <View style={[styles.sumCell, !!data!.cancel_windows && styles.sumAlert]}>
                  <Text style={[styles.sumN, !!data!.cancel_windows && { color: th.warn }]}>
                    {data!.cancel_windows || data!.upcoming.length}
                  </Text>
                  <Text style={styles.sumL}>
                    {data!.cancel_windows ? "Cancel windows" : "Coming up"}
                  </Text>
                </View>
              </View>

              {data!.upcoming.length ? <Text style={styles.sec}>Coming up</Text> : null}
              {data!.upcoming.map((t) => (
                <TripCard key={t.event.id} trip={t} homeCity={homeCity ?? null}
                          onOpenEvent={() => setOpenEvent(t.event.id)} onChanged={load} />
              ))}

              {data!.past.length ? <Text style={styles.sec}>Past trips</Text> : null}
              {data!.past.map((t) => (
                <TripCard key={t.event.id} trip={t} homeCity={homeCity ?? null}
                          onOpenEvent={() => setOpenEvent(t.event.id)} onChanged={load} />
              ))}

              <Pressable style={styles.startBtn} onPress={() => setStarting(true)}>
                <Ionicons name="add" size={17} color={th.accent} />
                <Text style={styles.startT}>Start a trip for another show</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.foothint}>
            <Ionicons name="checkmark-circle-outline" size={12} color={th.muted} />
            {"  Only what you record here. We never read your inbox."}
          </Text>
        </ScrollView>
      )}

      {starting ? (
        <StartTripSheet
          onClose={() => setStarting(false)}
          onPick={(e) => { setStarting(false); setNewTrip(e); setNewKind(null); }} />
      ) : null}

      {/* Picked a show but not yet said what they are adding. Two buttons rather than
          guessing, because a hotel and a flight are not the same form. */}
      <Modal visible={!!newTrip && !newKind} animationType="fade" transparent
             onRequestClose={() => setNewTrip(null)}>
        <Pressable style={styles.scrim} onPress={() => setNewTrip(null)}>
          {/* stopPropagation, or tapping a button inside the box also counts as tapping the
              scrim behind it and the sheet closes instead of opening. Nested Pressables do
              not bubble on native; on web they do. */}
          <Pressable style={styles.choice} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.choiceT} numberOfLines={2}>{newTrip?.title}</Text>
            <Pressable style={styles.choiceBtn} onPress={() => setNewKind("stay")}>
              <Ionicons name="bed-outline" size={17} color={th.accent} />
              <Text style={styles.choiceBT}>Add your stay</Text>
            </Pressable>
            <Pressable style={styles.choiceBtn} onPress={() => setNewKind("travel")}>
              <Ionicons name="airplane-outline" size={17} color={th.accent} />
              <Text style={styles.choiceBT}>Add travel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {newTrip && newKind === "stay" ? (
        <StaySheet trip={blankTrip(newTrip)}
                   onClose={() => { setNewTrip(null); setNewKind(null); }}
                   onSaved={() => { setNewTrip(null); setNewKind(null); load(); }} />
      ) : null}
      {newTrip && newKind === "travel" ? (
        <TravelSheet trip={blankTrip(newTrip)} homeCity={homeCity ?? null}
                     onClose={() => { setNewTrip(null); setNewKind(null); }}
                     onSaved={() => { setNewTrip(null); setNewKind(null); load(); }} />
      ) : null}

      <Modal visible={!!openEvent} animationType="slide"
             onRequestClose={() => { setOpenEvent(null); load(); }}>
        {openEvent ? (
          <EventDetailView id={openEvent} onClose={() => { setOpenEvent(null); load(); }} />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  headT: { color: th.text, fontSize: 17, fontWeight: "900" },

  summary: {
    flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 6,
  },
  sumCell: {
    flex: 1, backgroundColor: th.panel, borderRadius: 14, paddingVertical: 14,
    alignItems: "center", borderWidth: 1, borderColor: th.line,
  },
  sumAlert: { borderColor: th.warn },
  sumN: { color: th.text, fontSize: 19, fontWeight: "900" },
  sumL: { color: th.muted, fontSize: 11, fontWeight: "700", marginTop: 3 },

  sec: {
    color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1,
    textTransform: "uppercase", marginTop: 18, marginBottom: 8, paddingHorizontal: 16,
  },

  card: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: 16, overflow: "hidden",
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
  },
  cardHead: { padding: 14, paddingTop: 16 },
  cardWhen: {
    color: "rgba(255,255,255,.82)", fontSize: 10, fontWeight: "900", letterSpacing: 1.4,
  },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 4 },
  cardLoc: { color: "rgba(255,255,255,.85)", fontSize: 12, marginTop: 4 },

  cardStat: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: th.line2,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: th.line3 },
  dotOn: { backgroundColor: th.accentFill },
  cardStatT: { color: th.muted, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  cardSpend: { color: th.text, fontSize: 13, fontWeight: "800" },

  alert: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: alpha(th.festival, 0.10), paddingHorizontal: 14, paddingVertical: 9,
  },
  alertT: { color: th.warn, fontSize: 12, fontWeight: "700", flex: 1 },

  cardBody: { paddingVertical: 4 },
  lg: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  lgIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: th.panel2,
    alignItems: "center", justifyContent: "center",
  },
  lgIconOff: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: th.panel,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: th.panel3, borderStyle: "dashed",
  },
  lgT: { color: th.text, fontSize: 13.5, fontWeight: "700", flexShrink: 1 },
  lgTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: alpha(th.accent, 0.12), borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  lgTagT: { color: th.accent, fontSize: 10, fontWeight: "800" },
  lgS: { color: th.muted, fontSize: 11.5, marginTop: 2 },
  lgWarn: { color: th.warn, fontSize: 11, fontWeight: "700", marginTop: 3 },
  lgCost: { color: th.text, fontSize: 13, fontWeight: "800" },

  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    marginHorizontal: 16, marginTop: 6, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: th.line, borderStyle: "dashed",
  },
  startT: { color: th.accent, fontSize: 13, fontWeight: "800" },

  emptyBox: { alignItems: "center", paddingHorizontal: 30, paddingTop: 40,
              maxWidth: 460, alignSelf: "center" },
  emptyIc: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: th.panel,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: th.line,
  },
  emptyH: { color: th.text, fontSize: 17, fontWeight: "900", marginTop: 16 },
  emptyT: { color: th.muted, fontSize: 13, textAlign: "center", lineHeight: 20, marginTop: 8 },
  cta: {
    marginTop: 20, backgroundColor: th.accentFill, borderRadius: 12,
    paddingHorizontal: 26, paddingVertical: 13,
  },
  ctaT: { color: th.accentInk, fontSize: 14, fontWeight: "900" },
  retry: {
    marginTop: 16, backgroundColor: th.panel3, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  retryT: { color: th.text, fontSize: 13, fontWeight: "700" },
  foothint: {
    color: th.muted, fontSize: 11.5, textAlign: "center", marginTop: 20, paddingHorizontal: 30,
  },

  // ---- sheets
  note: { color: th.muted, fontSize: 12.5, lineHeight: 19, marginBottom: 4 },
  fld: { color: th.muted, fontSize: 11, fontWeight: "800", marginBottom: 6, letterSpacing: 0.4 },
  input: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 12, color: th.text, fontSize: 14,
  },
  inputT: { color: th.text, fontSize: 14 },
  inputPh: { color: th.muted, fontSize: 14 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
  },
  chipOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },
  chipT: { color: th.text2, fontSize: 12, fontWeight: "700" },
  chipTOn: { color: th.accentInk, fontWeight: "900" },
  modeBtn: {
    flex: 1, alignItems: "center", gap: 4, paddingVertical: 11, borderRadius: 11,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
  },
  modeOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },
  modeT: { color: th.text2, fontSize: 11, fontWeight: "700" },
  modeTOn: { color: th.accentInk, fontWeight: "900" },
  hint: { color: th.muted, fontSize: 11.5, marginTop: 14, lineHeight: 17 },
  err: { color: th.danger, fontSize: 12.5, marginTop: 14, fontWeight: "600" },
  foot: { padding: 14, borderTopWidth: 1, borderTopColor: th.line2 },
  btn: { backgroundColor: th.accentFill, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnOff: { opacity: 0.6 },
  btnT: { color: th.accentInk, fontSize: 15, fontWeight: "900" },
  rmBtn: { marginTop: 18, alignItems: "center", paddingVertical: 10 },
  rmT: { color: th.danger, fontSize: 13, fontWeight: "700" },

  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: th.panel,
  },
  thumb: {
    width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  rowT: { color: th.text, fontSize: 14, fontWeight: "700" },
  rowD: { color: th.muted, fontSize: 12, marginTop: 3 },

  scrim: {
    flex: 1, backgroundColor: th.scrim, justifyContent: "center", padding: 30,
  },
  choice: {
    backgroundColor: th.panel, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: th.line,
    width: "100%", maxWidth: 420, alignSelf: "center",
  },
  choiceT: { color: th.text, fontSize: 15, fontWeight: "800", marginBottom: 14 },
  choiceBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13,
    paddingHorizontal: 14, borderRadius: 12, backgroundColor: th.panel2, marginBottom: 8,
  },
  choiceBT: { color: th.text, fontSize: 14, fontWeight: "700" },
});
