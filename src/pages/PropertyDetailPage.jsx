import { useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  answerPropertyQuestion,
  buildPropertyReviewReport,
  buildValuationChangeSummary,
} from "../lib/domain/propertyValuation";
import {
  getPropertyDocumentClass,
  getPropertyType,
  listPropertyDocumentClasses,
  listPropertyTypes,
} from "../lib/domain/property";
import {
  getSupabaseConfigDiagnostics,
  getSupabaseConfigurationMessage,
  isSupabaseConfigured,
} from "../lib/supabase/client";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getPropertyBundle,
  linkHomeownersToProperty,
  linkMortgageToProperty,
  runPropertyVirtualValuation,
  unlinkHomeownersFromProperty,
  unlinkMortgageFromProperty,
  upsertPropertyStackAnalytics,
  updatePropertyAddressFacts,
  updatePropertyHomeownersLink,
  updatePropertyMortgageLink,
  uploadPropertyDocument,
} from "../lib/supabase/propertyData";
import { listHomeownersPolicies } from "../lib/supabase/homeownersData";
import { listMortgageLoans } from "../lib/supabase/mortgageData";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";
import { executeSmartAction } from "../lib/navigation/smartActions";

const PROPERTY_DOCUMENT_CLASSES = listPropertyDocumentClasses();
const PROPERTY_TYPES = listPropertyTypes();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "deed_reference",
  document_date: "",
  notes: "",
};

const PROPERTY_ASSISTANT_STARTERS = [
  "How strong is this valuation?",
  "How strong are the comps?",
  "Why did this value change?",
  "What official market support is being used?",
  "Is financing and coverage linked cleanly?",
  "What property facts are still missing?",
];

function actionButtonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "10px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function reportActionButtonStyle(active = false, primary = false) {
  if (primary) return actionButtonStyle(true);
  return {
    ...actionButtonStyle(false),
    border: active ? "1px solid #93c5fd" : "1px solid #cbd5e1",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#0f172a",
  };
}

