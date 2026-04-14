import { useEffect, useState } from "react";
import { getDefaultRoute } from "./routes.js";

export function normalizeHashPath(hash = "") {
  const trimmedHash = String(hash || "").replace(/^#/, "");
  const normalizedHash = trimmedHash.includes("?") ? trimmedHash.slice(0, trimmedHash.indexOf("?")) : trimmedHash;
  return normalizedHash || getDefaultRoute();
}

function readHashPath() {
  return normalizeHashPath(window.location.hash);
}

export function navigateTo(path) {
  window.location.hash = path;
}

export function useHashRoute() {
  const [pathname, setPathname] = useState(readHashPath);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = getDefaultRoute();
    }

    function handleChange() {
      setPathname(readHashPath());
    }

    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  return {
    pathname,
    navigate: navigateTo,
  };
}
