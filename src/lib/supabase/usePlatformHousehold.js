import { useEffect, useMemo, useState } from "react";
import { getOrCreateDefaultHousehold } from "./platformData";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

function buildPseudoAuthUser(accessSession = null) {
  if (
    !accessSession?.isAuthenticated ||
    accessSession?.authMode !== "supabase" ||
    !accessSession?.userId
  ) {
    return null;
  }

  return {
    id: accessSession.userId,
    email: accessSession.email || null,
    user_metadata: {
      household_name: accessSession.householdName || "VaultedShield Household",
      full_name: accessSession.householdName || accessSession.email || "Primary Household Member",
    },
  };
}

export function usePlatformHousehold(accessSession = null, authReady = true) {
  const [resolvedAuthUser, setResolvedAuthUser] = useState(null);
  const [resolvedAuthReady, setResolvedAuthReady] = useState(() =>
    accessSession ? Boolean(authReady) : !isSupabaseConfigured()
  );
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
  const authUser = useMemo(
    () => (accessSession ? buildPseudoAuthUser(accessSession) : resolvedAuthUser),
    [accessSession, resolvedAuthUser]
  );
  const isAuthResolved = accessSession ? Boolean(authReady) : resolvedAuthReady;

  useEffect(() => {
    if (accessSession) return undefined;

    if (!isSupabaseConfigured()) {
      queueMicrotask(() => {
        setResolvedAuthUser(null);
        setResolvedAuthReady(true);
      });
      return undefined;
    }

    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      queueMicrotask(() => {
        if (!active) return;
        setResolvedAuthUser(null);
        setResolvedAuthReady(true);
      });
      return undefined;
    }

    queueMicrotask(() => {
      if (!active) return;
      setResolvedAuthReady(false);
    });

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setResolvedAuthUser(data?.user || null);
      setResolvedAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!active) return;
      setResolvedAuthUser(authSession?.user || null);
      setResolvedAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [accessSession, authReady]);

  useEffect(() => {
    let active = true;
    const nextOwnershipMode = authUser?.id ? "authenticated_owned" : "unauthenticated";

    queueMicrotask(() => {
      if (!active) return;
      setState({
        loading: true,
        household: null,
        context: {
          householdId: null,
          source: isAuthResolved ? "loading" : "awaiting_auth",
          bootstrapped: false,
          currentAuthUserId: authUser?.id || null,
          ownershipMode: nextOwnershipMode,
          guestFallbackActive: false,
        },
        error: "",
      });
    });

    if (!isAuthResolved) {
      return () => {
        active = false;
      };
    }

    async function loadContextForUser(resolvedAuthUser = null) {
      const result = await getOrCreateDefaultHousehold(resolvedAuthUser);
      if (!active) return;

      if (import.meta.env.DEV) {
        console.info("[VaultedShield] household ownership context", {
          currentAuthUserId: resolvedAuthUser?.id || null,
          householdId: result.context?.householdId || null,
          ownershipMode: result.context?.ownershipMode || (resolvedAuthUser?.id ? "authenticated_owned" : "unauthenticated"),
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
          currentAuthUserId: resolvedAuthUser?.id || null,
          ownershipMode: resolvedAuthUser?.id ? "authenticated_owned" : "unauthenticated",
          guestFallbackActive: false,
          ...(result.context || {}),
        },
        error: result.error?.message || "",
      });
    }

    loadContextForUser(authUser);

    return () => {
      active = false;
    };
  }, [authUser, isAuthResolved]);

  return state;
}
