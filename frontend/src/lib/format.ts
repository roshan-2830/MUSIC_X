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

/** Compact audience number: 4030 -> "4K", 283680 -> "284K", 12746296 -> "12.7M".
 *  Rounded on purpose. A follower count moves every hour, so printing "283,680" claims a
 *  precision that is already stale by the time it renders. */
export function formatCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined || n < 0) return null;
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`;
}

/** The audience line under an artist's name — what tells you which "A.R. Rahman" is the
 *  real one. Always names the service, and never merges the two numbers: Deezer counts
 *  FOLLOWERS, Last.fm counts distinct LISTENERS. Different populations on different
 *  scales, so adding or averaging them would invent a statistic. Null when we could not
 *  confidently identify the artist on either service, and the line simply does not render
 *  rather than showing a zero we cannot stand behind. */
export function audienceLine(a: {
  deezer_fans?: number | null;
  lastfm_listeners?: number | null;
  fans?: number | null;
}): string | null {
  const d = formatCount(a.deezer_fans ?? a.fans ?? null);
  const l = formatCount(a.lastfm_listeners ?? null);
  if (d && l) return `${d} followers · Deezer  ·  ${l} listeners · Last.fm`;
  if (d) return `${d} followers on Deezer`;
  if (l) return `${l} listeners on Last.fm`;
  return null;
}
