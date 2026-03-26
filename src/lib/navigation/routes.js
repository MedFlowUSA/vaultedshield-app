export const ROUTES = {
  login: { path: "/login", title: "Login", section: "Auth", minimumTier: "free" },
  signup: { path: "/signup", title: "Sign Up", section: "Auth", minimumTier: "free" },
  pricing: { path: "/pricing", title: "Pricing", section: "Auth", minimumTier: "free" },
  privacyPolicy: { path: "/privacy-policy", title: "Privacy Policy", section: "Legal", minimumTier: "free" },
  termsOfService: { path: "/terms-of-service", title: "Terms of Service", section: "Legal", minimumTier: "free" },
  dashboard: { path: "/dashboard", title: "Dashboard", section: "Core", minimumTier: "free" },
  guidance: { path: "/guidance", title: "Guidance Center", section: "Core", minimumTier: "free" },
  vault: { path: "/vault", title: "Vault", section: "Core", minimumTier: "free" },
  uploadCenter: { path: "/upload-center", title: "Upload Center", section: "Core", minimumTier: "free" },
  assetsHome: { path: "/assets", title: "Assets", section: "Assets", minimumTier: "free" },
  assetDetail: { path: "/assets/detail", title: "Asset Detail", section: "Assets", minimumTier: "free" },
  insuranceHub: { path: "/insurance", title: "Insurance Intelligence", section: "Assets", minimumTier: "free" },
  insurancePolicyCompare: { path: "/insurance/compare", title: "Policy Comparison", section: "Assets", minimumTier: "essential" },
  insurancePolicyDetail: { path: "/insurance/:policyId", title: "Policy Detail", section: "Assets", minimumTier: "free" },
  homeownersHub: { path: "/insurance/homeowners", title: "Homeowners", section: "Assets", minimumTier: "essential" },
  homeownersDetail: { path: "/insurance/homeowners/detail", title: "Homeowners Detail", section: "Assets", minimumTier: "essential" },
  autoInsuranceHub: { path: "/insurance/auto", title: "Auto Insurance", section: "Assets", minimumTier: "essential" },
  autoPolicyDetail: { path: "/insurance/auto/detail", title: "Auto Policy Detail", section: "Assets", minimumTier: "essential" },
  healthInsuranceHub: { path: "/insurance/health", title: "Health Insurance", section: "Assets", minimumTier: "essential" },
  healthPlanDetail: { path: "/insurance/health/detail", title: "Health Plan Detail", section: "Assets", minimumTier: "essential" },
  lifePolicyDetail: { path: "/insurance/life/policy-detail", title: "Life Policy Detail", section: "Assets", minimumTier: "essential" },
  lifePolicyUpload: { path: "/insurance/life/upload", title: "Life Policy Upload", section: "Assets", minimumTier: "free" },
  bankingHub: { path: "/banking", title: "Banking", section: "Assets", minimumTier: "professional" },
  mortgageHub: { path: "/mortgage", title: "Mortgage", section: "Assets", minimumTier: "essential" },
  mortgageDetail: { path: "/mortgage/detail", title: "Mortgage Detail", section: "Assets", minimumTier: "essential" },
  propertyHub: { path: "/property", title: "Property", section: "Assets", minimumTier: "essential" },
  propertyDetail: { path: "/property/detail", title: "Property Detail", section: "Assets", minimumTier: "essential" },
  retirementHub: { path: "/retirement", title: "Retirement", section: "Assets", minimumTier: "professional" },
  retirementDetail: { path: "/retirement/detail", title: "Retirement Detail", section: "Assets", minimumTier: "professional" },
  warrantyHub: { path: "/warranties", title: "Warranties", section: "Assets", minimumTier: "professional" },
  warrantyDetail: { path: "/warranties/detail", title: "Warranty Detail", section: "Assets", minimumTier: "professional" },
  estateHub: { path: "/estate", title: "Estate", section: "Assets", minimumTier: "professional" },
  portals: { path: "/portals", title: "Portals", section: "Action", minimumTier: "professional" },
  emergencyMode: { path: "/emergency", title: "Emergency Mode", section: "Action", minimumTier: "professional" },
  reports: { path: "/reports", title: "Reports", section: "Action", minimumTier: "essential" },
  contacts: { path: "/contacts", title: "Contacts", section: "People", minimumTier: "professional" },
  settings: { path: "/settings", title: "Settings", section: "System", minimumTier: "professional" },
};

export const APP_NAVIGATION = [
  {
    label: "Core",
    items: [
      { routeKey: "dashboard", label: "Dashboard" },
      { routeKey: "guidance", label: "Guidance" },
      { routeKey: "vault", label: "Vault" },
      { routeKey: "uploadCenter", label: "Upload Center" },
    ],
  },
  {
    label: "Asset Modules",
    items: [
      { routeKey: "assetsHome", label: "Assets" },
      { routeKey: "insuranceHub", label: "Insurance" },
      { routeKey: "bankingHub", label: "Banking" },
      { routeKey: "mortgageHub", label: "Mortgage" },
      { routeKey: "propertyHub", label: "Property" },
      { routeKey: "retirementHub", label: "Retirement" },
      { routeKey: "warrantyHub", label: "Warranties" },
      { routeKey: "estateHub", label: "Estate" },
    ],
  },
  {
    label: "Continuity",
    items: [
      { routeKey: "emergencyMode", label: "Emergency" },
      { routeKey: "portals", label: "Portals" },
      { routeKey: "reports", label: "Reports" },
      { routeKey: "contacts", label: "Contacts" },
      { routeKey: "settings", label: "Settings" },
    ],
  },
];

export function getRouteByPath(pathname) {
  if (pathname.startsWith(ROUTES.assetDetail.path)) {
    return ROUTES.assetDetail;
  }
  if (pathname.startsWith(ROUTES.retirementDetail.path)) {
    return ROUTES.retirementDetail;
  }
  if (pathname.startsWith(ROUTES.warrantyDetail.path)) {
    return ROUTES.warrantyDetail;
  }
  if (pathname.startsWith(ROUTES.propertyDetail.path)) {
    return ROUTES.propertyDetail;
  }
  if (pathname.startsWith(ROUTES.mortgageDetail.path)) {
    return ROUTES.mortgageDetail;
  }
  if (pathname.startsWith(ROUTES.homeownersDetail.path)) {
    return ROUTES.homeownersDetail;
  }
  if (pathname.startsWith(ROUTES.autoPolicyDetail.path)) {
    return ROUTES.autoPolicyDetail;
  }
  if (pathname.startsWith(ROUTES.healthPlanDetail.path)) {
    return ROUTES.healthPlanDetail;
  }
  if (
    pathname.startsWith(ROUTES.insurancePolicyCompare.path)
  ) {
    return ROUTES.insurancePolicyCompare;
  }
  if (
    pathname.startsWith("/insurance/") &&
    pathname !== ROUTES.insuranceHub.path &&
    !pathname.startsWith(ROUTES.insurancePolicyCompare.path) &&
    !pathname.startsWith(ROUTES.homeownersHub.path) &&
    !pathname.startsWith(ROUTES.autoInsuranceHub.path) &&
    !pathname.startsWith(ROUTES.healthInsuranceHub.path) &&
    !pathname.startsWith("/insurance/life/")
  ) {
    return ROUTES.insurancePolicyDetail;
  }
  return (
    Object.values(ROUTES).find((route) => route.path === pathname) ||
    ROUTES.dashboard
  );
}

export function getDefaultRoute() {
  return ROUTES.dashboard.path;
}
