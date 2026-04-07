import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase/client";

const SESSION_STORAGE_KEY = "vaultedshield_access_session_v1";
const PROFILE_STORAGE_KEY = "vaultedshield_access_profiles_v1";
const PLAN_STORAGE_KEY = "vaultedshield_access_plans_v1";
const EMAIL_SEND_GUARD_KEY = "vaultedshield_email_send_guard_v1";
const EMAIL_SEND_GUARD_WINDOW_MS = 90 * 1000;

export const ACCESS_TIERS = {
  free: {
    key: "free",
    label: "Free",
    priceLabel: "$0",
    tagline: "Entry-level access for intelligence discovery and early household setup.",
    features: [
      "Dashboard and vault access",
      "Upload center and basic household setup",
      "Insurance Intelligence portfolio view",
      "Single policy detail review",
    ],
  },
  essential: {
    key: "essential",
    label: "Essential",
    priceLabel: "$29/mo",
    tagline: "Practical review workflows for active policy and property analysis.",
    features: [
      "Everything in Free",
      "Policy comparison workflows",
      "Property and mortgage intelligence",
      "Reports and printable review outputs",
    ],
  },
  professional: {
    key: "professional",
    label: "Professional",
    priceLabel: "$99/mo",
    tagline: "Full continuity operating system for advanced households and advisor-led review.",
    features: [
      "Everything in Essential",
      "Retirement, warranties, and continuity modules",
      "Portal mapping and emergency access workflows",
      "Advanced household operating workflows",
    ],
  },
};

export const ACCESS_TIER_ORDER = ["free", "essential", "professional"];
function safeReadStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures and fall back safely.
    }
    return fallback;
  }
}

function safeWriteStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures so auth state can continue in-memory.
  }
}

function buildSignedOutSession() {
  return {
    isAuthenticated: false,
    email: "",
    householdName: "",
    tier: "free",
    source: "signed_out",
    authMode: isSupabaseConfigured() ? "supabase" : "local",
  };
}

function sanitizeStoredSession(session) {
  if (session?.source === "free_access") {
    return buildSignedOutSession();
  }
  return session;
}

function isLocalFallbackSession(session) {
  return Boolean(
    session?.isAuthenticated &&
      session?.authMode === "local" &&
      ["signup", "login", "local_profile", "pricing_upgrade"].includes(session?.source)
  );
}

function createSession(profile = {}) {
  return {
    isAuthenticated: true,
    email: profile.email || "",
    householdName: profile.householdName || "Working Household",
    tier: profile.tier || "free",
    createdAt: profile.createdAt || new Date().toISOString(),
    source: profile.source || "local_profile",
    authMode: profile.authMode || (isSupabaseConfigured() ? "supabase" : "local"),
    userId: profile.userId || null,
  };
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function getStoredPlanMap() {
  return safeReadStorage(PLAN_STORAGE_KEY, {});
}

function writeStoredPlanMap(value) {
  safeWriteStorage(PLAN_STORAGE_KEY, value);
}

function getStoredTierForEmail(email = "") {
  const normalizedEmail = normalizeEmail(email);
  const storedPlans = getStoredPlanMap();
  return storedPlans[normalizedEmail] || "free";
}

function setStoredTierForEmail(email = "", tier = "free") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  const storedPlans = getStoredPlanMap();
  writeStoredPlanMap({
    ...storedPlans,
    [normalizedEmail]: ACCESS_TIERS[tier] ? tier : "free",
  });
}

function getStoredEmailSendGuardMap() {
  return safeReadStorage(EMAIL_SEND_GUARD_KEY, {});
}

function writeStoredEmailSendGuardMap(value) {
  safeWriteStorage(EMAIL_SEND_GUARD_KEY, value);
}

function readEmailSendGuard(email = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const guardMap = getStoredEmailSendGuardMap();
  const record = guardMap[normalizedEmail];
  if (!record?.lastSentAt) return null;

  const ageMs = Date.now() - new Date(record.lastSentAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs >= EMAIL_SEND_GUARD_WINDOW_MS) {
    delete guardMap[normalizedEmail];
    writeStoredEmailSendGuardMap(guardMap);
    return null;
  }

  return {
    ...record,
    remainingMs: Math.max(0, EMAIL_SEND_GUARD_WINDOW_MS - ageMs),
  };
}

function writeEmailSendGuard(email = "", context = "signup_confirmation") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  const guardMap = getStoredEmailSendGuardMap();
  guardMap[normalizedEmail] = {
    lastSentAt: new Date().toISOString(),
    context,
  };
  writeStoredEmailSendGuardMap(guardMap);
}

function formatEmailCooldownMessage(remainingMs = EMAIL_SEND_GUARD_WINDOW_MS) {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `An email was already requested recently. Wait about ${remainingSeconds} seconds, then try again.`;
}

function normalizeSupabaseEmailError(error) {
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("email rate limit") ||
    lowerMessage.includes("rate limit exceeded") ||
    lowerMessage.includes("over_email_send_rate_limit")
  ) {
    return "Too many email attempts were made for this address. Wait a minute, then try again.";
  }

  return message || "Authentication could not be completed.";
}

export function getTierDefinition(tierKey = "free") {
  return ACCESS_TIERS[tierKey] || ACCESS_TIERS.free;
}

export function hasTierAccess(currentTier = "free", minimumTier = "free") {
  return ACCESS_TIER_ORDER.indexOf(currentTier) >= ACCESS_TIER_ORDER.indexOf(minimumTier);
}

