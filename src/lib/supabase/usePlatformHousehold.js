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
      currentAuthUserId: null,
      ownershipMode: "loading",
      guestFallbackActive: false,
    },
    error: "",
  });

  useEffect(() => {
    let active = true;

    async function loadContextForUser(authUser = null) {
      const result = await getOrCreateDefaultHousehold(authUser);
      if (!active) return;

      if (import.meta.env.DEV) {
        console.info("[VaultedShield] household ownership context", {
          currentAuthUserId: authUser?.id || null,
          householdId: result.context?.householdId || null,
          ownershipMode: result.context?.ownershipMode || (authUser?.id ? "authenticated_owned" : "guest_shared"),
          guestFallbackActive: Boolean(result.context?.guestFallbackActive),
        });
      }

      setState({
        loading: false,
        household: result.data || null,
        context: {
          householdId: null,
          source: "unavailable",
          bootstrapped: false,
          currentAuthUserId: authUser?.id || null,
          ownershipMode: authUser?.id ? "authenticated_owned" : "guest_shared",
          guestFallbackActive: !authUser?.id,
          ...(result.context || {}),
          currentAuthUserId: authUser?.id || null,
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
