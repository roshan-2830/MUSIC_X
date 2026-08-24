export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// Single solid colour per event (no native module needed).
export function coverColor(seed: string): string {
  return `hsl(${hashHue(seed)}, 55%, 32%)`;
}

export function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return "";
  const A = 127397;
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => A + c.charCodeAt(0)));
}

export function formatDay(iso: string | null, tz?: string | null): string {
  if (!iso) return "Date TBA";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", timeZone: tz || "UTC",
    });
  } catch {
    return "Date TBA";
  }
}

/** The calendar day an event falls on **where it happens** — not where the viewer is.
 *  A 21:30 show in Detroit is on the 6th for everyone, including someone reading this
 *  in Mumbai at 03:00 on the 7th. Returns YYYY-MM-DD; en-CA is the locale that formats
 *  dates that way. */
export function zonedDay(iso: string, tz?: string | null): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: tz || "UTC" });
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

/** Door time in the venue's own timezone, 24h. Same reasoning as zonedDay. */
export function zonedTime(iso: string, tz?: string | null): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz || "UTC",
    });
  } catch {
    return "--:--";
  }
}