function buildSessionFromSupabaseUser(user) {
  if (!user) return buildSignedOutSession();
  const email = normalizeEmail(user.email || "");
  const metadata = user.user_metadata || {};

  return createSession({
    email,
    householdName: metadata.household_name || metadata.full_name || "Working Household",
    tier: getStoredTierForEmail(email),
    createdAt: user.created_at || new Date().toISOString(),
    source: "supabase_auth",
    authMode: "supabase",
    userId: user.id,
  });
}

function buildPendingConfirmationResult(user = null) {
  return {
    ok: true,
    requiresEmailConfirmation: true,
    user,
    profile: null,
    message: "Account created. Confirm the email address for this account, then log in.",
  };
}

async function signInWithSupabase({ email, password }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: String(password || ""),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, user: data?.user || null };
}

async function signUpWithSupabase({ householdName, email, password, tier = "free" }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const normalizedEmail = normalizeEmail(email);
  const emailSendGuard = readEmailSendGuard(normalizedEmail);
  if (emailSendGuard) {
    return {
      ok: false,
      error: formatEmailCooldownMessage(emailSendGuard.remainingMs),
      rateLimited: true,
      retryAfterSeconds: Math.max(1, Math.ceil(emailSendGuard.remainingMs / 1000)),
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: String(password || ""),
    options: {
      data: {
        household_name: String(householdName || "").trim() || "Working Household",
        requested_tier: tier,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      error: normalizeSupabaseEmailError(error),
      rateLimited: true,
      retryAfterSeconds: 60,
    };
  }

  setStoredTierForEmail(normalizedEmail, tier);
  writeEmailSendGuard(normalizedEmail, "supabase_signup");
  return { ok: true, user: data?.user || null, session: data?.session || null };
}

async function signOutFromSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function useAccessPortal() {
  const [session, setSession] = useState(() =>
    sanitizeStoredSession(safeReadStorage(SESSION_STORAGE_KEY, buildSignedOutSession()))
  );
  const [profiles, setProfiles] = useState(() => safeReadStorage(PROFILE_STORAGE_KEY, []));
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured());

  useEffect(() => {
    safeWriteStorage(SESSION_STORAGE_KEY, session);
  }, [session]);

  useEffect(() => {
    safeWriteStorage(PROFILE_STORAGE_KEY, profiles);
  }, [profiles]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession((current) => {
        const authUser = data?.session?.user || null;
        if (!authUser && isLocalFallbackSession(current)) {
          return current;
        }
        return buildSessionFromSupabaseUser(authUser);
      });
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!active) return;
      setSession((current) => {
        const authUser = authSession?.user || null;
        if (!authUser && isLocalFallbackSession(current)) {
          return current;
        }
        return buildSessionFromSupabaseUser(authUser);
      });
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const currentTier = session?.tier || "free";
  const currentPlan = useMemo(() => getTierDefinition(currentTier), [currentTier]);

  async function signUp({ householdName, email, password, tier = "free" }) {
    if (isSupabaseConfigured()) {
      const result = await signUpWithSupabase({ householdName, email, password, tier });
      if (!result.ok) return result;

      if (!result.session?.user) {
        setSession(buildSignedOutSession());
        return buildPendingConfirmationResult(result.user);
      }

      const nextSession = buildSessionFromSupabaseUser(result.session.user);
      setSession(nextSession);
      return { ok: true, profile: nextSession, requiresEmailConfirmation: false };
    }

    const normalizedEmail = normalizeEmail(email);
    const newProfile = {
      householdName: String(householdName || "").trim() || "Working Household",
      email: normalizedEmail,
      password: String(password || ""),
      tier,
      createdAt: new Date().toISOString(),
    };

    const nextProfiles = [
      ...profiles.filter((profile) => profile.email !== normalizedEmail),
      newProfile,
    ];
    setProfiles(nextProfiles);
    setStoredTierForEmail(normalizedEmail, tier);
    const nextSession = createSession({ ...newProfile, source: "signup", authMode: "local" });
    setSession(nextSession);
    return { ok: true, profile: nextSession };
  }

  async function signIn({ email, password }) {
    if (isSupabaseConfigured()) {
      const result = await signInWithSupabase({ email, password });
      if (!result.ok) return result;

      const nextSession = buildSessionFromSupabaseUser(result.user);
      setSession(nextSession);
      return { ok: true, profile: nextSession };
    }

    const normalizedEmail = normalizeEmail(email);
    const matchingProfile = profiles.find(
      (profile) =>
        profile.email === normalizedEmail &&
        profile.password === String(password || "")
    );

    if (!matchingProfile) {
      return {
        ok: false,
        error: "That email and password combination was not found in the current access shell.",
      };
    }

    const nextSession = createSession({ ...matchingProfile, source: "login", authMode: "local" });
    setSession(nextSession);
    return { ok: true, profile: nextSession };
  }

  async function signOut() {
    if (isSupabaseConfigured()) {
      await signOutFromSupabase();
    }
    setSession(buildSignedOutSession());
  }

  function upgradePlan(tier) {
    const nextTier = ACCESS_TIERS[tier] ? tier : "free";
    if (session?.email) {
      setStoredTierForEmail(session.email, nextTier);
    }

    setSession((current) => ({
      ...current,
      tier: nextTier,
      isAuthenticated: true,
      source: current.isAuthenticated ? current.source : "pricing_upgrade",
    }));

    setProfiles((currentProfiles) =>
      currentProfiles.map((profile) =>
        profile.email && profile.email === session.email ? { ...profile, tier: nextTier } : profile
      )
    );
  }

  return {
    session,
    profiles,
    currentTier,
    currentPlan,
    isAuthenticated: Boolean(session?.isAuthenticated),
    authReady,
    authMode: isSupabaseConfigured() ? "supabase" : "local",
    signUp,
    signIn,
    signOut,
    upgradePlan,
    hasAccess: (minimumTier = "free") => hasTierAccess(currentTier, minimumTier),
  };
}
