import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeBankingModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildBankingHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { getPortalHubBundle, listAssets, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

const EMPTY_BANKING_BUNDLE = { assets: [], contacts: [], portalBundle: null };

function getTone(status) {
  if (status === "Ready") return "good";
  if (status === "Building") return "warning";
  return "alert";
}

export default function BankingHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const bankingCommandRef = useRef(null);
  const bankingRecordsRef = useRef(null);
  const [bundle, setBundle] = useState(EMPTY_BANKING_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      queueMicrotask(() => {
        setBundle(EMPTY_BANKING_BUNDLE);
        setLoading(false);
      });
      return;
    }

    let active = true;
    async function load() {
      setLoading(true);
      const [assetsResult, contactsResult, portalsResult] = await Promise.all([
        listAssets(householdState.context.householdId),
        listContacts(householdState.context.householdId),
        getPortalHubBundle(householdState.context.householdId),
      ]);
      if (!active) return;
      setBundle({
        assets: assetsResult.data || [],
        contacts: contactsResult.data || [],
        portalBundle: portalsResult.data || null,
      });
      setLoadError(
        assetsResult.error?.message || contactsResult.error?.message || portalsResult.error?.message || ""
      );
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId, householdState.loading]);

  const readiness = useMemo(
    () =>
      summarizeBankingModule({
        assets: bundle.assets,
        contacts: bundle.contacts,
        portals: bundle.portalBundle?.portals || [],
      }),
    [bundle.assets, bundle.contacts, bundle.portalBundle]
  );

  const bankingAssets = useMemo(
    () =>
      bundle.assets.filter((asset) =>
        String(`${asset.asset_category} ${asset.asset_subcategory} ${asset.asset_name}`)
          .toLowerCase()
          .match(/bank|cash|checking|savings|treasury|brokerage|liquidity|money market/)
      ),
    [bundle.assets]
  );
  const bankingCommand = useMemo(
    () =>
      buildBankingHubCommand({
        assets: bundle.assets,
        contacts: bundle.contacts,
        portalBundle: bundle.portalBundle,
        readiness,
      }),
    [bundle.assets, bundle.contacts, bundle.portalBundle, readiness]
  );
  const bankingPlainLanguageGuide = useMemo(() => {
    const topCommand = bankingCommand.rows[0] || null;

    return {
      title: "Make cash access feel simple before it feels operational",
      summary:
        bankingAssets.length === 0
          ? "You do not need a full banking map to get started. A few cash and access records are enough to make this page useful."
          : readiness.headline,
      transition:
        bankingAssets.length === 0
          ? "This hub is here to answer the everyday version first: where money lives, who can help access it, and whether an emergency would feel messy."
          : "This hub should help you understand the household cash picture in plain language before you open the deeper continuity and recovery details.",
      quickFacts: [
        `${bankingAssets.length} banking asset${bankingAssets.length === 1 ? "" : "s"} are currently visible.`,
        `${readiness.metrics.emergencyPortals || 0} emergency portal${readiness.metrics.emergencyPortals === 1 ? "" : "s"} are connected.`,
        topCommand ? `Best next move: ${topCommand.nextAction}.` : "Best next move: add banking records or review portals and contacts.",
      ],
      cards: [
        {
          label: "What This Page Does",
          value: "Shows whether the household could reach its money when it matters",
          detail: "It is about access, recovery, and support visibility, not just account counting.",
        },
        {
          label: "Best First Step",
          value: topCommand?.title || "Review portals and contacts",
          detail:
            topCommand?.blocker ||
            "If banking continuity feels thin, the fastest wins usually come from adding recovery details and institution contacts.",
        },
        {
          label: "What Can Wait",
          value: "Perfect categorization of every liquidity record",
          detail: "The goal is to make the household feel reachable and understandable first. The technical cleanup can follow.",
        },
      ],
    };
  }, [bankingAssets.length, bankingCommand, readiness]);

  return (
    <div>
      <PageHeader
        eyebrow="Banking and Cash"
        title="Banking Hub"
        description="Household liquidity continuity, institution access, and emergency-recovery readiness."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate?.("/portals")}
              style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              Review Portals
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("/contacts")}
              style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              Review Contacts
            </button>
          </div>
        }
      />

      <SummaryPanel
        items={[
          { label: "Status", value: readiness.status, helper: "High-level banking continuity read" },
          { label: "Banking Assets", value: readiness.metrics.bankingAssets, helper: "Cash and liquidity records in view" },
          { label: "Emergency Portals", value: readiness.metrics.emergencyPortals, helper: "Relevant access points for emergencies" },
          { label: "Institution Contacts", value: readiness.metrics.institutionContacts, helper: "Banks and advisor support contacts" },
          { label: "Missing Recovery", value: readiness.metrics.missingRecovery, helper: "Emergency portals still missing recovery hints" },
        ]}
      />

      <PlainLanguageBridge
        eyebrow="Start Here"
        title={bankingPlainLanguageGuide.title}
        summary={bankingPlainLanguageGuide.summary}
        transition={bankingPlainLanguageGuide.transition}
        quickFacts={bankingPlainLanguageGuide.quickFacts}
        cards={bankingPlainLanguageGuide.cards}
        primaryActionLabel="Review Portals"
        onPrimaryAction={() => onNavigate?.("/portals")}
        secondaryActionLabel={bankingAssets.length > 0 ? "See Banking Records" : "Open Banking Command"}
        onSecondaryAction={() =>
          (bankingAssets.length > 0 ? bankingRecordsRef.current : bankingCommandRef.current)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
        showAnalysisDivider={false}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Liquidity Continuity Read">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{readiness.headline}</div>
              <StatusBadge label={readiness.status} tone={getTone(readiness.status)} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {readiness.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="What This Module Should Do">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div>Show where household cash lives and who can help access it.</div>
            <div>Flag emergency portal recovery gaps before they become a continuity problem.</div>
            <div>Keep institution and advisor visibility close to liquidity records.</div>
          </div>
        </SectionCard>
      </div>

      <div ref={bankingCommandRef} style={{ marginTop: "24px" }}>
        <SectionCard
          title="Banking Command Center"
          subtitle="The strongest current liquidity, access, and institution-support blockers across the household banking layer."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{bankingCommand.headline}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: "Assets", value: bankingCommand.metrics.bankingAssets },
                  { label: "Emergency Portals", value: bankingCommand.metrics.emergencyPortals },
                  { label: "Contacts", value: bankingCommand.metrics.institutionContacts },
                  { label: "Attention", value: bankingCommand.metrics.attention },
                ].map((metric) => (
                  <span
                    key={metric.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {metric.label}: {metric.value}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ color: "#64748b", lineHeight: "1.7" }}>{bankingCommand.summary}</div>

            {bankingCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {bankingCommand.rows.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : item.urgency === "warning" ? "warning" : "good"} />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#64748b",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {item.staleLabel}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.blocker}</div>
                    <div style={{ color: "#64748b", lineHeight: "1.7" }}>{item.consequence}</div>
                    <div>
                      <button
                        type="button"
                        onClick={() => onNavigate?.(item.route)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                      >
                        {item.nextAction}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                Banking continuity currently looks steady enough that no major liquidity or access blockers are standing out.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div ref={bankingRecordsRef} style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
        <SectionCard title="Visible Banking Records" subtitle="Current household assets that already look relevant to cash or liquidity continuity.">
          {loading ? (
            <div style={{ color: "#64748b" }}>Loading banking readiness...</div>
          ) : loadError ? (
            <EmptyState title="Banking context unavailable" description={loadError} />
          ) : bankingAssets.length === 0 ? (
            <EmptyState
              title="No banking records uploaded yet"
              description="Add cash, checking, savings, or liquidity-related assets to make this readiness view more useful."
            />
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {bankingAssets.slice(0, 8).map((asset) => (
                <div key={asset.id} style={{ padding: "16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{asset.asset_name || "Banking asset"}</div>
                  <div style={{ color: "#475569" }}>
                    {(asset.asset_category || "Asset") + (asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : "")}
                  </div>
                  <div style={{ color: "#64748b" }}>{asset.institution_name || "Institution not yet recorded"}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