function renderReportFactsGrid(items = [], columns = 3) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(180, Math.floor(720 / Math.max(columns, 1)))}px, 1fr))`,
        gap: "12px",
      }}
    >
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#ffffff",
            border: "1px solid rgba(148, 163, 184, 0.18)",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {item.label}
          </div>
          <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderReportSection(section) {
  if (!section) return null;

  return (
    <div
      key={section.id || section.title}
      style={{
        padding: "22px 24px",
        borderRadius: "18px",
        background: "#f8fafc",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{section.title}</div>
        {section.summary ? <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.8" }}>{section.summary}</div> : null}
      </div>

      {Array.isArray(section.items) && section.items.length > 0 ? renderReportFactsGrid(section.items, section.columns || 3) : null}

      {section.kind === "bullets" && Array.isArray(section.bullets) && section.bullets.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {section.kind === "table" ? (
        section.rows?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {section.columns.map((column) => (
                    <th
                      key={column.key}
                      style={{
                        textAlign: "left",
                        padding: "0 0 10px",
                        fontSize: "11px",
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={`${section.id || section.title}-${index}`}>
                    {section.columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          padding: "12px 0",
                          borderTop: index === 0 ? "none" : "1px solid rgba(226, 232, 240, 0.8)",
                          color: "#0f172a",
                          verticalAlign: "top",
                        }}
                      >
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#475569" }}>{section.empty_message || "No table rows available."}</div>
        )
      ) : null}
    </div>
  );
}

function ReportView({ report, onPrint }) {
  if (!report) return null;

  return (
    <SectionCard title="Property Review Report" subtitle="Printable property valuation, comp, equity, and linkage summary." accent="#bfdbfe">
      <div style={{ display: "grid", gap: "18px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap",
            padding: "18px 20px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
            border: "1px solid rgba(147, 197, 253, 0.28)",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Report View
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{report.title}</div>
            <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "820px" }}>{report.subtitle}</div>
          </div>
          <button type="button" onClick={onPrint} style={actionButtonStyle(true)}>
            Print Report
          </button>
        </div>
        {report.sections.map((section) => renderReportSection(section))}
      </div>
    </SectionCard>
  );
}

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "watch" || status === "review") return "warning";
  return "info";
}

function getContinuityTone(status) {
  if (status === "strong") return "good";
  if (status === "moderate") return "warning";
  return "info";
}

function getValuationTone(status) {
  if (status === "strong") return "good";
  if (status === "moderate") return "warning";
  if (status === "weak") return "alert";
  return "info";
}

function formatReviewFlag(flag) {
  const labels = {
    subject_facts_incomplete: "Subject facts are still incomplete",
    limited_comp_support: "Too few comparable sales qualified for stronger support",
    comp_similarity_mixed: "The remaining comps are mixed in subject fit",
    source_divergence_elevated: "Source estimates disagree enough to widen the range",
    stale_comp_recency: "Comparable sales are getting stale",
    no_strong_core_comps: "No strong core comps are currently visible",
    weak_comps_excluded: "Weaker comps were excluded from the blended estimate",
    distance_support_mixed: "Distance support is mixed across the remaining comps",
    official_market_support_unavailable: "Official market support is unavailable",
    official_market_signals_mixed: "Official market signals only partially align",
    invalid_value_signals_removed: "Invalid value signals were removed before blending",
  };

  return labels[flag] || String(flag || "").replace(/_/g, " ");
}

function getCompTierFromDisplay(comp = {}) {
  const similarity = Number(comp.raw_payload?.similarity_score);
  const distance = Number(comp.distance_miles);
  const monthsOld =
    comp.sale_date && !Number.isNaN(new Date(comp.sale_date).getTime())
      ? Math.max(
          0,
          (new Date().getUTCFullYear() - new Date(comp.sale_date).getUTCFullYear()) * 12 +
            (new Date().getUTCMonth() - new Date(comp.sale_date).getUTCMonth())
        )
      : null;

  if (
    Number.isFinite(similarity) &&
    similarity >= 0.82 &&
    (!Number.isFinite(distance) || distance <= 0.9) &&
    (monthsOld === null || monthsOld <= 9)
  ) {
    return "strong";
  }
  if (
    Number.isFinite(similarity) &&
    similarity >= 0.68 &&
    (!Number.isFinite(distance) || distance <= 1.75) &&
    (monthsOld === null || monthsOld <= 18)
  ) {
    return "usable";
  }
  return "weak";
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Not scored";
  return `${Math.round(Number(value) * 100)}%`;
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return numeric.toLocaleString("en-US");
}

function buildPropertyFactsDraft(property) {
  return {
    property_name: property?.property_name || "",
    street_1: property?.street_1 || "",
    street_2: property?.street_2 || "",
    city: property?.city || "",
    state: property?.state || "",
    postal_code: property?.postal_code || "",
    county: property?.county || "",
    apn: property?.apn || "",
    property_type_key: property?.property_type_key || "property_generic",
    beds: property?.beds ?? "",
    baths: property?.baths ?? "",
    square_feet: property?.square_feet ?? "",
    lot_size: property?.lot_size ?? "",
    year_built: property?.year_built ?? "",
    occupancy_type: property?.occupancy_type || "",
    last_purchase_price: property?.last_purchase_price ?? "",
    last_purchase_date: property?.last_purchase_date || property?.purchase_date || "",
  };
}

export default function PropertyDetailPage({ propertyId, onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const sectionRefs = useRef({});
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [availableMortgageLoans, setAvailableMortgageLoans] = useState([]);
  const [availableHomeownersPolicies, setAvailableHomeownersPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");
  const [selectedMortgageLoanId, setSelectedMortgageLoanId] = useState("");
  const [selectedHomeownersPolicyId, setSelectedHomeownersPolicyId] = useState("");
  const [linkingMortgage, setLinkingMortgage] = useState(false);
  const [linkingHomeowners, setLinkingHomeowners] = useState(false);
  const [editingMortgageLinkId, setEditingMortgageLinkId] = useState("");
  const [editingHomeownersLinkId, setEditingHomeownersLinkId] = useState("");
  const [mortgageLinkDraft, setMortgageLinkDraft] = useState({ link_type: "primary_financing", is_primary: true, notes: "" });
  const [homeownersLinkDraft, setHomeownersLinkDraft] = useState({ link_type: "primary_property_coverage", is_primary: true, notes: "" });
  const [savingLinkId, setSavingLinkId] = useState("");
  const [removingLinkId, setRemovingLinkId] = useState("");
  const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [factsDraft, setFactsDraft] = useState(buildPropertyFactsDraft(null));
  const [savingFacts, setSavingFacts] = useState(false);
  const [factsError, setFactsError] = useState("");
  const [factsSuccess, setFactsSuccess] = useState("");
  const [runningValuation, setRunningValuation] = useState(false);
  const [valuationError, setValuationError] = useState("");
  const [valuationSuccess, setValuationSuccess] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [showPropertyReport, setShowPropertyReport] = useState(false);
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "property_detail_page",
    }),
    [
      householdState.context.guestFallbackActive,
      householdState.context.householdId,
      householdState.context.ownershipMode,
      shellDebug.authUserId,
    ]
  );
  const scopeKey = `${platformScope.authUserId || "guest"}:${platformScope.householdId || "none"}:${platformScope.ownershipMode}`;

  async function loadPropertyBundle(targetPropertyId, options = {}) {
    const result = await getPropertyBundle(targetPropertyId, platformScope);
    if (result.error || !result.data?.property) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Property bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Property bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");
    if (!options.silent) {
      setLinkError("");
      setAnalyticsError("");
    }

    const linkedAssetId = result.data.property.assets?.id;
    if (linkedAssetId) {
      const assetResult = await getAssetDetailBundle(linkedAssetId, platformScope);
      if (!assetResult.error) {
        setAssetBundle(assetResult.data || null);
      } else if (!options.silent) {
        setAssetBundle(null);
        setLoadError(assetResult.error.message || "");
      }
    } else {
      setAssetBundle(null);
    }

    if (result.data.property?.household_id) {
      const [mortgageLoansResult, homeownersPoliciesResult] = await Promise.all([
        listMortgageLoans(platformScope.householdId || result.data.property.household_id),
        listHomeownersPolicies(result.data.property.household_id),
      ]);
      setAvailableMortgageLoans(mortgageLoansResult.data || []);
      setAvailableHomeownersPolicies(homeownersPoliciesResult.data || []);
      if (!options.silent && (mortgageLoansResult.error || homeownersPoliciesResult.error)) {
        setLinkError(
          mortgageLoansResult.error?.message ||
            homeownersPoliciesResult.error?.message ||
            ""
        );
      }
    }

    return { data: result.data, error: null };
  }

  useEffect(() => {
    if (!propertyId || householdState.loading || !platformScope.householdId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadPropertyBundle(propertyId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [householdState.loading, platformScope.householdId, propertyId, scopeKey]);

  useEffect(() => {
    setBundle(null);
    setAssetBundle(null);
    setAvailableMortgageLoans([]);
    setAvailableHomeownersPolicies([]);
    setLoadError("");
    setLinkError("");
    setLinkSuccess("");
    setAnalyticsError("");
    setFactsError("");
    setFactsSuccess("");
    setValuationError("");
    setValuationSuccess("");
  }, [scopeKey]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!platformScope.householdId && !householdState.loading) {
      console.warn("[VaultedShield] property detail scope unresolved; property bundle load is blocked until household scope is ready.", {
        propertyId,
        authUserId: platformScope.authUserId,
        ownershipMode: platformScope.ownershipMode,
      });
    }
  }, [
    householdState.loading,
    platformScope.authUserId,
    platformScope.householdId,
    platformScope.ownershipMode,
    propertyId,
  ]);

  useEffect(() => {
    setFactsDraft(buildPropertyFactsDraft(bundle?.property || null));
  }, [bundle?.property]);

  useEffect(() => {
    setAssistantHistory([]);
    setAssistantQuestion("");
  }, [propertyId]);

  const property = bundle?.property || null;
  const propertyType = property ? getPropertyType(property.property_type_key) : null;
  const linkedAsset = property?.assets || null;
  const linkedMortgages = bundle?.linkedMortgages || [];
  const linkedHomeownersPolicies = bundle?.linkedHomeownersPolicies || [];
  const propertyStackAnalytics = bundle?.propertyStackAnalytics || null;
  const latestPropertyValuation = bundle?.latestPropertyValuation || null;
  const valuationMetadata = latestPropertyValuation?.metadata || {};
  const dualColumnLayout = isTablet ? "1fr" : "1fr 1fr";
  const summaryRailLayout = isTablet ? "1fr" : "1.2fr 1fr";
  const documentRailLayout = isTablet ? "1fr" : "1.15fr 1fr";
  const factsHeaderLayout = isMobile ? "1fr" : "1fr 1fr";
  const factsStreetLayout = isTablet ? "1fr" : "1.2fr 0.8fr";
  const factsCityLayout = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 0.45fr 0.55fr";
  const factsTripleLayout = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr";
  const factsFiveLayout = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))";
  const tripleMetricLayout = isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))";
  const fiveMetricLayout = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))";
  const assistantFormLayout = isMobile ? "1fr" : "minmax(0, 1fr) auto";
  const baseInputStyle = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" };
  const baseSelectStyle = { ...baseInputStyle, background: "#fff" };
  const actionStackStyle = { display: "flex", gap: "10px", flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" };
  const actionButtonLayoutStyle = isMobile ? { width: "100%", justifyContent: "center" } : null;
  const wrapTextStyle = { minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere" };
  const officialMarketSignalCount = valuationMetadata.official_source_count ?? 0;
  const officialMarketSupportLabel =
    valuationMetadata.official_market_support === "aligned"
      ? "Aligned"
      : valuationMetadata.official_market_support === "mixed"
        ? "Mixed"
        : "Unavailable";
  const compDataOrigin = valuationMetadata.comp_data_origin || "simulated";
  const compDataOriginLabel =
    compDataOrigin === "official_api"
      ? "Official API comps"
      : compDataOrigin === "simulated_fallback"
        ? "Simulated fallback"
        : "Simulated comps";
  const compDataOriginTone =
    compDataOrigin === "official_api" ? "good" : compDataOrigin === "simulated_fallback" ? "warning" : "info";
  const providerMode = valuationMetadata.provider_mode || "mock_only";
  const providerFallbackReason = valuationMetadata.fallback_reason || "";
  const providerErrorStatus = valuationMetadata.provider_error_status || null;
  const providerErrorCode = valuationMetadata.provider_error_code || "";
  const requestedProvider = valuationMetadata.requested_provider || "attom_proxy";
  const attemptedEndpoint = valuationMetadata.attempted_endpoint || "";
  const endpointMode = valuationMetadata.endpoint_mode || "disabled";
  const officialDataQuality = valuationMetadata.official_data_quality || "unavailable";
  const officialSignalCount = valuationMetadata.official_signal_count ?? 0;
  const officialMarketContext = [
    valuationMetadata.official_market_signals?.market_city,
    valuationMetadata.official_market_signals?.market_state,
  ]
    .filter(Boolean)
    .join(", ");
  const propertyValuationHistory = bundle?.propertyValuationHistory || [];
  const valuationChangeSummary = useMemo(
    () => buildValuationChangeSummary(propertyValuationHistory),
    [propertyValuationHistory]
  );
  const valuationMarketProfile = valuationMetadata.market_profile || {};
  const analyzedCompRows = valuationMetadata.analyzed_comps || [];
  const bestComp = analyzedCompRows[0] || null;
  const strongCompCount = valuationMetadata.strong_comp_count ?? 0;
  const usableCompCount = valuationMetadata.usable_comp_count ?? 0;
  const discardedCompCount = valuationMetadata.discarded_comp_count ?? 0;
  const eligibleCompCount = latestPropertyValuation?.comps_count || 0;
  const valuationIsBroad =
    (latestPropertyValuation?.confidence_label || "weak") === "weak" ||
    (valuationMetadata.valuation_range_ratio ?? 0) >= 0.16 ||
    strongCompCount === 0;
  const formattedReviewFlags = (valuationMetadata.review_flags || []).map(formatReviewFlag);
  const topThreeCompAverage = useMemo(() => {
    const topComps = analyzedCompRows
      .slice(0, 3)
      .map((comp) => Number(comp.adjusted_estimate))
      .filter(Number.isFinite);
    if (!topComps.length) return null;
    return topComps.reduce((sum, value) => sum + value, 0) / topComps.length;
  }, [analyzedCompRows]);
  const propertyComps = bundle?.propertyComps || [];
  const latestAssistantEntry = assistantHistory[0] || null;
  const propertyEquityPosition = bundle?.propertyEquityPosition || null;
  const propertyStackLinkageStatus = bundle?.propertyStackLinkageStatus || "property_only";
  const supabaseDiagnostics = getSupabaseConfigDiagnostics();
  const hasInvalidSavedValuation = Boolean(propertyEquityPosition?.review_flags?.includes("invalid_saved_valuation"));
  const propertyReviewReport = useMemo(
    () =>
      buildPropertyReviewReport({
        property,
        latestValuation: latestPropertyValuation,
        valuationChangeSummary,
        propertyEquityPosition,
        propertyStackAnalytics,
        linkedMortgages,
        linkedHomeownersPolicies,
        propertyComps,
      }),
    [
      property,
      latestPropertyValuation,
      valuationChangeSummary,
      propertyEquityPosition,
      propertyStackAnalytics,
      linkedMortgages,
      linkedHomeownersPolicies,
      propertyComps,
    ]
  );

  const propertyStackPrompts = useMemo(() => {
    const prompts = [];

    if (linkedMortgages.length === 0) {
      prompts.push("No linked mortgage found for this property.");
    }
    if (linkedHomeownersPolicies.length === 0) {
      prompts.push("No linked homeowners policy found for this property.");
    }
    if (linkedMortgages.length > 1) {
      prompts.push("Multiple mortgages are linked to this property.");
    }
    if (linkedHomeownersPolicies.length > 1) {
      prompts.push("Multiple homeowners policies are linked to this property.");
    }
    if (linkedMortgages.length > 0 && linkedHomeownersPolicies.length > 0) {
      prompts.push("The linked property stack appears complete.");
    }
    if ((assetBundle?.portalLinks?.length || 0) > 0 && linkedHomeownersPolicies.length === 0) {
      prompts.push("This property has linked portals but no visible protection linkage yet.");
    }
    if (linkedHomeownersPolicies.length > 0 && linkedMortgages.length === 0) {
      prompts.push("This property has insurance linkage but no financing linkage visible.");
    }

    return prompts;
  }, [assetBundle?.portalLinks?.length, linkedHomeownersPolicies.length, linkedMortgages.length]);

  const summaryItems = useMemo(() => {
    if (!property) return [];
    return [
      { label: "Property Status", value: property.property_status || "unknown", helper: propertyType?.display_name || "Property" },
      { label: "Documents", value: bundle?.propertyDocuments?.length || 0, helper: "Property-specific document records" },
      { label: "Snapshots", value: bundle?.propertySnapshots?.length || 0, helper: "Normalized property records" },
      { label: "Analytics", value: bundle?.propertyAnalytics?.length || 0, helper: "Future property review outputs" },
      { label: "Virtual Valuation", value: latestPropertyValuation?.confidence_label || "none", helper: latestPropertyValuation?.midpoint_estimate ? formatCurrency(latestPropertyValuation.midpoint_estimate) : "No value analysis yet" },
    ];
  }, [bundle, latestPropertyValuation, property, propertyType]);

  const primaryMortgageSummary = useMemo(() => {
    if (!propertyStackAnalytics?.primary_mortgage_loan_id) return null;
    return (
      linkedMortgages.find((item) => item.id === propertyStackAnalytics.primary_mortgage_loan_id) || null
    );
  }, [linkedMortgages, propertyStackAnalytics?.primary_mortgage_loan_id]);

  const primaryHomeownersSummary = useMemo(() => {
    if (!propertyStackAnalytics?.primary_homeowners_policy_id) return null;
    return (
      linkedHomeownersPolicies.find(
        (item) => item.id === propertyStackAnalytics.primary_homeowners_policy_id
      ) || null
    );
  }, [linkedHomeownersPolicies, propertyStackAnalytics?.primary_homeowners_policy_id]);

  function enqueueFiles(fileList) {
    const entries = Array.from(fileList || []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "queued",
      assetDocumentId: null,
      propertyDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!property || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadPropertyDocument({
        household_id: property.household_id,
        asset_id: linkedAsset.id,
        property_id: property.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { property_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                propertyDocumentId: result.data?.propertyDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Property upload failed.");
        continue;
      }

      await loadPropertyBundle(property.id, { silent: true });
    }

    setUploading(false);
  }

  async function handleLinkMortgage(event) {
    event.preventDefault();
    if (!property?.id || !selectedMortgageLoanId) return;

    setLinkingMortgage(true);
    setLinkError("");
    setLinkSuccess("");
    const result = await linkMortgageToProperty(property.id, selectedMortgageLoanId, {
      link_type: linkedMortgages.length === 0 ? "primary_financing" : "secondary_financing",
      is_primary: linkedMortgages.length === 0,
      metadata: { linked_from: "property_detail" },
      scopeOverride: platformScope,
    });

    if (result.error) {
      setLinkError(result.error.message || "Mortgage link could not be created.");
      setLinkingMortgage(false);
      return;
    }

    await loadPropertyBundle(property.id, { silent: true });
    setSelectedMortgageLoanId("");
    setLinkSuccess("Mortgage link saved.");
    setLinkingMortgage(false);
  }

  async function handleLinkHomeowners(event) {
    event.preventDefault();
    if (!property?.id || !selectedHomeownersPolicyId) return;

    setLinkingHomeowners(true);
    setLinkError("");
    setLinkSuccess("");
    const result = await linkHomeownersToProperty(property.id, selectedHomeownersPolicyId, {
      link_type: linkedHomeownersPolicies.length === 0 ? "primary_property_coverage" : "supplemental_reference",
      is_primary: linkedHomeownersPolicies.length === 0,
      metadata: { linked_from: "property_detail" },
      scopeOverride: platformScope,
    });

    if (result.error) {
      setLinkError(result.error.message || "Homeowners link could not be created.");
      setLinkingHomeowners(false);
      return;
    }

    await loadPropertyBundle(property.id, { silent: true });
    setSelectedHomeownersPolicyId("");
    setLinkSuccess("Homeowners link saved.");
    setLinkingHomeowners(false);
  }

  function beginEditMortgageLink(linkedMortgage) {
    setEditingMortgageLinkId(linkedMortgage.linkage?.id || "");
    setMortgageLinkDraft({
      link_type: linkedMortgage.linkage?.link_type || "primary_financing",
      is_primary: Boolean(linkedMortgage.linkage?.is_primary),
      notes: linkedMortgage.linkage?.notes || "",
    });
    setLinkError("");
    setLinkSuccess("");
  }

  function beginEditHomeownersLink(linkedPolicy) {
    setEditingHomeownersLinkId(linkedPolicy.linkage?.id || "");
    setHomeownersLinkDraft({
      link_type: linkedPolicy.linkage?.link_type || "primary_property_coverage",
      is_primary: Boolean(linkedPolicy.linkage?.is_primary),
      notes: linkedPolicy.linkage?.notes || "",
    });
    setLinkError("");
    setLinkSuccess("");
  }

  async function handleSaveMortgageLink(linkId) {
    if (!property?.id || !linkId) return;
    setSavingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await updatePropertyMortgageLink(linkId, {
      ...mortgageLinkDraft,
      scopeOverride: platformScope,
    });
    if (result.error) {
      setLinkError(result.error.message || "Mortgage link could not be updated.");
      setSavingLinkId("");
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setEditingMortgageLinkId("");
    setLinkSuccess("Mortgage link updated.");
    setSavingLinkId("");
  }

  async function handleSaveHomeownersLink(linkId) {
    if (!property?.id || !linkId) return;
    setSavingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await updatePropertyHomeownersLink(linkId, {
      ...homeownersLinkDraft,
      scopeOverride: platformScope,
    });
    if (result.error) {
      setLinkError(result.error.message || "Homeowners link could not be updated.");
      setSavingLinkId("");
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setEditingHomeownersLinkId("");
    setLinkSuccess("Homeowners link updated.");
    setSavingLinkId("");
  }

  async function handleRemoveMortgageLink(linkId) {
    if (!property?.id || !linkId || !window.confirm("Remove this mortgage link from the property?")) return;
    setRemovingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await unlinkMortgageFromProperty(linkId, { scopeOverride: platformScope });
    if (result.error) {
      setLinkError(result.error.message || "Mortgage link could not be removed.");
      setRemovingLinkId("");
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setLinkSuccess("Mortgage link removed.");
    setRemovingLinkId("");
  }

  async function handleRemoveHomeownersLink(linkId) {
    if (!property?.id || !linkId || !window.confirm("Remove this homeowners link from the property?")) return;
    setRemovingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await unlinkHomeownersFromProperty(linkId, { scopeOverride: platformScope });
    if (result.error) {
      setLinkError(result.error.message || "Homeowners link could not be removed.");
      setRemovingLinkId("");
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setLinkSuccess("Homeowners link removed.");
    setRemovingLinkId("");
  }

  async function handleRefreshAnalytics() {
    if (!property?.id) return;
    setRefreshingAnalytics(true);
    setAnalyticsError("");
    const result = await upsertPropertyStackAnalytics(property.id, platformScope);
    if (result.error) {
      setAnalyticsError(result.error.message || "Property stack analytics could not be refreshed.");
      setRefreshingAnalytics(false);
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setLinkSuccess("Property stack analytics refreshed.");
    setRefreshingAnalytics(false);
  }

  async function handleSaveFacts(event) {
    event.preventDefault();
    if (!property?.id) return;
    if (!supabaseDiagnostics.isConfigured) {
      setFactsError(getSupabaseConfigurationMessage() || "Supabase is not configured.");
      setFactsSuccess("");
      return;
    }
    setSavingFacts(true);
    setFactsError("");
    setFactsSuccess("");
    const propertyAddress = [factsDraft.street_1, [factsDraft.city, factsDraft.state, factsDraft.postal_code].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(", ");
    const result = await updatePropertyAddressFacts(property.id, {
      ...factsDraft,
      property_address: propertyAddress || property.property_address || null,
      beds: factsDraft.beds === "" ? null : Number(factsDraft.beds),
      baths: factsDraft.baths === "" ? null : Number(factsDraft.baths),
      square_feet: factsDraft.square_feet === "" ? null : Number(factsDraft.square_feet),
      lot_size: factsDraft.lot_size === "" ? null : Number(factsDraft.lot_size),
      year_built: factsDraft.year_built === "" ? null : Number(factsDraft.year_built),
      last_purchase_price:
        factsDraft.last_purchase_price === "" ? null : Number(factsDraft.last_purchase_price),
      last_purchase_date: factsDraft.last_purchase_date || null,
    }, platformScope);
    if (result.error) {
      setFactsError(result.error.message || "Property facts could not be saved.");
      setSavingFacts(false);
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setFactsSuccess("Property address and facts saved.");
    setSavingFacts(false);
  }

  async function handleRunValuation() {
    if (!property?.id) return;
    if (!supabaseDiagnostics.isConfigured) {
      setValuationError(getSupabaseConfigurationMessage() || "Supabase is not configured.");
      setValuationSuccess("");
      return;
    }
    setRunningValuation(true);
    setValuationError("");
    setValuationSuccess("");
    const result = await runPropertyVirtualValuation(property.id, platformScope);
    if (result.error) {
      setValuationError(result.error.message || "Virtual valuation could not be completed.");
      setRunningValuation(false);
      return;
    }
    await loadPropertyBundle(property.id, { silent: true });
    setValuationSuccess("Virtual valuation refreshed.");
    setRunningValuation(false);
  }

  function handleAssistantPrompt(questionText) {
    const cleanQuestion = String(questionText || "").trim();
    if (!cleanQuestion) return;

    const response = answerPropertyQuestion({
      questionText: cleanQuestion,
      property,
      latestValuation: latestPropertyValuation,
      valuationChangeSummary,
      propertyEquityPosition,
      propertyStackAnalytics,
      linkedMortgages,
      linkedHomeownersPolicies,
      propertyId,
    });

    setAssistantHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        question: cleanQuestion,
        response,
      },
      ...current,
    ].slice(0, 6));
    setAssistantQuestion("");
  }

  function handleAssistantSubmit(event) {
    event.preventDefault();
    handleAssistantPrompt(assistantQuestion);
  }

  function scrollToPropertySection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handlePrintPropertyReport() {
    setShowPropertyReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  return (
    <div style={{ width: "100%", minWidth: 0, overflowX: "clip" }}>
      <PageHeader
        eyebrow="Assets"
        title={property?.property_name || linkedAsset?.asset_name || "Property Detail"}
        description="Live property bundle view backed by property records, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/property")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Property Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard><div style={{ color: "#64748b" }}>Loading property bundle...</div></SectionCard>
      ) : !property ? (
        <EmptyState title="Property not found" description={loadError || "This property detail page could not load a matching property record."} />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={propertyType?.display_name || property.property_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
          </div>
          <div style={{ marginTop: "18px", ...actionStackStyle }}>
            <button
              type="button"
              onClick={() => setShowPropertyReport((current) => !current)}
              style={{ ...reportActionButtonStyle(showPropertyReport, false), ...(actionButtonLayoutStyle || {}) }}
            >
              {showPropertyReport ? "Hide Property Report" : "Open Property Report"}
            </button>
            <button type="button" onClick={handlePrintPropertyReport} style={{ ...reportActionButtonStyle(false, true), ...(actionButtonLayoutStyle || {}) }}>
              Print Report
            </button>
          </div>

          {showPropertyReport ? (
            <div style={{ marginTop: "24px" }}>
              <ReportView report={propertyReviewReport} onPrint={handlePrintPropertyReport} />
            </div>
          ) : null}

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: summaryRailLayout, gap: "18px" }}>
            <SectionCard title="Property Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7", ...wrapTextStyle }}>
                <div><strong>Property Name:</strong> {property.property_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Property Type:</strong> {propertyType?.display_name || property.property_type_key}</div>
                <div><strong>Address:</strong> {property.property_address || "Limited visibility"}</div>
                <div><strong>County:</strong> {property.county || "Limited visibility"}</div>
                <div><strong>Owner:</strong> {property.owner_name || "Limited visibility"}</div>
                <div><strong>Occupancy:</strong> {property.occupancy_type || "Limited visibility"}</div>
                <div><strong>Purchase Date:</strong> {formatDate(property.purchase_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={property.property_status || "unknown"} tone={getStatusTone(property.property_status)} /></div>
              </div>
            </SectionCard>

            <SectionCard title="Linked Platform Asset Summary">
              {linkedAsset ? (
                <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7", ...wrapTextStyle }}>
                  <div><strong>Asset Name:</strong> {linkedAsset.asset_name}</div>
                  <div><strong>Category:</strong> {linkedAsset.asset_category}</div>
                  <div><strong>Subcategory:</strong> {linkedAsset.asset_subcategory || "Limited visibility"}</div>
                  <div><strong>Institution:</strong> {linkedAsset.institution_name || "Limited visibility"}</div>
                  <div><strong>Status:</strong> {linkedAsset.status || "Limited visibility"}</div>
                  <div style={{ color: "#64748b" }}>
                    This property record remains linked to the broader platform asset layer so shared documents, portals, alerts, tasks, and later mortgage or homeowners linkage can coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked asset summary" description="This property record does not currently show a linked generic asset record." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }} ref={(node) => { sectionRefs.current.facts = node; }}>
            <SectionCard title="Property Address & Facts">
              <form onSubmit={handleSaveFacts} style={{ display: "grid", gap: "12px", minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: factsHeaderLayout, gap: "12px" }}>
                  <input value={factsDraft.property_name} onChange={(event) => setFactsDraft((current) => ({ ...current, property_name: event.target.value }))} placeholder="Property name" style={baseInputStyle} />
                  <select value={factsDraft.property_type_key} onChange={(event) => setFactsDraft((current) => ({ ...current, property_type_key: event.target.value }))} style={baseSelectStyle}>
                    {PROPERTY_TYPES.map((item) => (
                      <option key={item.property_type_key} value={item.property_type_key}>
                        {item.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: factsStreetLayout, gap: "12px" }}>
                  <input value={factsDraft.street_1} onChange={(event) => setFactsDraft((current) => ({ ...current, street_1: event.target.value }))} placeholder="Street address" style={baseInputStyle} />
                  <input value={factsDraft.street_2} onChange={(event) => setFactsDraft((current) => ({ ...current, street_2: event.target.value }))} placeholder="Unit / Apt" style={baseInputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: factsCityLayout, gap: "12px" }}>
                  <input value={factsDraft.city} onChange={(event) => setFactsDraft((current) => ({ ...current, city: event.target.value }))} placeholder="City" style={baseInputStyle} />
                  <input value={factsDraft.state} onChange={(event) => setFactsDraft((current) => ({ ...current, state: event.target.value }))} placeholder="State" style={baseInputStyle} />
                  <input value={factsDraft.postal_code} onChange={(event) => setFactsDraft((current) => ({ ...current, postal_code: event.target.value }))} placeholder="ZIP" style={baseInputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: factsTripleLayout, gap: "12px" }}>
                  <input value={factsDraft.county} onChange={(event) => setFactsDraft((current) => ({ ...current, county: event.target.value }))} placeholder="County" style={baseInputStyle} />
                  <input value={factsDraft.apn} onChange={(event) => setFactsDraft((current) => ({ ...current, apn: event.target.value }))} placeholder="APN / Parcel" style={baseInputStyle} />
                  <input value={factsDraft.occupancy_type} onChange={(event) => setFactsDraft((current) => ({ ...current, occupancy_type: event.target.value }))} placeholder="Occupancy type" style={baseInputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: factsFiveLayout, gap: "12px" }}>
                  <input value={factsDraft.beds} onChange={(event) => setFactsDraft((current) => ({ ...current, beds: event.target.value }))} placeholder="Beds" style={baseInputStyle} />
                  <input value={factsDraft.baths} onChange={(event) => setFactsDraft((current) => ({ ...current, baths: event.target.value }))} placeholder="Baths" style={baseInputStyle} />
                  <input value={factsDraft.square_feet} onChange={(event) => setFactsDraft((current) => ({ ...current, square_feet: event.target.value }))} placeholder="Square feet" style={baseInputStyle} />
                  <input value={factsDraft.lot_size} onChange={(event) => setFactsDraft((current) => ({ ...current, lot_size: event.target.value }))} placeholder="Lot size" style={baseInputStyle} />
                  <input value={factsDraft.year_built} onChange={(event) => setFactsDraft((current) => ({ ...current, year_built: event.target.value }))} placeholder="Year built" style={baseInputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: factsHeaderLayout, gap: "12px" }}>
                  <input value={factsDraft.last_purchase_price} onChange={(event) => setFactsDraft((current) => ({ ...current, last_purchase_price: event.target.value }))} placeholder="Last purchase price" style={baseInputStyle} />
                  <input type="date" value={factsDraft.last_purchase_date} onChange={(event) => setFactsDraft((current) => ({ ...current, last_purchase_date: event.target.value }))} style={baseInputStyle} />
                </div>
                <div style={actionStackStyle}>
                  <button type="submit" disabled={savingFacts} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                    {savingFacts ? "Saving Facts..." : "Save Facts"}
                  </button>
                  <button type="button" onClick={handleRunValuation} disabled={runningValuation} style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                    {runningValuation ? "Running Valuation..." : "Run Virtual Valuation"}
                  </button>
                  <button type="button" onClick={handleRunValuation} disabled={runningValuation || !latestPropertyValuation} style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                    {runningValuation ? "Refreshing..." : "Refresh Valuation"}
                  </button>
                </div>
                {factsSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{factsSuccess}</div> : null}
                {factsError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{factsError}</div> : null}
                {valuationSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{valuationSuccess}</div> : null}
                {valuationError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{valuationError}</div> : null}
              </form>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Ask About This Property"
              subtitle="Ask focused questions about the current value read, comp quality, market support, and property linkage using the live intelligence already loaded on this page."
            >
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
                  {PROPERTY_ASSISTANT_STARTERS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleAssistantPrompt(prompt)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "999px",
                        border: "1px solid #dbeafe",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontWeight: 700,
                        cursor: "pointer",
                        maxWidth: "100%",
                        textAlign: "left",
                        ...wrapTextStyle,
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAssistantSubmit} style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: assistantFormLayout, gap: "12px", alignItems: "center" }}>
                    <input
                      value={assistantQuestion}
                      onChange={(event) => setAssistantQuestion(event.target.value)}
                      placeholder="Ask a question about this property..."
                      style={{
                        padding: "14px 16px",
                        borderRadius: "14px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!assistantQuestion.trim()}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "12px",
                        border: "none",
                        background: assistantQuestion.trim() ? "#0f172a" : "#94a3b8",
                        color: "#ffffff",
                        cursor: assistantQuestion.trim() ? "pointer" : "not-allowed",
                        fontWeight: 700,
                        ...(actionButtonLayoutStyle || {}),
                      }}
                    >
                      Ask
                    </button>
                  </div>
                </form>

                {latestAssistantEntry ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "16px",
                      padding: "20px 22px",
                      borderRadius: "20px",
                      background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                      border: "1px solid rgba(147, 197, 253, 0.28)",
                    }}
                  >
                    <div style={{ display: "grid", gap: "8px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Latest Answer
                      </div>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{latestAssistantEntry.question}</div>
                      <div style={{ color: "#0f172a", lineHeight: "1.8", fontSize: "16px", fontWeight: 600 }}>
                        {latestAssistantEntry.response.answer_text}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <StatusBadge label={`Intent: ${latestAssistantEntry.response.intent.replace(/_/g, " ")}`} tone="info" />
                      <StatusBadge
                        label={`Confidence: ${latestAssistantEntry.response.confidence_label}`}
                        tone={
                          latestAssistantEntry.response.confidence_label === "strong"
                            ? "good"
                            : latestAssistantEntry.response.confidence_label === "moderate"
                              ? "warning"
                              : "info"
                        }
                      />
                    </div>

                    {latestAssistantEntry.response.evidence_points?.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Supporting Evidence</div>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                          {latestAssistantEntry.response.evidence_points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {(latestAssistantEntry.response.actions || []).length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Suggested Actions</div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
                          {latestAssistantEntry.response.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              onClick={() =>
                                executeSmartAction(action, {
                                  navigate: onNavigate,
                                  scrollToSection: scrollToPropertySection,
                                })
                              }
                              style={{
                                padding: "10px 12px",
                                borderRadius: "999px",
                                border: "1px solid #dbeafe",
                                background: "#ffffff",
                                color: "#1d4ed8",
                                fontWeight: 700,
                                cursor: "pointer",
                                maxWidth: "100%",
                                textAlign: "left",
                                ...wrapTextStyle,
                              }}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Follow-Up Prompts</div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
                        {(latestAssistantEntry.response.followup_prompts || []).map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleAssistantPrompt(prompt)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "999px",
                              border: "1px solid #dbeafe",
                              background: "#ffffff",
                              color: "#1d4ed8",
                              fontWeight: 700,
                              cursor: "pointer",
                              maxWidth: "100%",
                              textAlign: "left",
                              ...wrapTextStyle,
                            }}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "18px 20px", borderRadius: "18px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
                    Ask about valuation strength, comp quality, market support, value change, or whether financing and protection are linked cleanly.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualColumnLayout, gap: "18px" }}>
            <div ref={(node) => { sectionRefs.current.mortgages = node; }}>
            <SectionCard title="Linked Mortgages">
              {linkedMortgages.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {linkedMortgages.map((mortgage) => (
                    <div key={mortgage.linkage?.id || mortgage.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={wrapTextStyle}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{mortgage.loan_name || mortgage.assets?.asset_name || "Mortgage Loan"}</div>
                          <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                            <div><strong>Lender:</strong> {mortgage.assets?.institution_name || mortgage.lender_key || "Limited visibility"}</div>
                            <div><strong>Status:</strong> {mortgage.current_status || "Limited visibility"}</div>
                            <div><strong>Link Type:</strong> {mortgage.linkage?.link_type || "primary_financing"}</div>
                            <div><strong>Primary:</strong> {mortgage.linkage?.is_primary ? "Yes" : "No"}</div>
                            <div><strong>Notes:</strong> {mortgage.linkage?.notes || "None"}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: "8px", width: isMobile ? "100%" : undefined }}>
                          <button onClick={() => onNavigate(`/mortgage/detail/${mortgage.id}`)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                            Open Mortgage
                          </button>
                          <button onClick={() => beginEditMortgageLink(mortgage)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                            Edit
                          </button>
                          <button onClick={() => handleRemoveMortgageLink(mortgage.linkage?.id)} disabled={removingLinkId === mortgage.linkage?.id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 700, color: "#991b1b", ...(actionButtonLayoutStyle || {}) }}>
                            {removingLinkId === mortgage.linkage?.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </div>
                      {editingMortgageLinkId === mortgage.linkage?.id ? (
                        <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                          <select value={mortgageLinkDraft.link_type} onChange={(event) => setMortgageLinkDraft((current) => ({ ...current, link_type: event.target.value }))} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                            <option value="primary_financing">primary_financing</option>
                            <option value="secondary_financing">secondary_financing</option>
                            <option value="heloc">heloc</option>
                            <option value="historical_reference">historical_reference</option>
                            <option value="other">other</option>
                          </select>
                          <label style={{ color: "#475569", display: "flex", gap: "8px", alignItems: "center" }}>
                            <input type="checkbox" checked={mortgageLinkDraft.is_primary} onChange={(event) => setMortgageLinkDraft((current) => ({ ...current, is_primary: event.target.checked }))} />
                            Primary mortgage link
                          </label>
                          <textarea value={mortgageLinkDraft.notes} onChange={(event) => setMortgageLinkDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Link notes" style={{ ...baseInputStyle, padding: "10px", resize: "vertical" }} />
                          <div style={actionStackStyle}>
                            <button onClick={() => handleSaveMortgageLink(mortgage.linkage?.id)} disabled={savingLinkId === mortgage.linkage?.id} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                              {savingLinkId === mortgage.linkage?.id ? "Saving..." : "Save Link"}
                            </button>
                            <button onClick={() => setEditingMortgageLinkId("")} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No linked mortgages" description="Link a household mortgage to make financing visibility explicit for this property." />
              )}

              <form onSubmit={handleLinkMortgage} style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
                <select value={selectedMortgageLoanId} onChange={(event) => setSelectedMortgageLoanId(event.target.value)} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">Link existing mortgage</option>
                  {availableMortgageLoans.map((mortgage) => (
                    <option key={mortgage.id} value={mortgage.id}>
                      {mortgage.loan_name || mortgage.property_address || mortgage.assets?.asset_name || mortgage.id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={linkingMortgage || !selectedMortgageLoanId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                  {linkingMortgage ? "Linking Mortgage..." : "Link Mortgage"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div ref={(node) => { sectionRefs.current.homeowners = node; }}>
            <SectionCard title="Linked Homeowners Policies">
              {linkedHomeownersPolicies.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {linkedHomeownersPolicies.map((policy) => (
                    <div key={policy.linkage?.id || policy.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={wrapTextStyle}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{policy.policy_name || policy.assets?.asset_name || "Homeowners Policy"}</div>
                          <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                            <div><strong>Carrier:</strong> {policy.assets?.institution_name || policy.carrier_key || "Limited visibility"}</div>
                            <div><strong>Status:</strong> {policy.policy_status || "Limited visibility"}</div>
                            <div><strong>Link Type:</strong> {policy.linkage?.link_type || "primary_property_coverage"}</div>
                            <div><strong>Primary:</strong> {policy.linkage?.is_primary ? "Yes" : "No"}</div>
                            <div><strong>Notes:</strong> {policy.linkage?.notes || "None"}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: "8px", width: isMobile ? "100%" : undefined }}>
                          <button onClick={() => onNavigate(`/insurance/homeowners/detail/${policy.id}`)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                            Open Policy
                          </button>
                          <button onClick={() => beginEditHomeownersLink(policy)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                            Edit
                          </button>
                          <button onClick={() => handleRemoveHomeownersLink(policy.linkage?.id)} disabled={removingLinkId === policy.linkage?.id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 700, color: "#991b1b", ...(actionButtonLayoutStyle || {}) }}>
                            {removingLinkId === policy.linkage?.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </div>
                      {editingHomeownersLinkId === policy.linkage?.id ? (
                        <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                          <select value={homeownersLinkDraft.link_type} onChange={(event) => setHomeownersLinkDraft((current) => ({ ...current, link_type: event.target.value }))} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                            <option value="primary_property_coverage">primary_property_coverage</option>
                            <option value="supplemental_reference">supplemental_reference</option>
                            <option value="flood_reference">flood_reference</option>
                            <option value="earthquake_reference">earthquake_reference</option>
                            <option value="other">other</option>
                          </select>
                          <label style={{ color: "#475569", display: "flex", gap: "8px", alignItems: "center" }}>
                            <input type="checkbox" checked={homeownersLinkDraft.is_primary} onChange={(event) => setHomeownersLinkDraft((current) => ({ ...current, is_primary: event.target.checked }))} />
                            Primary homeowners link
                          </label>
                          <textarea value={homeownersLinkDraft.notes} onChange={(event) => setHomeownersLinkDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Link notes" style={{ ...baseInputStyle, padding: "10px", resize: "vertical" }} />
                          <div style={actionStackStyle}>
                            <button onClick={() => handleSaveHomeownersLink(policy.linkage?.id)} disabled={savingLinkId === policy.linkage?.id} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                              {savingLinkId === policy.linkage?.id ? "Saving..." : "Save Link"}
                            </button>
                            <button onClick={() => setEditingHomeownersLinkId("")} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No linked homeowners policies" description="Link a homeowners policy to make protection visibility explicit for this property." />
              )}

              <form onSubmit={handleLinkHomeowners} style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
                <select value={selectedHomeownersPolicyId} onChange={(event) => setSelectedHomeownersPolicyId(event.target.value)} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">Link existing homeowners policy</option>
                  {availableHomeownersPolicies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.policy_name || policy.property_address || policy.assets?.asset_name || policy.id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={linkingHomeowners || !selectedHomeownersPolicyId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                  {linkingHomeowners ? "Linking Homeowners..." : "Link Homeowners Policy"}
                </button>
              </form>
            </SectionCard>
            </div>
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard title="Property Stack Review">
              <AIInsightPanel
                title={propertyStackLinkageStatus}
                summary={`Current linkage status: ${propertyStackLinkageStatus}`}
                bullets={propertyStackPrompts}
              />
              {linkSuccess ? <div style={{ marginTop: "12px", color: "#166534", fontSize: "14px" }}>{linkSuccess}</div> : null}
              {linkError ? <div style={{ marginTop: "12px", color: "#991b1b", fontSize: "14px" }}>{linkError}</div> : null}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Property Stack Analytics"
              actions={
                import.meta.env.DEV ? (
                  <button
                    type="button"
                    onClick={handleRefreshAnalytics}
                    disabled={refreshingAnalytics}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {refreshingAnalytics ? "Refreshing..." : "Refresh Analytics"}
                  </button>
                ) : null
              }
            >
              {propertyStackAnalytics ? (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <StatusBadge label={propertyStackAnalytics.linkage_status || propertyStackLinkageStatus} tone="info" />
                    <StatusBadge label={`Completeness ${formatScore(propertyStackAnalytics.completeness_score)}`} tone={getContinuityTone(propertyStackAnalytics.continuity_status)} />
                    <StatusBadge label={propertyStackAnalytics.continuity_status || "weak"} tone={getContinuityTone(propertyStackAnalytics.continuity_status)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: dualColumnLayout, gap: "18px" }}>
                    <div style={{ color: "#475569", lineHeight: "1.7", ...wrapTextStyle }}>
                      <div><strong>Primary Mortgage:</strong> {primaryMortgageSummary?.loan_name || primaryMortgageSummary?.assets?.asset_name || propertyStackAnalytics.primary_mortgage_loan_id || "Not set"}</div>
                      <div><strong>Primary Homeowners:</strong> {primaryHomeownersSummary?.policy_name || primaryHomeownersSummary?.assets?.asset_name || propertyStackAnalytics.primary_homeowners_policy_id || "Not set"}</div>
                      <div><strong>Mortgage Links:</strong> {propertyStackAnalytics.mortgage_link_count ?? 0}</div>
                      <div><strong>Homeowners Links:</strong> {propertyStackAnalytics.homeowners_link_count ?? 0}</div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7", ...wrapTextStyle }}>
                      <div><strong>Has Mortgage:</strong> {propertyStackAnalytics.has_mortgage ? "Yes" : "No"}</div>
                      <div><strong>Has Homeowners:</strong> {propertyStackAnalytics.has_homeowners ? "Yes" : "No"}</div>
                      <div><strong>Continuity:</strong> {propertyStackAnalytics.continuity_status || "weak"}</div>
                      <div><strong>Updated:</strong> {formatDate(propertyStackAnalytics.updated_at || propertyStackAnalytics.created_at)}</div>
                    </div>
                  </div>
                  <AIInsightPanel
                    title="Persisted review state"
                    summary={`This property stack is currently stored as ${propertyStackAnalytics.linkage_status || propertyStackLinkageStatus} with ${formatScore(propertyStackAnalytics.completeness_score)} continuity completeness.`}
                    bullets={propertyStackAnalytics.prompts?.length ? propertyStackAnalytics.prompts : ["No additional prompts are currently stored for this property stack."]}
                  />
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <strong>Review Flags:</strong>{" "}
                    {propertyStackAnalytics.review_flags?.length
                      ? propertyStackAnalytics.review_flags.join(", ")
                      : "None currently stored"}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No property stack analytics yet"
                  description="Persisted property stack continuity analytics will appear here once the current link state is evaluated."
                />
              )}
              {analyticsError ? (
                <div style={{ marginTop: "12px", color: "#991b1b", fontSize: "14px" }}>{analyticsError}</div>
              ) : null}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualColumnLayout, gap: "18px" }}>
            <div ref={(node) => { sectionRefs.current.valuation = node; }}>
            <SectionCard title="Virtual Valuation">
              {latestPropertyValuation ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <StatusBadge label={latestPropertyValuation.confidence_label || "weak"} tone={getValuationTone(latestPropertyValuation.confidence_label)} />
                    <StatusBadge label={latestPropertyValuation.valuation_status || "draft"} tone="info" />
                    <StatusBadge label={`${eligibleCompCount || 0} eligible comps`} tone={strongCompCount >= 2 ? "good" : strongCompCount === 1 ? "warning" : "alert"} />
                    {discardedCompCount > 0 ? (
                      <StatusBadge label={`${discardedCompCount} excluded`} tone="warning" />
                    ) : null}
                    <StatusBadge label={compDataOriginLabel} tone={compDataOriginTone} />
                    {compDataOrigin === "official_api" ? (
                      <StatusBadge
                        label={officialDataQuality === "strong" ? "Official support strong" : officialDataQuality === "limited" ? "Official support limited" : "Official support unavailable"}
                        tone={officialDataQuality === "strong" ? "good" : officialDataQuality === "limited" ? "warning" : "info"}
                      />
                    ) : null}
                    <StatusBadge label={`Official market ${officialMarketSupportLabel.toLowerCase()}`} tone={officialMarketSupportLabel === "Aligned" ? "good" : officialMarketSupportLabel === "Mixed" ? "warning" : "info"} />
                    {hasInvalidSavedValuation ? (
                      <StatusBadge label="Valuation invalid" tone="alert" />
                    ) : null}
                  </div>
                  {hasInvalidSavedValuation ? (
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", lineHeight: "1.7", fontWeight: 600 }}>
                      The latest saved valuation contains invalid value output and should be refreshed before using it in review.
                    </div>
                  ) : null}
                  {providerMode === "simulated_fallback" ? (
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", lineHeight: "1.7", fontWeight: 600 }}>
                      Official comp data was requested, but this run fell back to simulated comps.
                      {providerFallbackReason ? ` Reason: ${providerFallbackReason}.` : ""}
                      {providerErrorStatus ? ` Upstream status: ${providerErrorStatus}.` : ""}
                    </div>
                  ) : null}
                  {providerMode === "mock_only" ? (
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", lineHeight: "1.7", fontWeight: 600 }}>
                      This run is still using simulated comps. Configure a real property comp API endpoint to replace heuristic comparable sales.
                    </div>
                  ) : null}
                  {providerMode === "official_api" && officialDataQuality === "limited" ? (
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", lineHeight: "1.7", fontWeight: 600 }}>
                      Official comp data was available for this run, but support is still limited. Treat this as a broader review range rather than a tight market call.
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: tripleMetricLayout, gap: "12px" }}>
                    <div><strong>Low:</strong><div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>{formatCurrency(latestPropertyValuation.low_estimate)}</div></div>
                    <div><strong>Midpoint:</strong><div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>{formatCurrency(latestPropertyValuation.midpoint_estimate)}</div></div>
                    <div><strong>High:</strong><div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>{formatCurrency(latestPropertyValuation.high_estimate)}</div></div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <div><strong>Confidence Score:</strong> {formatScore(latestPropertyValuation.confidence_score)}</div>
                    <div><strong>Price / Sq Ft Estimate:</strong> {latestPropertyValuation.price_per_sqft_estimate ? formatCurrency(latestPropertyValuation.price_per_sqft_estimate) : "Not available"}</div>
                    <div><strong>Valuation Date:</strong> {formatDate(latestPropertyValuation.valuation_date)}</div>
                    <div><strong>Matched Market Context:</strong> {officialMarketContext || "Local market context only"}</div>
                    <div><strong>Estimate Shape:</strong> {valuationIsBroad ? "Broad review range" : "Tighter review range"}</div>
                    <div><strong>Comp Source Path:</strong> {requestedProvider} via {endpointMode === "same_origin_proxy" ? "same-origin proxy" : endpointMode === "external_proxy" ? "external proxy" : "simulated only"}</div>
                    <div><strong>Official Signals:</strong> {officialSignalCount}</div>
                    {import.meta.env.DEV && attemptedEndpoint ? <div><strong>Comp Endpoint:</strong> {attemptedEndpoint}</div> : null}
                    {providerErrorCode ? <div><strong>Fallback Code:</strong> {providerErrorCode}</div> : null}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: fiveMetricLayout, gap: "12px" }}>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Subject Completeness</div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>{formatScore(valuationMetadata.subject_completeness)}</div>
                    </div>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Strong Core Comps</div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>{strongCompCount}</div>
                    </div>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Usable Comps</div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>
                        {usableCompCount}
                      </div>
                    </div>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Excluded Comps</div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>{discardedCompCount}</div>
                    </div>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Range Width</div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>
                        {formatScore(valuationMetadata.valuation_range_ratio)}
                      </div>
                    </div>
                  </div>
                  <AIInsightPanel
                    title="Blended value analysis"
                    summary={
                      valuationIsBroad
                        ? "This is a broader virtual valuation range, not a tight price call. Weak or mixed comps are being discounted more aggressively so the estimate stays honest."
                        : "This virtual valuation has a tighter support stack than usual, but it is still an explainable review range rather than a formal appraisal."
                    }
                    bullets={
                      latestPropertyValuation.adjustment_notes?.length
                        ? latestPropertyValuation.adjustment_notes
                        : ["Adjustment notes will appear here after a valuation run."]
                    }
                  />
                  <div style={{ display: "grid", gridTemplateColumns: dualColumnLayout, gap: "12px" }}>
                    <div style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>Comp Support Read</div>
                      <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Best Comp Fit:</strong> {bestComp ? formatScore(bestComp.similarity_score) : "Not available"}</div>
                        <div><strong>Comp Fit Score:</strong> {formatScore(valuationMetadata.comp_fit_score)}</div>
                        <div><strong>Top 3 Comp Avg:</strong> {topThreeCompAverage !== null ? formatCurrency(topThreeCompAverage) : "Not available"}</div>
                        <div><strong>Best Comp Distance:</strong> {bestComp?.distance_miles !== null && bestComp?.distance_miles !== undefined ? `${bestComp.distance_miles} mi` : "Not available"}</div>
                        <div><strong>Best Comp Date:</strong> {bestComp?.sale_date ? formatDate(bestComp.sale_date) : "Not available"}</div>
                        <div><strong>Average Comp Recency:</strong> {valuationMetadata.average_comp_recency_months !== null && valuationMetadata.average_comp_recency_months !== undefined ? `${valuationMetadata.average_comp_recency_months} mo` : "Not available"}</div>
                      </div>
                    </div>
                    <div style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>Local Market Profile</div>
                      <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Current Market $/Sq Ft:</strong> {valuationMarketProfile.current_ppsf ? formatCurrency(valuationMarketProfile.current_ppsf) : "Not available"}</div>
                        <div><strong>Annual Market Trend:</strong> {valuationMarketProfile.annual_growth_rate !== null && valuationMarketProfile.annual_growth_rate !== undefined ? formatScore(valuationMarketProfile.annual_growth_rate) : "Not available"}</div>
                        <div><strong>1-Year Market Change:</strong> {valuationMarketProfile.market_one_year_change !== null && valuationMarketProfile.market_one_year_change !== undefined ? `${Number(valuationMarketProfile.market_one_year_change).toFixed(1)}%` : "Not available"}</div>
                        <div><strong>5-Year Market Change:</strong> {valuationMarketProfile.market_five_year_change !== null && valuationMarketProfile.market_five_year_change !== undefined ? `${Number(valuationMarketProfile.market_five_year_change).toFixed(1)}%` : "Not available"}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <strong>Source Summary:</strong>
                    <div style={{ marginTop: "8px", display: "grid", gap: "10px" }}>
                      {(latestPropertyValuation.source_summary || []).map((source, index) => (
                        <div key={`${source.source_name}-${index}`} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                          <div style={{ fontWeight: 700, color: "#0f172a", ...wrapTextStyle }}>
                            {source.source_name}
                            {source.official_source ? (
                              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#0f766e", fontWeight: 600 }}>Official</span>
                            ) : null}
                          </div>
                          <div style={{ marginTop: "6px", color: "#475569" }}>
                            {formatCurrency(source.estimate)} | confidence {formatScore(source.confidence)}
                            {source.contribution_weight ? ` | weight ${formatScore(source.contribution_weight)}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <strong>Review Flags:</strong>{" "}
                    {formattedReviewFlags.length
                      ? formattedReviewFlags.join(", ")
                      : "None currently visible"}
                  </div>
                  <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.6", padding: "12px 14px", borderRadius: "12px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
                    {latestPropertyValuation.disclaimer_text || "Virtual valuation only. Not a licensed appraisal."}
                  </div>
                </div>
              ) : (
                <EmptyState title="No virtual valuation yet" description="Run a virtual valuation to store a blended estimate, confidence score, source summary, and comparable sales review for this property." />
              )}
            </SectionCard>
            </div>

            <div ref={(node) => { sectionRefs.current.valuation_history = node; }}>
            <SectionCard title="Valuation History">
              {propertyValuationHistory.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <AIInsightPanel
                    title="Valuation Change Review"
                    summary={valuationChangeSummary.summary}
                    bullets={
                      valuationChangeSummary.bullets?.length
                        ? valuationChangeSummary.bullets
                        : ["Run another valuation later to compare value movement, support quality, and market alignment over time."]
                    }
                  />
                  {propertyValuationHistory.slice(0, 5).map((valuation) => (
                    <div key={valuation.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatDate(valuation.valuation_date)}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Midpoint:</strong> {formatCurrency(valuation.midpoint_estimate)}</div>
                        <div><strong>Confidence:</strong> {valuation.confidence_label || "Not labeled"} ({formatScore(valuation.confidence_score)})</div>
                        <div><strong>Comps:</strong> {valuation.comps_count || 0}</div>
                        <div><strong>Official Market:</strong> {valuation.metadata?.official_market_support || "Unavailable"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No valuation history yet" description="Saved virtual valuation runs will appear here so later reviews can compare changes over time." />
              )}
            </SectionCard>
            </div>
          </div>

          <div style={{ marginTop: "24px" }} ref={(node) => { sectionRefs.current.equity = node; }}>
            <SectionCard title="Property Equity & Coverage Intelligence">
              {propertyEquityPosition ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <StatusBadge label={`Equity visibility ${propertyEquityPosition.equity_visibility_status || "unavailable"}`} tone={getContinuityTone(propertyEquityPosition.equity_visibility_status)} />
                    <StatusBadge label={`Financing ${propertyEquityPosition.financing_status || "missing"}`} tone={propertyEquityPosition.financing_status === "visible" ? "good" : "warning"} />
                    <StatusBadge label={`Protection ${propertyEquityPosition.protection_status || "missing"}`} tone={propertyEquityPosition.protection_status === "visible" ? "good" : "warning"} />
                    <StatusBadge label={`Valuation ${propertyEquityPosition.valuation_confidence_label || "unavailable"}`} tone={getContinuityTone(propertyEquityPosition.valuation_confidence_label)} />
                    {hasInvalidSavedValuation ? (
                      <StatusBadge label="Refresh required" tone="alert" />
                    ) : null}
                  </div>
                  {hasInvalidSavedValuation ? (
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", lineHeight: "1.7", fontWeight: 600 }}>
                      Equity calculations are using an invalid saved valuation. Refresh the valuation before relying on estimated value, equity, or LTV.
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: tripleMetricLayout, gap: "12px" }}>
                    <div>
                      <strong>Estimated Value Midpoint</strong>
                      <div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>
                        {formatCurrency(propertyEquityPosition.estimated_value_midpoint)}
                      </div>
                    </div>
                    <div>
                      <strong>Estimated Equity Midpoint</strong>
                      <div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>
                        {propertyEquityPosition.estimated_equity_midpoint !== null
                          ? formatCurrency(propertyEquityPosition.estimated_equity_midpoint)
                          : "Insufficient data"}
                      </div>
                    </div>
                    <div>
                      <strong>Estimated LTV</strong>
                      <div style={{ marginTop: "6px", color: "#0f172a", fontWeight: 700 }}>
                        {propertyEquityPosition.estimated_ltv !== null
                          ? formatScore(propertyEquityPosition.estimated_ltv)
                          : "Insufficient data"}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <div><strong>Estimated Value Range:</strong> {formatCurrency(propertyEquityPosition.estimated_value_low)} to {formatCurrency(propertyEquityPosition.estimated_value_high)}</div>
                    <div><strong>Estimated Equity Range:</strong> {propertyEquityPosition.estimated_equity_low !== null && propertyEquityPosition.estimated_equity_high !== null ? `${formatCurrency(propertyEquityPosition.estimated_equity_low)} to ${formatCurrency(propertyEquityPosition.estimated_equity_high)}` : "Insufficient debt visibility to estimate equity range"}</div>
                    <div><strong>Primary Mortgage Balance:</strong> {propertyEquityPosition.primary_mortgage_balance !== null ? formatCurrency(propertyEquityPosition.primary_mortgage_balance) : "Not clearly visible"}</div>
                  </div>
                  <AIInsightPanel
                    title="Value, debt, and protection review"
                    summary="This is an explainable property review layer that combines virtual valuation, visible financing linkage, and homeowners protection visibility. It is not a lending, underwriting, or appraisal conclusion."
                    bullets={
                      propertyEquityPosition.prompts?.length
                        ? propertyEquityPosition.prompts
                        : ["Property value, debt, and protection signals are still limited."]
                    }
                  />
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    <strong>Review Flags:</strong>{" "}
                    {propertyEquityPosition.review_flags?.length
                      ? propertyEquityPosition.review_flags.join(", ")
                      : "None currently visible"}
                  </div>
                </div>
              ) : (
                <EmptyState title="No equity intelligence yet" description="Run a virtual valuation and link financing/protection records to improve value, debt, and protection visibility for this property." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }} ref={(node) => { sectionRefs.current.comps = node; }}>
            <SectionCard title="Comparable Sales">
              {propertyComps.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <AIInsightPanel
                    title="Comp quality review"
                    summary={
                      valuationIsBroad
                        ? "Comparable sales are available, but the engine is treating this comp set conservatively because fit, recency, or distance support is mixed."
                        : "Comparable sales are reading as relatively well aligned for this virtual review, with tighter fit on distance, recency, and subject profile."
                    }
                    bullets={[
                      `Comp source mode: ${compDataOriginLabel}.`,
                      bestComp
                        ? `Best visible comp fit is ${formatScore(bestComp.similarity_score)} at ${bestComp.distance_miles ?? "?"} miles.`
                        : "Best comp fit is not available yet.",
                      `Eligible comps: ${eligibleCompCount || 0}. Excluded weaker comps: ${discardedCompCount}.`,
                      valuationMetadata.average_comp_recency_months !== null && valuationMetadata.average_comp_recency_months !== undefined
                        ? `Average comp recency is ${valuationMetadata.average_comp_recency_months} months and the overall fit score is ${formatScore(valuationMetadata.comp_fit_score)}.`
                        : "Average comp recency is not available yet.",
                    ]}
                  />
                  {propertyComps.map((comp) => (
                    <div key={comp.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                        <StatusBadge label={getCompTierFromDisplay(comp)} tone={getValuationTone(getCompTierFromDisplay(comp) === "usable" ? "moderate" : getCompTierFromDisplay(comp))} />
                        {comp.distance_miles !== null && comp.distance_miles !== undefined && comp.distance_miles > 1.25 ? (
                          <StatusBadge label="farther comp" tone="warning" />
                        ) : null}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <div style={wrapTextStyle}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{comp.comp_address || "Comparable sale"}</div>
                          <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                            <div><strong>Distance:</strong> {comp.distance_miles ?? "?"} mi</div>
                            <div><strong>Sale Price:</strong> {formatCurrency(comp.sale_price)}</div>
                            <div><strong>Sale Date:</strong> {formatDate(comp.sale_date)}</div>
                          </div>
                        </div>
                        <div style={{ color: "#475569", lineHeight: "1.7", ...wrapTextStyle }}>
                          <div><strong>Beds / Baths:</strong> {comp.beds ?? "?"} / {comp.baths ?? "?"}</div>
                          <div><strong>Sq Ft:</strong> {formatNumber(comp.square_feet)}</div>
                          <div><strong>Price / Sq Ft:</strong> {comp.price_per_sqft ? formatCurrency(comp.price_per_sqft) : "Not available"}</div>
                          <div><strong>Source:</strong> {comp.source_name || "Unknown source"}</div>
                          <div><strong>Similarity:</strong> {formatScore(comp.raw_payload?.similarity_score)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No comparable sales yet" description="Comparable sales will appear here after a virtual valuation run saves comp data for this property." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: documentRailLayout, gap: "18px" }}>
            <SectionCard title="Property Documents">
              {bundle.propertyDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.propertyDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", ...wrapTextStyle }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Property document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getPropertyDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Generic Asset Document:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No property documents yet" description="Property-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>

            <SectionCard title="Property Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px", minWidth: 0 }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: isMobile ? "16px" : "20px", background: "#f8fafc", minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop property documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload deeds, tax bills, assessments, HOA statements, title references, leases, and related property documents into this record. The original file is saved as a generic asset document and then linked into the property module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                    Select Property Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={baseSelectStyle}>
                  {PROPERTY_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={baseInputStyle} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ ...baseInputStyle, resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, ...(actionButtonLayoutStyle || {}) }}>
                  {uploading ? "Uploading Property Documents..." : "Upload Property Documents"}
                </button>
                {uploadError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{uploadError}</div> : null}
              </form>

              <div style={{ marginTop: "16px" }}>
                {uploadQueue.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {uploadQueue.map((item) => (
                      <div key={item.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", ...wrapTextStyle }}>{item.file.name}</div>
                        <div style={{ marginTop: "4px", color: "#64748b" }}>
                          {uploadForm.document_class_key}
                          {uploadForm.document_date ? ` | ${uploadForm.document_date}` : ""}
                        </div>
                        <div style={{ marginTop: "8px", color: "#475569" }}>
                          Status: {item.status}
                          {item.duplicate ? " | Existing generic upload reused" : ""}
                          {item.storagePath ? ` | ${item.storagePath}` : ""}
                        </div>
                        {item.errorSummary ? <div style={{ marginTop: "6px", color: "#991b1b" }}>{item.errorSummary}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No property files queued" description="Add one or more property documents to create linked generic and property-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualColumnLayout, gap: "18px" }}>
            <SectionCard title="Property Snapshots">
              {bundle.propertySnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.propertySnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "property_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No property snapshots yet" description="Property snapshots will land here after later property parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Property Analytics">
              {bundle.propertyAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.propertyAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "property_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No property analytics yet" description="Property intelligence will appear here after future parsing and review passes are added." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualColumnLayout, gap: "18px" }}>
            <SectionCard title="Linked Portals">
              {assetBundle?.portalLinks?.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {assetBundle.portalLinks.map((link) => {
                    const portal = link.portal_profiles || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", ...wrapTextStyle }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{portal.portal_name || "Linked portal"}</div>
                        <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                          <div><strong>Institution:</strong> {portal.institution_name || "Limited visibility"}</div>
                          <div><strong>Recovery Hint:</strong> {portal.recovery_contact_hint || "Limited visibility"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when county, tax, mortgage, or homeowners access continuity is mapped." />
              )}
            </SectionCard>

            <SectionCard title="Notes / Tasks / Alerts">
              {assetBundle ? (
                <AIInsightPanel
                  title="Platform Linkage"
                  summary="This property record can inherit shared continuity context from the linked platform asset without collapsing property-specific data into generic tables."
                  bullets={[
                    `Generic asset documents linked: ${assetBundle.documents?.length || 0}`,
                    `Asset alerts linked: ${assetBundle.alerts?.length || 0}`,
                    `Asset tasks linked: ${assetBundle.tasks?.length || 0}`,
                  ]}
                />
              ) : (
                <EmptyState title="Shared platform context pending" description="Alerts, tasks, notes, and broader continuity context will surface here through the linked generic asset record." />
              )}
            </SectionCard>
          </div>

          {import.meta.env.DEV ? (
            <SectionCard title="Property Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                property_id={property.id} | asset_id={linkedAsset?.id || "none"} | household_id={property.household_id || "none"} | documents={bundle.propertyDocuments.length} | snapshots={bundle.propertySnapshots.length} | analytics={bundle.propertyAnalytics.length} | linkedMortgageIds={linkedMortgages.map((item) => item.linkage?.id || item.id).join(", ") || "none"} | linkedMortgageTypes={linkedMortgages.map((item) => item.linkage?.link_type).join(", ") || "none"} | linkedMortgagePrimary={linkedMortgages.map((item) => String(Boolean(item.linkage?.is_primary))).join(", ") || "none"} | linkedHomeownersIds={linkedHomeownersPolicies.map((item) => item.linkage?.id || item.id).join(", ") || "none"} | linkedHomeownersTypes={linkedHomeownersPolicies.map((item) => item.linkage?.link_type).join(", ") || "none"} | linkedHomeownersPrimary={linkedHomeownersPolicies.map((item) => String(Boolean(item.linkage?.is_primary))).join(", ") || "none"} | linkageStatus={propertyStackLinkageStatus} | stackAnalyticsId={propertyStackAnalytics?.id || "none"} | stackCompleteness={propertyStackAnalytics?.completeness_score ?? "none"} | stackContinuity={propertyStackAnalytics?.continuity_status || "none"} | latestValuationId={latestPropertyValuation?.id || "none"} | valuationStatus={latestPropertyValuation?.valuation_status || "none"} | valuationMidpoint={latestPropertyValuation?.midpoint_estimate ?? "none"} | valuationConfidenceScore={latestPropertyValuation?.confidence_score ?? "none"} | valuationConfidenceLabel={latestPropertyValuation?.confidence_label || "none"} | valuationCompsCount={latestPropertyValuation?.comps_count ?? 0} | valuationCompOrigin={compDataOrigin} | valuationProviderMode={providerMode} | valuationProviderKey={latestPropertyValuation?.metadata?.provider_key || "none"} | valuationSources={(latestPropertyValuation?.source_summary || []).map((item) => item.source_name).join(", ") || "none"} | valuationChangeStatus={valuationChangeSummary.change_status || "none"} | valuationChangeSummary={valuationChangeSummary.summary || "none"} | valuationChangeBullets={(valuationChangeSummary.bullets || []).join(", ") || "none"} | equityMidpoint={propertyEquityPosition?.estimated_equity_midpoint ?? "none"} | equityLtv={propertyEquityPosition?.estimated_ltv ?? "none"} | equityVisibility={propertyEquityPosition?.equity_visibility_status || "none"} | valuationAvailable={propertyEquityPosition?.valuation_available ? "yes" : "no"} | valuationReviewFlags={propertyEquityPosition?.review_flags?.join(", ") || "none"} | stackFlags={propertyStackAnalytics?.review_flags?.join(", ") || "none"} | stackPrompts={propertyStackAnalytics?.prompts?.join(", ") || "none"} | stackUpdatedAt={propertyStackAnalytics?.updated_at || "none"} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | propertyDocumentIds={uploadQueue.map((item) => item.propertyDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | supabaseClientAvailable={supabaseDiagnostics.clientAvailable ? "yes" : "no"} | supabaseMissingKeys={supabaseDiagnostics.missing.join(", ") || "none"} | error={loadError || uploadError || linkError || analyticsError || factsError || valuationError || "none"}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
