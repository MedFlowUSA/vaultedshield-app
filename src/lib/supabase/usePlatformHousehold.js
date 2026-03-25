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
  const authUser = useMemo(() => {
    if (accessSession) {
      return buildPseudoAuthUser(accessSession);
    }
    return resolvedAuthUser;
  }, [accessSession, resolvedAuthUser]);
  const isAuthResolved = accessSession ? Boolean(authReady) : resolvedAuthReady;

  useEffect(() => {
    if (accessSession) {
      setResolvedAuthUser(buildPseudoAuthUser(accessSession));
      setResolvedAuthReady(Boolean(authReady));
      return undefined;
    }

    if (!isSupabaseConfigured()) {
      setResolvedAuthUser(null);
      setResolvedAuthReady(true);
      return undefined;
    }

    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setResolvedAuthUser(null);
      setResolvedAuthReady(true);
      return undefined;
    }

    setResolvedAuthReady(false);

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
    const nextOwnershipMode = authUser?.id ? "authenticated_owned" : "guest_shared";

    setState({
      loading: true,
      household: null,
      context: {
        householdId: null,
        source: isAuthResolved ? "loading" : "awaiting_auth",
        bootstrapped: false,
        currentAuthUserId: authUser?.id || null,
        ownershipMode: nextOwnershipMode,
        guestFallbackActive: !authUser?.id,
      },
      error: "",
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
          ownershipMode: result.context?.ownershipMode || (resolvedAuthUser?.id ? "authenticated_owned" : "guest_shared"),
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
          ownershipMode: resolvedAuthUser?.id ? "authenticated_owned" : "guest_shared",
          guestFallbackActive: !resolvedAuthUser?.id,
          ...(result.context || {}),
          currentAuthUserId: resolvedAuthUser?.id || null,
        },
        error: result.error?.message || "",
      });
    }

    loadContextForUser(authUser);

    return () => {
      active = false;
    };
  }, [isAuthResolved, authUser?.email, authUser?.id, authUser?.user_metadata?.household_name]);

  return state;
}
