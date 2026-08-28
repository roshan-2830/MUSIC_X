import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Goer, Going } from "../lib/api";
import { Avatar } from "./invite-sheet";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const SHEET = "#101014";
const GOOD = "#7ef0b2";

function Person({ person, ticket }: { person: Goer; ticket: boolean }) {
  return (
    <View style={styles.row}>
      <Avatar name={person.display_name} />
      <Text style={styles.name} numberOfLines={1}>{person.display_name || "Someone"}</Text>
      {ticket ? (
        <View style={styles.badge}>
          <Ionicons name="ticket" size={11} color="#101204" />
          <Text style={styles.badgeText}>Ticket</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Who among the people you follow is going, in two groups.
 *
 * The split is the whole reason this sheet exists. "Going" and "thinking about it" are
 * different facts and the line above can only hold one sentence, so the detail lives here:
 * a ticket is something the person told us, a save is something they did. Collapsing the two
 * into one number would make the app claim more than it knows.
 *
 * Names are not tappable — there is no profile screen to land on, and a name that looks like a
 * link and does nothing is worse than one that plainly does not.
 */
export default function GoingSheet({
  visible, onClose, going, eventTitle,
}: {
  visible: boolean;
  onClose: () => void;
  going: Going | null;
  eventTitle: string | null;
}) {
  const withTicket = (going?.people ?? []).filter((p) => p.booked);
  const interested = (going?.people ?? []).filter((p) => !p.booked);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Who's going</Text>
              {eventTitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>{eventTitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView style={styles.list}>
            {withTicket.length ? (
              <>
                <View style={styles.groupHead}>
                  <Ionicons name="checkmark-circle" size={14} color={GOOD} />
                  <Text style={[styles.groupTitle, { color: GOOD }]}>
                    Going · {withTicket.length}
                  </Text>
                </View>
                <Text style={styles.groupNote}>They said they have a ticket.</Text>
                {withTicket.map((p) => <Person key={p.id} person={p} ticket />)}
              </>
            ) : null}

            {interested.length ? (
              <>
                <View style={[styles.groupHead, withTicket.length ? { marginTop: 20 } : null]}>
                  <Ionicons name="bookmark" size={14} color={ACCENT} />
                  <Text style={[styles.groupTitle, { color: ACCENT }]}>
                    Interested · {interested.length}
                  </Text>
                </View>
                <Text style={styles.groupNote}>They saved the show but haven't said they have a ticket.</Text>
                {interested.map((p) => <Person key={p.id} person={p} ticket={false} />)}
              </>
            ) : null}

            {!withTicket.length && !interested.length ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={18} color={MUTED} />
                <Text style={styles.emptyText}>
                  Nobody you follow has saved this one yet.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Said plainly, because the difference between the two groups is a limit of what we
              can know rather than a design choice. */}
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={13} color={MUTED} />
            <Text style={styles.noteText}>
              Only people you follow. We can't see ticket purchases — a ticket shows here
              because the person told us.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: SHEET, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22, maxHeight: "78%",
    borderWidth: 1, borderColor: LINE,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 2 },

  list: { marginTop: 4 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  groupTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  groupNote: { color: MUTED, fontSize: 11.5, marginTop: 3, marginBottom: 4 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: LINE,
  },
  name: { color: "#f4f4f6", fontSize: 14.5, fontWeight: "700", flex: 1 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ACCENT,
    borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8,
  },
  badgeText: { color: "#101204", fontSize: 10.5, fontWeight: "800" },

  empty: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 24 },
  emptyText: { color: MUTED, fontSize: 13, flex: 1 },

  note: { flexDirection: "row", gap: 7, marginTop: 12, alignItems: "flex-start" },
  noteText: { color: MUTED, fontSize: 11, lineHeight: 15.5, flex: 1 },
});
