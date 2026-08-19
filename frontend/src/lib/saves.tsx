import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getSaves, MusicEvent, saveEvent, unsaveEvent } from "./api";

type SavesContextValue = {
  saves: MusicEvent[];
  isSaved: (id: string) => boolean;
  toggle: (event: MusicEvent) => Promise<void>;
  refresh: () => Promise<void>;
};

const SavesContext = createContext<SavesContextValue | undefined>(undefined);

export function SavesProvider({ children }: { children: ReactNode }) {
  const [saves, setSaves] = useState<MusicEvent[]>([]);

  const refresh = useCallback(async () => {
    try {
      setSaves(await getSaves());
    } catch {
      // ignore — keep whatever we have
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const savedIds = useMemo(() => new Set(saves.map((e) => e.id)), [saves]);

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

  return (
    <SavesContext.Provider value={{ saves, isSaved: (id) => savedIds.has(id), toggle, refresh }}>
      {children}
    </SavesContext.Provider>
  );
}

export function useSaves() {
  const ctx = useContext(SavesContext);
  if (!ctx) throw new Error("useSaves must be used inside <SavesProvider>");
  return ctx;
}
