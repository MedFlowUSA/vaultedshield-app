import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeEstateModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildEstateHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { listAssets, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

function getTone(status) {
  if (status === "Ready") return "good";
  if (status === "Building") return "warning";
  return "alert";
}

export default function EstateHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const estateCommandRef = useRef(null);
  const successorContactsRef = useRef(null);
  const [bundle, setBundle] = useState({ contacts: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setBundle({ contacts: [], assets: [] });
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      setLoading(true);
      const [contactsResult, assetsResult] = await Promise.all([
        listContacts(householdState.context.householdId),
        listAssets(householdState.context.householdId),
      ]);
      if (!active) return;
      setBundle({
        contacts: contactsResult.data || [],
        assets: assetsResult.data || [],
      });
      setLoadError(contactsResult.error?.message || assetsResult.error?.message || "");
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId, householdState.loading]);

  const readiness = useMemo(
    () => summarizeEstateModule(bundle),
    [bundle]
  );

  const successorContacts = useMemo(
    () =>
      bundle.contacts.filter((contact) =>
        ["executor", "trustee", "attorney"].includes(String(contact.contact_type || "").toLowerCase())
      ),
    [bundle.contacts]
  );
  const estateCommand = useMemo(
    () =>
      buildEstateHubCommand({
        contacts: bundle.contacts,
        assets: bundle.assets,
        readiness,
      }),
    [bundle.assets, bundle.contacts, readiness]
  );
  const estatePlainLanguageGuide = useMemo(() => {
    const topCommand = estateCommand.rows[0] || null;

    return {
      title: "Make the handoff plan understandable before it feels legal",
      summary:
        successorContacts.length === 0
          ? "You do not need a full estate binder to start here. A few trusted successor contacts already make this page more useful."
          : readiness.headline,
      transition:
        successorContacts.length === 0
          ? "This hub is meant to answer the human questions first: who steps in, who should be reachable, and whether the household handoff would feel confusing in an emergency."
          : "This hub should make estate readiness feel readable before you ever need to think in legal-document terms.",
      quickFacts: [
        `${successorContacts.length} successor contact${successorContacts.length === 1 ? "" : "s"} are currently visible.`,
        `${readiness.metrics.legalAssets || 0} estate or legal asset shell${readiness.metrics.legalAssets === 1 ? "" : "s"} are on record.`,
        topCommand ? `Best next move: ${topCommand.nextAction}.` : "Best next move: add successor contacts or review emergency mode.",
      ],
      cards: [
        {
          label: "What This Page Does",
          value: "Shows whether a household handoff would feel clear or confusing",
          detail: "It is about successor readiness, not just whether legal files exist somewhere.",
        },
        {
          label: "Best First Step",
          value: topCommand?.title || "Add successor contacts",
          detail:
            topCommand?.blocker ||
            "The biggest wins usually come from making trustees, executors, attorneys, and family handoff contacts visible.",
        },
        {
          label: "What Can Wait",
          value: "Perfect legal indexing and document depth",
          detail: "The first goal is making the people and responsibilities clear. The deeper legal structure can be layered in after that.",
        },
      ],
    };
  }, [estateCommand, readiness, successorContacts.length]);

  function scrollToEstateCommand() {
    estateCommandRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToSuccessorContacts() {
    successorContactsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const estateHeroScore = Math.round(
    readiness.status === "Ready"
      ? 84
      : readiness.status === "Building"
        ? 62
        : successorContacts.length > 0
          ? 48
          : 34
  );
  const estateHeroTone =
    estateHeroScore >= 80 ? "good" : estateHeroScore >= 60 ? "info" : estateHeroScore >= 45 ? "warning" : "alert";
  const estateHeroGlanceItems = [
    { label: "Status", value: readiness.status },
    { label: "Successor Contacts", value: readiness.metrics.successorContacts },
    { label: "Family Contacts", value: readiness.metrics.familyContacts },
    { label: "Legal Asset Shells", value: readiness.metrics.legalAssets },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <FriendlyPageHero
        eyebrow="Estate and Legal"
        sectionTitle="Estate Hub"
        headline={estatePlainLanguageGuide.title}
        summary={estatePlainLanguageGuide.summary}
        transition={estatePlainLanguageGuide.transition}
        actions={[
          {
            label: "Review Contacts",
            onClick: () => onNavigate?.("/contacts"),
            kind: "primary",
          },
          {
            label: "Emergency Mode",
            onClick: () => onNavigate?.("/emergency"),
          },
          {
            label: successorContacts.length > 0 ? "See Successor Contacts" : "Open Estate Command",
            onClick: successorContacts.length > 0 ? scrollToSuccessorContacts : scrollToEstateCommand,
          },
        ]}
        score={estateHeroScore}
        scoreTone={estateHeroTone}
        scoreSubtitle="readiness"
        scoreIconLabel="estate"
        asideHeadline={readiness.status}
        asideSummary={readiness.headline}
        glanceEyebrow="At A Glance"
        glanceItems={estateHeroGlanceItems}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Handoff Read"
          title={estatePlainLanguageGuide.cards[0]?.value || "Successor readiness is still building"}
          detail={estatePlainLanguageGuide.cards[0]?.detail || readiness.headline}
          metric={`${successorContacts.length} successor contact${successorContacts.length === 1 ? "" : "s"}`}
          tone={estateHeroTone}
          statusLabel="Simple Read"
          actionLabel="Open Command"
          onAction={scrollToEstateCommand}
        />
        <FriendlyActionTile
          kicker="Best First Step"
          title={estatePlainLanguageGuide.cards[1]?.value || "Add successor contacts"}
          detail={estatePlainLanguageGuide.cards[1]?.detail || "The biggest wins come from making handoff people visible."}
          metric={`${estateCommand.metrics.attention || 0} active prompt${estateCommand.metrics.attention === 1 ? "" : "s"}`}
          tone="warning"
          statusLabel="Guided Focus"
          actionLabel="Review Contacts"
          onAction={() => onNavigate?.("/contacts")}
        />
        <FriendlyActionTile
          kicker="What Can Wait"
          title={estatePlainLanguageGuide.cards[2]?.value || "Legal indexing can come later"}
          detail={estatePlainLanguageGuide.cards[2]?.detail || "The first goal is making the people and responsibilities clear."}
          metric={`${readiness.metrics.legalAssets || 0} legal shell${readiness.metrics.legalAssets === 1 ? "" : "s"}`}
          tone="info"
          statusLabel="Building"
          actionLabel="See Contacts"
          onAction={scrollToSuccessorContacts}
        />
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Successor Readiness">
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

        <SectionCard title="What Estate Should Cover">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div>Visible successor roles like trustee, executor, and attorney.</div>
            <div>Clear family continuity contacts for emergencies and handoff.</div>
            <div>Legal-document indexing once wills, trusts, and powers are uploaded.</div>
          </div>
        </SectionCard>
      </div>

      <div ref={estateCommandRef} style={{ marginTop: "24px" }}>
        <SectionCard
          title="Estate Command Center"
          subtitle="The strongest current successor, legal, and handoff blockers across the household estate layer."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{estateCommand.headline}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: "Successors", value: estateCommand.metrics.successorContacts },
                  { label: "Family", value: estateCommand.metrics.familyContacts },
                  { label: "Legal Shells", value: estateCommand.metrics.legalAssets },
                  { label: "Attention", value: estateCommand.metrics.attention },
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
            <div style={{ color: "#64748b", lineHeight: "1.7" }}>{estateCommand.summary}</div>

            {estateCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {estateCommand.rows.map((item) => (
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
                Estate continuity currently looks steady enough that no major successor or legal-document blockers are standing out.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div ref={successorContactsRef} style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
        <SectionCard title="Visible Successor Contacts" subtitle="Contacts already in the household record who can anchor estate and handoff workflows.">
          {loading ? (
            <div style={{ color: "#64748b" }}>Loading estate readiness...</div>
          ) : loadError ? (
            <EmptyState title="Estate context unavailable" description={loadError} />
          ) : successorContacts.length === 0 ? (
            <EmptyState
              title="No successor contacts uploaded yet"
              description="Add trustees, executors, attorneys, or family successors in Contacts to make this readiness view more actionable."
            />
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {successorContacts.map((contact) => (
                <div key={contact.id} style={{ padding: "16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{contact.full_name || "Contact"}</div>
                    <StatusBadge label={contact.contact_type || "contact"} tone="info" />
                  </div>
                  <div style={{ color: "#475569" }}>{contact.organization_name || "Organization not recorded"}</div>
                  <div style={{ color: "#64748b" }}>
                    {[contact.email, contact.phone].filter(Boolean).join(" | ") || "Direct contact details are still limited."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
