import { useEffect, useState } from "react";
import { resolveResponsiveLayout } from "./responsiveLayout";

function getViewportWidth() {
  if (typeof window === "undefined") return 1280;
  return window.innerWidth;
}

export default function useResponsiveLayout() {
  const [width, setWidth] = useState(getViewportWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(getViewportWidth());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return resolveResponsiveLayout(width);
}
