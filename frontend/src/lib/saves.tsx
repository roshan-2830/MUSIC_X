import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  Festival,
  getSaves,
  getSavedFestivals,
  MusicEvent,
  saveEvent,
  saveFestival,
  unsaveEvent,
  unsaveFestival,
} from "./api";

type SavesContextValue = {
  saves: MusicEvent[];
  isSaved: (id: string) => boolean;
  toggle: (event: MusicEvent) => Promise<void>;
  // Festivals are saved into the same table on the server, but kept as a separate list
  // here because an id alone can't say which kind it is — and a concert and a festival
  // are rendered by different cards.
  savedFestivals: Festival[];
  isFestivalSaved: (id: string) => boolean;
  toggleFestival: (festival: Festival) => Promise<void>;
  refresh: () => Promise<void>;
};

const SavesContext = createContext<SavesContextValue | undefined>(undefined);

export function SavesProvider({ children }: { children: ReactNode }) {
  const [saves, setSaves] = useState<MusicEvent[]>([]);
  const [savedFestivals, setSavedFestivals] = useState<Festival[]>([]);

  const refresh = useCallback(async () => {
    // Settled, not all: a failure on one list must not blank the other.
    const [e, f] = await Promise.allSettled([getSaves(), getSavedFestivals()]);
    if (e.status === "fulfilled") setSaves(e.value);
    if (f.status === "fulfilled") setSavedFestivals(f.value);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const savedIds = useMemo(() => new Set(saves.map((e) => e.id)), [saves]);
  const savedFestivalIds = useMemo(() => new Set(savedFestivals.map((f) => f.id)), [savedFestivals]);

  const toggle = useCallback(
    async (event: MusicEvent) => {
      const saved = savedIds.has(event.id);
      // optimistic update
      setSaves((prev) => (saved ? prev.filter((e) => e.id !== event.id) : [...prev, event]));
      try {
        if (saved) await unsaveEvent(event.id);
        else await saveEvent(event.id);
      } catch {
        refresh(); // revert to server truth on failure
      }
    },
    [savedIds, refresh]
  );

  const toggleFestival = useCallback(
    async (festival: Festival) => {
      const saved = savedFestivalIds.has(festival.id);
      setSavedFestivals((prev) =>
        saved ? prev.filter((f) => f.id !== festival.id) : [...prev, festival]
      );
      try {
        if (saved) await unsaveFestival(festival.id);
        else await saveFestival(festival.id);
      } catch {
        refresh();
      }
    },
    [savedFestivalIds, refresh]
  );

  return (
    <SavesContext.Provider
      value={{
        saves,
        isSaved: (id) => savedIds.has(id),
        toggle,
        savedFestivals,
        isFestivalSaved: (id) => savedFestivalIds.has(id),
        toggleFestival,
        refresh,
      }}
    >
      {children}
    </SavesContext.Provider>
  );
}

export function useSaves() {
  const ctx = useContext(SavesContext);
  if (!ctx) throw new Error("useSaves must be used inside <SavesProvider>");
  return ctx;
}
