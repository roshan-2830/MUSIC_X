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
