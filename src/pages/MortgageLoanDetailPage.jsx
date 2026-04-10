import { useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  buildMortgageReviewSignals,
  getMortgageDocumentClass,
  getMortgageLender,
  getMortgageLoanType,
  listMortgageLenders,
} from "../lib/domain/mortgage";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getMortgageLoanBundle,
  getMortgageLinkageStatus,
  linkMortgageToProperty,
  listMortgagePropertyLinks,
  listMortgageDocumentClasses,
  unlinkMortgageFromProperty,
  updatePropertyMortgageLink,
  uploadMortgageDocument,
} from "../lib/supabase/mortgageData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { listProperties } from "../lib/supabase/propertyData";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildMortgageCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const MORTGAGE_DOCUMENT_CLASSES = listMortgageDocumentClasses();
const MORTGAGE_LENDERS = listMortgageLenders();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "monthly_statement",
  lender_key: "",
  document_date: "",
  notes: "",
};

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getStatusTone(status) {
  if (status === "active" || status === "current") return "good";
  if (status === "watch" || status === "modification_review") return "warning";
  if (status === "paid_off" || status === "closed" || status === "delinquent") return "info";
  return "info";
}

export default function MortgageLoanDetailPage({ mortgageLoanId, onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [propertyLinks, setPropertyLinks] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [linkingProperty, setLinkingProperty] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [linkDraft, setLinkDraft] = useState({ link_type: "primary_financing", is_primary: true, notes: "" });
  const [savingLinkId, setSavingLinkId] = useState("");
  const [removingLinkId, setRemovingLinkId] = useState("");
  const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "mortgage_detail_page",
    }),
    [
      householdState.context.guestFallbackActive,
      householdState.context.householdId,
      householdState.context.ownershipMode,
      shellDebug.authUserId,
    ]
  );
  const scopeKey = `${platformScope.authUserId || "guest"}:${platformScope.householdId || "none"}:${platformScope.ownershipMode}`;

  async function loadMortgageBundle(targetMortgageLoanId, options = {}) {
    const result = await getMortgageLoanBundle(targetMortgageLoanId, platformScope);
    if (result.error || !result.data?.mortgageLoan) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Mortgage loan bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Mortgage loan bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");
    if (!options.silent) setLinkError("");

    const linkedAssetId = result.data.mortgageLoan.assets?.id;
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

    if (result.data.mortgageLoan?.id) {
      const propertyLinksResult = await listMortgagePropertyLinks(result.data.mortgageLoan.id);
      setPropertyLinks(propertyLinksResult.data || []);
      if (!options.silent && propertyLinksResult.error) {
        setLinkError(propertyLinksResult.error.message || "");
      }
    }

    if (result.data.mortgageLoan?.household_id) {
      const propertiesResult = await listProperties(
        platformScope.householdId || result.data.mortgageLoan.household_id
      );
      setAvailableProperties(propertiesResult.data || []);
      if (!options.silent && propertiesResult.error) {
        setLinkError(propertiesResult.error.message || "");
      }
    }

    return { data: result.data, error: null };
  }

  useEffect(() => {
    if (!mortgageLoanId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadMortgageBundle(mortgageLoanId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [mortgageLoanId, scopeKey]);

  useEffect(() => {
    setBundle(null);
    setAssetBundle(null);
    setPropertyLinks([]);
    setAvailableProperties([]);
    setLoadError("");
    setLinkError("");
    setLinkSuccess("");
  }, [scopeKey]);

  const mortgageLoan = bundle?.mortgageLoan || null;
  const mortgageLoanType = mortgageLoan
    ? getMortgageLoanType(mortgageLoan.mortgage_loan_type_key)
    : null;
  const linkedAsset = mortgageLoan?.assets || null;
  const linkageStatus = getMortgageLinkageStatus({
    linkedProperties: propertyLinks,
  });
  const mortgageReview = useMemo(
    () =>
      buildMortgageReviewSignals({
        mortgageLoan,
        documents: bundle?.mortgageDocuments || [],
        propertyLinks,
        snapshots: bundle?.mortgageSnapshots || [],
      }),
    [bundle?.mortgageDocuments, bundle?.mortgageSnapshots, mortgageLoan, propertyLinks]
  );
  const mortgageCommandCenter = useMemo(
    () =>
      buildMortgageCommandCenter({
        mortgageLoan,
        mortgageReview,
        mortgageDocuments: bundle?.mortgageDocuments || [],
        mortgageSnapshots: bundle?.mortgageSnapshots || [],
        mortgageAnalytics: bundle?.mortgageAnalytics || [],
        propertyLinks,
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.mortgageAnalytics,
      bundle?.mortgageDocuments,
      bundle?.mortgageSnapshots,
      mortgageLoan,
      mortgageReview,
      propertyLinks,
    ]
  );

  const summaryItems = useMemo(() => {
    if (!mortgageLoan) return [];
    return [
      { label: "Loan Status", value: mortgageLoan.current_status || "unknown", helper: mortgageLoanType?.display_name || "Mortgage" },
      { label: "Documents", value: bundle?.mortgageDocuments?.length || 0, helper: "Mortgage-specific document records" },
      { label: "Snapshots", value: bundle?.mortgageSnapshots?.length || 0, helper: "Normalized mortgage records" },
      { label: "Analytics", value: bundle?.mortgageAnalytics?.length || 0, helper: "Future mortgage review outputs" },
      { label: "Review Status", value: mortgageReview.readinessStatus || "unknown", helper: mortgageReview.metrics?.documentSupport || "limited support" },
    ];
  }, [bundle, mortgageLoan, mortgageLoanType, mortgageReview]);
  const detailRailLayout = isTablet ? "1fr" : "1.2fr 1fr";
  const propertyRailLayout = isTablet ? "1fr" : "1.1fr 1fr";
  const documentRailLayout = isTablet ? "1fr" : "1.15fr 1fr";
  const dualLayout = isTablet ? "1fr" : "1fr 1fr";

  function enqueueFiles(fileList) {
    const entries = Array.from(fileList || []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "queued",
      assetDocumentId: null,
      mortgageDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!mortgageLoan || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadMortgageDocument({
        household_id: mortgageLoan.household_id,
        asset_id: linkedAsset.id,
        mortgage_loan_id: mortgageLoan.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        lender_key: uploadForm.lender_key || mortgageLoan.lender_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { mortgage_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                mortgageDocumentId: result.data?.mortgageDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Mortgage upload failed.");
        continue;
      }

      await loadMortgageBundle(mortgageLoan.id, { silent: true });
    }

    setUploading(false);
  }

  async function handleLinkProperty(event) {
    event.preventDefault();
    if (!mortgageLoan?.id || !selectedPropertyId) return;

    setLinkingProperty(true);
    setLinkError("");
    setLinkSuccess("");
    const result = await linkMortgageToProperty(selectedPropertyId, mortgageLoan.id, {
      link_type: propertyLinks.length === 0 ? "primary_financing" : "secondary_financing",
      is_primary: propertyLinks.length === 0,
      metadata: { linked_from: "mortgage_detail" },
      scopeOverride: platformScope,
    });

    if (result.error) {
      setLinkError(result.error.message || "Property link could not be created.");
      setLinkingProperty(false);
      return;
    }

    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setSelectedPropertyId("");
    setLinkSuccess("Property link saved.");
    setLinkingProperty(false);
  }

  function beginEditLink(link) {
    setEditingLinkId(link.id);
    setLinkDraft({
      link_type: link.link_type || "primary_financing",
      is_primary: Boolean(link.is_primary),
      notes: link.notes || "",
    });
    setLinkError("");
    setLinkSuccess("");
  }

  async function handleSaveLink(linkId) {
    if (!mortgageLoan?.id || !linkId) return;
    setSavingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await updatePropertyMortgageLink(linkId, {
      ...linkDraft,
      scopeOverride: platformScope,
    });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be updated.");
      setSavingLinkId("");
      return;
    }
    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setEditingLinkId("");
    setLinkSuccess("Property link updated.");
    setSavingLinkId("");
  }

  async function handleRemoveLink(linkId) {
    if (!mortgageLoan?.id || !linkId || !window.confirm("Remove this property link from the mortgage?")) return;
    setRemovingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await unlinkMortgageFromProperty(linkId, { scopeOverride: platformScope });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be removed.");
      setRemovingLinkId("");
      return;
    }
    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setLinkSuccess("Property link removed.");
    setRemovingLinkId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title={mortgageLoan?.loan_name || linkedAsset?.asset_name || "Mortgage Loan Detail"}
        description="Live mortgage bundle view backed by mortgage loans, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/mortgage")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Mortgage Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard><div style={{ color: "#64748b" }}>Loading mortgage loan bundle...</div></SectionCard>
      ) : !mortgageLoan ? (
        <EmptyState title="Mortgage loan not found" description={loadError || "This mortgage detail page could not load a matching loan record."} />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={mortgageLoanType?.display_name || mortgageLoan.mortgage_loan_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Mortgage Command"
              subtitle="The strongest loan blockers, why they matter, and what to do next on this mortgage."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Debt Command"
                  summary={mortgageCommandCenter.headline}
                  bullets={[
                    `${mortgageCommandCenter.metrics.critical || 0} critical blocker${mortgageCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${mortgageCommandCenter.metrics.warning || 0} warning item${mortgageCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${mortgageCommandCenter.metrics.documents || 0} mortgage document${mortgageCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${mortgageCommandCenter.metrics.snapshots || 0} snapshot${mortgageCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${mortgageCommandCenter.metrics.analytics || 0} analytic${mortgageCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {mortgageCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {mortgageCommandCenter.blockers.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          padding: "16px",
                          borderRadius: "14px",
                          background: item.urgencyMeta.background,
                          border: item.urgencyMeta.border,
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : "warning"} />
                            <StatusBadge label={item.staleLabel} tone="info" />
                          </div>
                        </div>
                        <div style={{ color: "#0f172a", lineHeight: "1.7" }}>
                          <strong>Blocker:</strong> {item.blocker}
                        </div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>
                          <strong>Consequence:</strong> {item.consequence}
                        </div>
                        <div style={{ color: item.urgencyMeta.accent, fontWeight: 700, lineHeight: "1.7" }}>
                          Next action: {item.nextAction}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No active mortgage blockers"
                    description="This mortgage currently looks relatively steady across evidence, linkage, debt review, and continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: detailRailLayout, gap: "18px" }}>
            <SectionCard title="Mortgage Loan Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Loan Name:</strong> {mortgageLoan.loan_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Loan Type:</strong> {mortgageLoanType?.display_name || mortgageLoan.mortgage_loan_type_key}</div>
                <div><strong>Lender / Servicer:</strong> {getMortgageLender(mortgageLoan.lender_key)?.display_name || mortgageLoan.lender_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Property Address:</strong> {mortgageLoan.property_address || "Limited visibility"}</div>
                <div><strong>Borrower:</strong> {mortgageLoan.borrower_name || "Limited visibility"}</div>
                <div><strong>Origination:</strong> {formatDate(mortgageLoan.origination_date)}</div>
                <div><strong>Maturity:</strong> {formatDate(mortgageLoan.maturity_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={mortgageLoan.current_status || "unknown"} tone={getStatusTone(mortgageLoan.current_status)} /></div>
              </div>
            </SectionCard>

            <SectionCard title="Linked Platform Asset Summary">
              {linkedAsset ? (
                <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                  <div><strong>Asset Name:</strong> {linkedAsset.asset_name}</div>
                  <div><strong>Category:</strong> {linkedAsset.asset_category}</div>
                  <div><strong>Subcategory:</strong> {linkedAsset.asset_subcategory || "Limited visibility"}</div>
                  <div><strong>Institution:</strong> {linkedAsset.institution_name || "Limited visibility"}</div>
                  <div><strong>Status:</strong> {linkedAsset.status || "Limited visibility"}</div>
                  <div style={{ color: "#64748b" }}>
                    This mortgage record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked household summary" description="This mortgage loan is not yet connected to a broader household asset summary." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: propertyRailLayout, gap: "18px" }}>
            <SectionCard
              title="Mortgage Review Signals"
              subtitle="A practical first-pass debt review based on loan timing, document support, payoff readiness, and property linkage."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.28)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {mortgageReview.headline}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Review Status</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{mortgageReview.readinessStatus}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{Math.round((mortgageReview.confidence || 0) * 100)}%</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Refinance Review</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.refinanceStatus || "limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payoff Readiness</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.payoffStatus || "limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Years Since Origination</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.yearsSinceOrigination ?? "Limited visibility"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Years To Maturity</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.yearsToMaturity ?? "Limited visibility"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.monthlyPaymentVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rate Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.interestRateVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Escrow Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.escrowVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Amortization Support</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.amortizationSupport || "limited"}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Review Notes</div>
                  {mortgageReview.notes?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                      {mortgageReview.notes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#475569" }}>No additional mortgage review notes are visible yet.</div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Debt Review Snapshot">
              <AIInsightPanel
                title="Current Mortgage Read"
                summary={mortgageReview.headline}
                bullets={[
                  `Document support: ${mortgageReview.metrics?.documentSupport || "limited"}`,
                  `Parsed snapshots: ${mortgageReview.metrics?.snapshotCount || 0}`,
                  `Property links visible: ${mortgageReview.metrics?.propertyLinkCount || 0}`,
                  `Refinance review: ${mortgageReview.metrics?.refinanceStatus || "limited"}`,
                  `Payoff readiness: ${mortgageReview.metrics?.payoffStatus || "limited"}`,
                ]}
              />
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px" }}>
            <SectionCard title="Linked Property">
              {propertyLinks.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {propertyLinks.map((link) => {
                    const propertyRecord = link.properties || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{propertyRecord.property_name || propertyRecord.assets?.asset_name || propertyRecord.property_address || "Property"}</div>
                            <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                              <div><strong>Address:</strong> {propertyRecord.property_address || "Limited visibility"}</div>
                            <div><strong>Status:</strong> {propertyRecord.property_status || "Limited visibility"}</div>
                            <div><strong>Link Type:</strong> {link.link_type || "primary_financing"}</div>
                            <div><strong>Primary:</strong> {link.is_primary ? "Yes" : "No"}</div>
                            <div><strong>Notes:</strong> {link.notes || "None"}</div>
                          </div>
                        </div>
                          <div style={{ display: "grid", gap: "8px" }}>
                            <button onClick={() => onNavigate(`/property/detail/${propertyRecord.id}`)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                              Open Property
                            </button>
                            <button onClick={() => beginEditLink(link)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                              Edit Link
                            </button>
                            <button onClick={() => handleRemoveLink(link.id)} disabled={removingLinkId === link.id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 700, color: "#991b1b" }}>
                              {removingLinkId === link.id ? "Removing..." : "Remove Link"}
                            </button>
                          </div>
                        </div>
                        {editingLinkId === link.id ? (
                          <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                            <select value={linkDraft.link_type} onChange={(event) => setLinkDraft((current) => ({ ...current, link_type: event.target.value }))} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                              <option value="primary_financing">primary_financing</option>
                              <option value="secondary_financing">secondary_financing</option>
                              <option value="heloc">heloc</option>
                              <option value="historical_reference">historical_reference</option>
                              <option value="other">other</option>
                            </select>
                            <label style={{ color: "#475569", display: "flex", gap: "8px", alignItems: "center" }}>
                              <input type="checkbox" checked={linkDraft.is_primary} onChange={(event) => setLinkDraft((current) => ({ ...current, is_primary: event.target.checked }))} />
                              Primary property link
                            </label>
                            <textarea value={linkDraft.notes} onChange={(event) => setLinkDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Link notes" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              <button onClick={() => handleSaveLink(link.id)} disabled={savingLinkId === link.id} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                                {savingLinkId === link.id ? "Saving..." : "Save Link"}
                              </button>
                              <button onClick={() => setEditingLinkId("")} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No linked property yet" description="Link a property record to make the mortgage relationship visible in the property stack." />
              )}
            </SectionCard>

            <SectionCard title="Link Existing Property">
              <form onSubmit={handleLinkProperty} style={{ display: "grid", gap: "12px" }}>
                <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">Select household property</option>
                  {availableProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.property_name || property.property_address || property.assets?.asset_name || property.id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={linkingProperty || !selectedPropertyId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {linkingProperty ? "Linking Property..." : "Link Property"}
                </button>
                <AIInsightPanel
                  title="Property Stack Status"
                  summary={`Current linkage status: ${linkageStatus}`}
                  bullets={[
                    propertyLinks.length > 0
                      ? "This mortgage is already visible in the property stack."
                      : "This mortgage is not yet linked to a property record.",
                  ]}
                />
                {linkSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{linkSuccess}</div> : null}
                {linkError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{linkError}</div> : null}
              </form>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: documentRailLayout, gap: "18px" }}>
            <SectionCard title="Mortgage Documents">
              {bundle.mortgageDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Mortgage document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getMortgageDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Lender:</strong> {getMortgageLender(document.lender_key)?.display_name || document.lender_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage documents yet" description="Mortgage-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>

            <SectionCard title="Mortgage Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop mortgage documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload monthly statements, escrow notices, payoff letters, closing disclosures, and related mortgage documents into this loan. The original file is saved in the household vault and then linked into the mortgage module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Mortgage Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {MORTGAGE_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.lender_key} onChange={(event) => setUploadForm((current) => ({ ...current, lender_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No lender selected</option>
                  {MORTGAGE_LENDERS.map((lender) => (
                    <option key={lender.lender_key} value={lender.lender_key}>
                      {lender.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Mortgage Documents..." : "Upload Mortgage Documents"}
                </button>
                {uploadError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{uploadError}</div> : null}
              </form>

              <div style={{ marginTop: "16px" }}>
                {uploadQueue.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {uploadQueue.map((item) => (
                      <div key={item.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.file.name}</div>
                        <div style={{ marginTop: "4px", color: "#64748b" }}>
                          {uploadForm.document_class_key}
                          {uploadForm.lender_key ? ` | ${uploadForm.lender_key}` : ""}
                          {uploadForm.document_date ? ` | ${uploadForm.document_date}` : ""}
                        </div>
                        <div style={{ marginTop: "8px", color: "#475569" }}>
                          Status: {item.status}
                          {item.duplicate ? " | Existing household upload reused" : ""}
                          {item.storagePath ? ` | ${item.storagePath}` : ""}
                        </div>
                        {item.errorSummary ? <div style={{ marginTop: "6px", color: "#991b1b" }}>{item.errorSummary}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No mortgage files queued" description="Add one or more mortgage documents to create linked generic and mortgage-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
            <SectionCard title="Mortgage Snapshots">
              {bundle.mortgageSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "mortgage_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage snapshots yet" description="Mortgage snapshots will land here after later mortgage statement parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Mortgage Analytics">
              {bundle.mortgageAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "mortgage_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage analytics yet" description="Mortgage intelligence will appear here after future parsing and review passes are added." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
            <SectionCard title="Linked Portals">
              {assetBundle?.portalLinks?.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {assetBundle.portalLinks.map((link) => {
                    const portal = link.portal_profiles || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
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
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when lender access continuity is mapped." />
              )}
            </SectionCard>

            <SectionCard title="Notes / Tasks / Alerts">
              {assetBundle ? (
                <AIInsightPanel
                  title="Platform Linkage"
                  summary="This mortgage record can inherit shared continuity context from the linked platform asset without collapsing mortgage-specific data into generic tables."
                  bullets={[
                    `Household documents linked: ${assetBundle.documents?.length || 0}`,
                    `Asset alerts linked: ${assetBundle.alerts?.length || 0}`,
                    `Asset tasks linked: ${assetBundle.tasks?.length || 0}`,
                  ]}
                />
              ) : (
                <EmptyState title="Shared household context pending" description="Alerts, tasks, notes, and broader continuity context will appear here once this loan is linked into the broader household record." />
              )}
            </SectionCard>
          </div>

          {import.meta.env.DEV ? (
            <SectionCard title="Mortgage Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                mortgage_loan_id={mortgageLoan.id} | asset_id={linkedAsset?.id || "none"} | household_id={mortgageLoan.household_id || "none"} | propertyLinkIds={propertyLinks.map((link) => link.id).join(", ") || "none"} | propertyLinkTypes={propertyLinks.map((link) => link.link_type).join(", ") || "none"} | propertyLinkPrimary={propertyLinks.map((link) => String(Boolean(link.is_primary))).join(", ") || "none"} | linkageStatus={linkageStatus} | documents={bundle.mortgageDocuments.length} | snapshots={bundle.mortgageSnapshots.length} | analytics={bundle.mortgageAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | mortgageDocumentIds={uploadQueue.map((item) => item.mortgageDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || linkError || "none"}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
