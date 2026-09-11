import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState,
} from "react";

import { addToWishlist, getWishlist, removeFromWishlist, WishlistLine } from "./api";
import { useToast } from "./toast";

/**
 * The wishlist, held once for the whole app.
 *
 * A context and not a per-surface fetch, for the same reason SavesProvider is one: the heart
 * appears in three places at once — the Home artists strip, the search rows and the artist
 * page — and each of those asking the server on its own is a round trip to Singapore per
 * heart for one answer they all share.
 *
 * Keyed on the artist NAME, lowercased, not on the id. That is deliberate rather than lazy:
 * an event carries `headliner_artist_id`, but an artist reached from a Deezer search result
 * has no local id until it is added, and both have to be able to light the same heart. The
 * server reconciles either to one row through the shared normalised find-or-create, so the
 * name is the key both sides can always produce.
 */
type WishlistContextValue = {
  lines: WishlistLine[];
  isWished: (artistName: string | null | undefined) => boolean;
  toggle: (artist: { name: string; image_url?: string | null; artist_id?: string | null }) => Promise<void>;
  refresh: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<WishlistLine[]>([]);
  const { show } = useToast();

  const refresh = useCallback(async () => {
    try {
      const w = await getWishlist();
      setLines([...w.still_to_see, ...w.seen]);
    } catch {
      /* keep whatever we already have rather than blanking every heart on one bad call */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const wishedNames = useMemo(
    () => new Set(lines.map((l) => l.name.toLowerCase())),
    [lines],
  );

  const isWished = useCallback(
    (name: string | null | undefined) => !!name && wishedNames.has(name.toLowerCase()),
    [wishedNames],
  );

  const toggle = useCallback(
    async (artist: { name: string; image_url?: string | null; artist_id?: string | null }) => {
      const name = artist.name?.trim();
      if (!name) return;
      const on = wishedNames.has(name.toLowerCase());

      // Optimistic. A heart that waits on a round trip reads as a dead button, and this one
      // is now on every card in every list.
      const known = lines.find((l) => l.name.toLowerCase() === name.toLowerCase());
      setLines((prev) => on
        ? prev.filter((l) => l.name.toLowerCase() !== name.toLowerCase())
        : [...prev, {
            artist_id: artist.artist_id ?? `pending-${name}`,
            name,
            image_url: artist.image_url ?? null,
            deezer_fans: null, lastfm_listeners: null,
            added_on: new Date().toISOString(),
            seen: false, seen_via: null, seen_on: null,
            next_event_id: null, next_event_title: null, next_event_starts_at: null,
            next_event_city: null, next_event_country: null,
          }]);

      // Said before the round trip, to match the optimistic heart. A confirmation that
      // arrives 150ms after the tap describes the past; this one describes the tap.
      //
      // Undo only on removal. Adding is trivially reversible — the heart is right there —
      // while an accidental un-heart on a 24pt target in a tight row is how a line
      // disappears without anyone noticing.
      if (on) {
        show(`Removed ${name} from your wishlist`, {
          label: "UNDO",
          onPress: () => { toggle({ ...artist, name }); },
        });
      } else {
        show(`Added ${name} to your wishlist`);
      }

      try {
        if (on) {
          // Removing needs the real id. An optimistic line added moments ago may not have
          // one yet, so fall back to re-reading rather than deleting a made-up id.
          const id = known?.artist_id ?? artist.artist_id;
          if (id && !id.startsWith("pending-")) await removeFromWishlist(id);
          else { await refresh(); return; }
        } else {
          await addToWishlist({ name, image_url: artist.image_url ?? null });
        }
        // Re-read either way: the server decides the real id and whether the Passport
        // already crosses this act off, and neither is guessable here.
        await refresh();
      } catch {
        await refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wishedNames, lines, refresh, show],
  );

  const value = useMemo(() => ({ lines, isWished, toggle, refresh }),
                        [lines, isWished, toggle, refresh]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside a WishlistProvider");
  return ctx;
}
