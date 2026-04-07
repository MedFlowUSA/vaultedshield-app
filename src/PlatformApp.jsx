import { Component, Suspense, lazy, useEffect, useState } from "react";
import ContentContainer from "./components/layout/ContentContainer";
import Sidebar from "./components/layout/Sidebar";
import TopNav from "./components/layout/TopNav";
import { hasTierAccess, useAccessPortal } from "./lib/auth/accessPortal";
import { clearLegacyHouseholdReviewStorage } from "./lib/domain/platformIntelligence/reviewWorkflowState";
import { PlatformShellDataProvider } from "./lib/intelligence/PlatformShellDataContext";
import { getRouteByPath } from "./lib/navigation/routes";
import { useHashRoute } from "./lib/navigation/useHashRoute";
import useResponsiveLayout from "./lib/ui/useResponsiveLayout";

const PricingPage = lazy(() => import("./pages/PricingPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const AuthLoginPage = lazy(() => import("./pages/AuthLoginPage"));
const AuthSignupPage = lazy(() => import("./pages/AuthSignupPage"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ReviewWorkspacePage = lazy(() => import("./pages/ReviewWorkspacePage"));
const GuidanceCenterPage = lazy(() => import("./pages/GuidanceCenterPage"));
const HouseholdGoalsDashboardPage = lazy(() => import("./pages/HouseholdGoalsDashboardPage"));
const VaultPage = lazy(() => import("./pages/VaultPage"));
const UploadCenterPage = lazy(() => import("./pages/UploadCenterPage"));
const AssetsHomePage = lazy(() => import("./pages/AssetsHomePage"));
const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage"));
const InsuranceHubPage = lazy(() => import("./pages/InsuranceHubPage"));
const PolicyComparisonPage = lazy(() => import("./pages/PolicyComparisonPage"));
const PolicyDetailPage = lazy(() => import("./pages/PolicyDetailPage"));
const AutoInsuranceHubPage = lazy(() => import("./pages/AutoInsuranceHubPage"));
const AutoPolicyDetailPage = lazy(() => import("./pages/AutoPolicyDetailPage"));
const HealthInsuranceHubPage = lazy(() => import("./pages/HealthInsuranceHubPage"));
const HealthPlanDetailPage = lazy(() => import("./pages/HealthPlanDetailPage"));
const HomeownersHubPage = lazy(() => import("./pages/HomeownersHubPage"));
const HomeownersPolicyDetailPage = lazy(() => import("./pages/HomeownersPolicyDetailPage"));
const LifePolicyUploadPage = lazy(() => import("./pages/LifePolicyUploadPage"));
const BankingHubPage = lazy(() => import("./pages/BankingHubPage"));
const MortgageHubPage = lazy(() => import("./pages/MortgageHubPage"));
const MortgageLoanDetailPage = lazy(() => import("./pages/MortgageLoanDetailPage"));
const PropertyHubPage = lazy(() => import("./pages/PropertyHubPage"));
const PropertyDetailPage = lazy(() => import("./pages/PropertyDetailPage"));
const RetirementHubPage = lazy(() => import("./pages/RetirementHubPage"));
const RetirementAccountDetailPage = lazy(() => import("./pages/RetirementAccountDetailPage"));
const RetirementUploadPage = lazy(() => import("./pages/RetirementUploadPage"));
const CollegePlanningPage = lazy(() => import("./pages/CollegePlanningPage"));
const WarrantyHubPage = lazy(() => import("./pages/WarrantyHubPage"));
const WarrantyDetailPage = lazy(() => import("./pages/WarrantyDetailPage"));
const EstateHubPage = lazy(() => import("./pages/EstateHubPage"));
const EmergencyModePage = lazy(() => import("./pages/EmergencyModePage"));
const PortalHubPage = lazy(() => import("./pages/PortalHubPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

const LEGACY_GLOBAL_STORAGE_KEYS = [
  "vaultedshield-results",
  "vaultedshield-current-household-id",
];

function clearLegacyScopedStorage(userId = null) {
  if (typeof window === "undefined") return;
  try {
    LEGACY_GLOBAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    clearLegacyHouseholdReviewStorage();
    if (!window.sessionStorage.getItem("vaultedshield_legacy_storage_cleanup_v1")) {
      window.sessionStorage.setItem("vaultedshield_legacy_storage_cleanup_v1", "done");
    }
    if (import.meta.env.DEV && !userId) {
      console.warn("[VaultedShield] cleared legacy global storage keys after auth scope changed to signed-out or guest state.");
    }
  } catch {
    // Ignore storage cleanup failures so auth and routing can continue safely.
  }
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "This route could not be rendered.",
    };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "28px",
            borderRadius: "20px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            color: "#0f172a",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 800 }}>This page hit a render error.</div>
          <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.7" }}>
            {this.state.message}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function RouteLoadingFallback() {
  return (
    <div
      style={{
        padding: "24px",
        borderRadius: "20px",
        background: "#ffffff",
        border: "1px solid #dbe4f0",
        color: "#475569",
        fontWeight: 700,
      }}
    >
      Loading workspace...
    </div>
  );
}

function renderLazyRoute(pathname, navigate, accessPortal, returnPath) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {renderRoute(pathname, navigate, accessPortal, returnPath)}
    </Suspense>
  );
}

function renderRoute(pathname, navigate, accessPortal, returnPath = "/dashboard") {
  if (pathname.startsWith("/assets/detail/")) {
    const assetId = pathname.replace("/assets/detail/", "");
    return <AssetDetailPage assetId={assetId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/retirement/detail/")) {
    const retirementAccountId = pathname.replace("/retirement/detail/", "");
    return <RetirementAccountDetailPage retirementAccountId={retirementAccountId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/warranties/detail/")) {
    const warrantyId = pathname.replace("/warranties/detail/", "");
    return <WarrantyDetailPage warrantyId={warrantyId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/property/detail/")) {
    const propertyId = pathname.replace("/property/detail/", "");
    return <PropertyDetailPage propertyId={propertyId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/mortgage/detail/")) {
    const mortgageLoanId = pathname.replace("/mortgage/detail/", "");
    return <MortgageLoanDetailPage mortgageLoanId={mortgageLoanId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/insurance/homeowners/detail/")) {
    const homeownersPolicyId = pathname.replace("/insurance/homeowners/detail/", "");
    return <HomeownersPolicyDetailPage homeownersPolicyId={homeownersPolicyId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/insurance/auto/detail/")) {
    const autoPolicyId = pathname.replace("/insurance/auto/detail/", "");
    return <AutoPolicyDetailPage autoPolicyId={autoPolicyId} onNavigate={navigate} />;
  }

  if (pathname.startsWith("/insurance/health/detail/")) {
    const healthPlanId = pathname.replace("/insurance/health/detail/", "");
    return <HealthPlanDetailPage healthPlanId={healthPlanId} onNavigate={navigate} />;
  }

  if (
    pathname.startsWith("/insurance/compare/")
  ) {
    const comparePath = pathname.replace("/insurance/compare/", "");
    const [policyId, comparePolicyId] = comparePath.split("/");
    return (
      <PolicyComparisonPage
        policyId={policyId || ""}
        comparePolicyId={comparePolicyId || ""}
        onNavigate={navigate}
      />
    );
  }

  if (
    pathname.startsWith("/insurance/") &&
    !pathname.startsWith("/insurance/compare/") &&
    !pathname.startsWith("/insurance/homeowners") &&
    !pathname.startsWith("/insurance/auto") &&
    !pathname.startsWith("/insurance/health") &&
    !pathname.startsWith("/insurance/life/")
  ) {
    const policyId = pathname.replace("/insurance/", "");
    if (policyId) {
      return <PolicyDetailPage policyId={policyId} onNavigate={navigate} />;
    }
  }

  switch (pathname) {
    case "/login":
      return <AuthLoginPage onNavigate={navigate} accessPortal={accessPortal} returnPath={returnPath} />;
    case "/signup":
      return <AuthSignupPage onNavigate={navigate} accessPortal={accessPortal} returnPath={returnPath} />;
    case "/pricing":
      return <PricingPage onNavigate={navigate} accessPortal={accessPortal} returnPath={returnPath} />;
    case "/privacy-policy":
      return <PrivacyPolicyPage />;
    case "/terms-of-service":
      return <TermsOfServicePage />;
    case "/dashboard":
      return <DashboardPage onNavigate={navigate} />;
    case "/review-workspace":
      return <ReviewWorkspacePage onNavigate={navigate} />;
    case "/guidance":
      return <GuidanceCenterPage onNavigate={navigate} />;
    case "/household-goals":
      return <HouseholdGoalsDashboardPage onNavigate={navigate} />;
    case "/vault":
      return <VaultPage />;
    case "/upload-center":
      return <UploadCenterPage />;
    case "/assets":
      return <AssetsHomePage onNavigate={navigate} />;
    case "/insurance":
      return <InsuranceHubPage onNavigate={navigate} />;
    case "/insurance/homeowners":
      return <HomeownersHubPage onNavigate={navigate} />;
    case "/insurance/auto":
      return <AutoInsuranceHubPage onNavigate={navigate} />;
    case "/insurance/health":
      return <HealthInsuranceHubPage onNavigate={navigate} />;
    case "/insurance/life/policy-detail":
      return <LifePolicyUploadPage onNavigate={navigate} />;
    case "/insurance/life/upload":
      return <LifePolicyUploadPage onNavigate={navigate} />;
    case "/banking":
      return <BankingHubPage />;
    case "/mortgage":
      return <MortgageHubPage onNavigate={navigate} />;
    case "/property":
      return <PropertyHubPage onNavigate={navigate} />;
    case "/retirement":
      return <RetirementHubPage onNavigate={navigate} />;
    case "/retirement/upload":
      return <RetirementUploadPage onNavigate={navigate} />;
    case "/college-planning":
      return <CollegePlanningPage onNavigate={navigate} />;
    case "/warranties":
      return <WarrantyHubPage onNavigate={navigate} />;
    case "/estate":
      return <EstateHubPage />;
    case "/emergency":
      return <EmergencyModePage />;
    case "/portals":
      return <PortalHubPage onNavigate={navigate} />;
    case "/reports":
      return <ReportsPage />;
    case "/contacts":
      return <ContactsPage />;
    case "/settings":
      return <SettingsPage />;
    default:
      return <DashboardPage onNavigate={navigate} />;
  }
}

export default function PlatformApp() {
  const { pathname, navigate } = useHashRoute();
  const { isMobile, isTablet } = useResponsiveLayout();
  const accessPortal = useAccessPortal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pricingReturnPath, setPricingReturnPath] = useState("/dashboard");
  const postAuthHome = "/insurance";
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/privacy-policy" ||
    pathname === "/terms-of-service";
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const resolvedPathname = accessPortal.isAuthenticated && isAuthRoute ? postAuthHome : pathname;
  const route = getRouteByPath(resolvedPathname);
  const resolvedIsAuthRoute = resolvedPathname === "/login" || resolvedPathname === "/signup";
  const hasRouteAccess = hasTierAccess(accessPortal.currentTier, route.minimumTier || "free");
  const useCompactShell = isTablet;
  const handleOpenPricing = () => {
    setSidebarOpen(false);
    setPricingReturnPath(resolvedPathname === "/pricing" ? pricingReturnPath : resolvedPathname || "/dashboard");
    navigate("/pricing");
  };
  const resolvedPricingReturnPath =
    resolvedPathname === "/pricing" && accessPortal.isAuthenticated
      ? pricingReturnPath || postAuthHome
      : postAuthHome;

  useEffect(() => {
    clearLegacyScopedStorage(accessPortal.session?.userId || null);
  }, [accessPortal.session?.userId]);

  useEffect(() => {
    const closeSidebar = window.setTimeout(() => {
      setSidebarOpen(false);
    }, 0);
    return () => window.clearTimeout(closeSidebar);
  }, [resolvedPathname, useCompactShell]);

  useEffect(() => {
    if (!useCompactShell || !sidebarOpen || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [sidebarOpen, useCompactShell]);

  if (!accessPortal.authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
          color: "#475569",
          fontWeight: 600,
        }}
      >
        Preparing secure VaultedShield access...
      </div>
    );
  }

  if (!accessPortal.isAuthenticated && !resolvedIsAuthRoute && !isPublicRoute) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        <Suspense fallback={<RouteLoadingFallback />}>
          <AuthLoginPage onNavigate={navigate} accessPortal={accessPortal} returnPath={postAuthHome} />
        </Suspense>
      </div>
    );
  }

  if (resolvedIsAuthRoute || (!accessPortal.isAuthenticated && isPublicRoute)) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        {renderLazyRoute(resolvedPathname, navigate, accessPortal, postAuthHome)}
      </div>
    );
  }

  if (!hasRouteAccess) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        <Suspense fallback={<RouteLoadingFallback />}>
          <PricingPage
            onNavigate={navigate}
            accessPortal={accessPortal}
            lockedRouteTitle={route.title}
            returnPath={resolvedPricingReturnPath}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <PlatformShellDataProvider accessSession={accessPortal.session} authReady={accessPortal.authReady}>
      <div style={{ minHeight: "100vh", background: "#e2e8f0", position: "relative", overflowX: "clip" }}>
        {useCompactShell && sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              border: "none",
              background: "rgba(15, 23, 42, 0.42)",
              cursor: "pointer",
              zIndex: 70,
              padding: 0,
              opacity: 1,
              transition: "opacity 220ms ease",
              touchAction: "none",
            }}
          />
        ) : null}
        {useCompactShell ? (
          <Sidebar
            currentPath={pathname}
            onNavigate={navigate}
            currentTier={accessPortal.currentTier}
            currentPlanLabel={accessPortal.currentPlan.label}
            onUpgrade={handleOpenPricing}
            isCompact
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        ) : null}
        <div style={{ display: "flex", minHeight: "100vh" }}>
          {!useCompactShell ? (
            <Sidebar
              currentPath={pathname}
              onNavigate={navigate}
              currentTier={accessPortal.currentTier}
              currentPlanLabel={accessPortal.currentPlan.label}
              onUpgrade={handleOpenPricing}
              isCompact={false}
              isOpen
              onClose={() => setSidebarOpen(false)}
            />
          ) : null}
          <ContentContainer>
            <TopNav
              title={route.title}
              subtitle="Modular family continuity and asset-intelligence shell"
              onNavigate={navigate}
              onUpgrade={handleOpenPricing}
              currentPlanLabel={accessPortal.currentPlan.label}
              householdName={accessPortal.session.householdName || "Working Household"}
              onSignOut={() => {
                accessPortal.signOut();
                navigate("/login");
              }}
              showSidebarToggle={useCompactShell}
              onToggleSidebar={() => setSidebarOpen((current) => !current)}
              isCompact={isMobile}
            />
            <div
              style={{
                padding: isMobile
                  ? "16px 16px max(24px, calc(env(safe-area-inset-bottom, 0px) + 12px))"
                  : isTablet
                    ? "18px 16px 24px"
                    : "28px",
                width: "100%",
                maxWidth: "100%",
                overflowX: "clip",
              }}
            >
              <RouteErrorBoundary resetKey={resolvedPathname}>
                {renderLazyRoute(resolvedPathname, navigate, accessPortal, resolvedPricingReturnPath)}
              </RouteErrorBoundary>
            </div>
          </ContentContainer>
        </div>
      </div>
    </PlatformShellDataProvider>
  );
}
