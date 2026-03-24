import { Component } from "react";
import ContentContainer from "./components/layout/ContentContainer";
import Sidebar from "./components/layout/Sidebar";
import TopNav from "./components/layout/TopNav";
import PricingPage from "./pages/PricingPage";
import AuthLoginPage from "./pages/AuthLoginPage";
import AuthSignupPage from "./pages/AuthSignupPage";
import DashboardPage from "./pages/DashboardPage";
import VaultPage from "./pages/VaultPage";
import UploadCenterPage from "./pages/UploadCenterPage";
import AssetsHomePage from "./pages/AssetsHomePage";
import AssetDetailPage from "./pages/AssetDetailPage";
import InsuranceHubPage from "./pages/InsuranceHubPage";
import PolicyComparisonPage from "./pages/PolicyComparisonPage";
import PolicyDetailPage from "./pages/PolicyDetailPage";
import AutoInsuranceHubPage from "./pages/AutoInsuranceHubPage";
import AutoPolicyDetailPage from "./pages/AutoPolicyDetailPage";
import HealthInsuranceHubPage from "./pages/HealthInsuranceHubPage";
import HealthPlanDetailPage from "./pages/HealthPlanDetailPage";
import HomeownersHubPage from "./pages/HomeownersHubPage";
import HomeownersPolicyDetailPage from "./pages/HomeownersPolicyDetailPage";
import LifePolicyDetailPage from "./pages/LifePolicyDetailPage";
import LifePolicyUploadPage from "./pages/LifePolicyUploadPage";
import BankingHubPage from "./pages/BankingHubPage";
import MortgageHubPage from "./pages/MortgageHubPage";
import MortgageLoanDetailPage from "./pages/MortgageLoanDetailPage";
import PropertyHubPage from "./pages/PropertyHubPage";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import RetirementHubPage from "./pages/RetirementHubPage";
import RetirementAccountDetailPage from "./pages/RetirementAccountDetailPage";
import WarrantyHubPage from "./pages/WarrantyHubPage";
import WarrantyDetailPage from "./pages/WarrantyDetailPage";
import EstateHubPage from "./pages/EstateHubPage";
import EmergencyModePage from "./pages/EmergencyModePage";
import PortalHubPage from "./pages/PortalHubPage";
import ReportsPage from "./pages/ReportsPage";
import ContactsPage from "./pages/ContactsPage";
import SettingsPage from "./pages/SettingsPage";
import { hasTierAccess, useAccessPortal } from "./lib/auth/accessPortal";
import { PlatformShellDataProvider } from "./lib/intelligence/PlatformShellDataContext";
import { getRouteByPath } from "./lib/navigation/routes";
import { useHashRoute } from "./lib/navigation/useHashRoute";

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
    case "/dashboard":
      return <DashboardPage onNavigate={navigate} />;
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
      return <LifePolicyDetailPage onNavigate={navigate} />;
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
  const accessPortal = useAccessPortal();
  const postAuthHome = "/insurance";
  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname === "/pricing";
  const resolvedPathname = accessPortal.isAuthenticated && isAuthRoute ? postAuthHome : pathname;
  const route = getRouteByPath(resolvedPathname);
  const resolvedIsAuthRoute = resolvedPathname === "/login" || resolvedPathname === "/signup" || resolvedPathname === "/pricing";
  const hasRouteAccess = hasTierAccess(accessPortal.currentTier, route.minimumTier || "free");
  const intendedPath = !resolvedIsAuthRoute ? resolvedPathname : postAuthHome;

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

  if (!accessPortal.isAuthenticated && !resolvedIsAuthRoute) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        <AuthLoginPage onNavigate={navigate} accessPortal={accessPortal} returnPath={intendedPath} />
      </div>
    );
  }

  if (resolvedIsAuthRoute) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        {renderRoute(resolvedPathname, navigate, accessPortal, postAuthHome)}
      </div>
    );
  }

  if (!hasRouteAccess) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" }}>
        <PricingPage
          onNavigate={navigate}
          accessPortal={accessPortal}
          lockedRouteTitle={route.title}
          returnPath={intendedPath}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#e2e8f0" }}>
      <PlatformShellDataProvider>
        <Sidebar
          currentPath={pathname}
          onNavigate={navigate}
          currentTier={accessPortal.currentTier}
          currentPlanLabel={accessPortal.currentPlan.label}
          onUpgrade={() => navigate("/pricing")}
        />
        <ContentContainer>
          <TopNav
            title={route.title}
            subtitle="Modular family continuity and asset-intelligence shell"
            onNavigate={navigate}
            currentPlanLabel={accessPortal.currentPlan.label}
            householdName={accessPortal.session.householdName || "Working Household"}
            onSignOut={() => {
              accessPortal.signOut();
              navigate("/login");
            }}
          />
          <div style={{ padding: "28px" }}>
            <RouteErrorBoundary resetKey={resolvedPathname}>
              {renderRoute(resolvedPathname, navigate, accessPortal, intendedPath)}
            </RouteErrorBoundary>
          </div>
        </ContentContainer>
      </PlatformShellDataProvider>
    </div>
  );
}
