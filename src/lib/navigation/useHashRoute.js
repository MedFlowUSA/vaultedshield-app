import { useEffect, useState } from "react";
import { getDefaultRoute } from "./routes";

function readHashPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || getDefaultRoute();
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
