export function resolveResponsiveLayout(width) {
  return {
    width,
    isMobile: width < 768,
    isTablet: width < 1100,
    isDesktop: width >= 1100,
  };
}
