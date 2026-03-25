import { useEffect, useState } from "react";

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

  return {
    width,
    isMobile: width < 768,
    isTablet: width < 1100,
    isDesktop: width >= 1100,
  };
}
