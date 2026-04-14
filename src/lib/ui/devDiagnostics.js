export function shouldShowDevDiagnostics() {
  if (!import.meta.env.DEV) return false;

  try {
    if (typeof window === "undefined") return false;

    const params = new URLSearchParams(window.location.search);
    if (params.get("debug_ui") === "1") return true;

    return window.localStorage?.getItem("vaultedshield:debug-ui") === "1";
  } catch {
    return false;
  }
}
