function getSearchParamsFromHash(hash = "") {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(queryIndex + 1));
}

function getCombinedAuthParams() {
  if (typeof window === "undefined") return new URLSearchParams();

  const combined = new URLSearchParams(window.location.search || "");
  const hashParams = getSearchParamsFromHash(window.location.hash || "");
  hashParams.forEach((value, key) => {
    if (!combined.has(key)) {
      combined.set(key, value);
    }
  });
  return combined;
}

function normalizeAuthErrorMessage(message = "") {
  const resolved = String(message || "").trim();
  if (!resolved) {
    return "Authentication could not be completed. Please try again.";
  }
  return resolved.replace(/\+/g, " ");
}

export function getAuthLandingState() {
  if (typeof window === "undefined") {
    return { status: "idle", message: "" };
  }

  const params = getCombinedAuthParams();
  const error = params.get("error_description") || params.get("error") || "";
  if (error) {
    return {
      status: "error",
      message: normalizeAuthErrorMessage(error),
    };
  }

  const type = String(params.get("type") || "").toLowerCase();
  const hasVerificationMarkers = Boolean(
    params.get("code") ||
      params.get("token_hash") ||
      params.get("confirmation_token") ||
      params.get("access_token")
  );

  if (type === "signup" || type === "invite" || hasVerificationMarkers) {
    return {
      status: "verification_complete",
      message: "Your email verification is complete. Continue into VaultedShield when you're ready.",
    };
  }

  return { status: "idle", message: "" };
}

export function hasAuthLandingState() {
  return getAuthLandingState().status !== "idle";
}

export function clearAuthLandingStateFromUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;

  const rawHash = window.location.hash || "#/login";
  const baseHash = rawHash.includes("?") ? rawHash.slice(0, rawHash.indexOf("?")) : rawHash;
  const nextUrl = `${window.location.pathname}${baseHash || "#/login"}`;
  window.history.replaceState({}, document.title, nextUrl);
}
