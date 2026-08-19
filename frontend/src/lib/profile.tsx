import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { getMe, Profile, updateProfile } from "./api";

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  homeCountry: string | null;
  setHomeCity: (cityId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setProfile(await getMe());
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setHomeCity = useCallback(async (cityId: string) => {
    const updated = await updateProfile({ home_city_id: cityId });
    setProfile(updated);
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        homeCountry: profile?.home_city_country ?? null,
        setHomeCity,
        refresh,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}
