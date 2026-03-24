import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { getOrCreateDefaultHousehold } from "./platformData";

export function usePlatformHousehold() {
  const [state, setState] = useState({
    loading: true,
    household: null,
    context: {
      householdId: null,
      source: "loading",
      bootstrapped: false,
    },
    error: "",
  });

  useEffect(() => {
    let active = true;

    async function loadContextForUser(authUser = null) {
      const result = await getOrCreateDefaultHousehold(authUser);
      if (!active) return;

      setState({
        loading: false,
        household: result.data || null,
        context: result.context || {
          householdId: null,
          source: "unavailable",
          bootstrapped: false,
        },
        error: result.error?.message || "",
      });
    }

    if (!isSupabaseConfigured()) {
      loadContextForUser(null);
      return () => {
        active = false;
      };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      loadContextForUser(null);
      return () => {
        active = false;
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      loadContextForUser(data?.session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadContextForUser(session?.user || null);
    });

    return () => {
      active = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  return state;
}
