import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeEstateModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { listAssets, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

function getTone(status) {
  if (status === "Ready") return "good";
  if (status === "Building") return "warning";
  return "alert";
}

export default function EstateHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
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

  return (
    <div>
      <PageHeader
        eyebrow="Estate and Legal"
        title="Estate Hub"
        description="Successor readiness, legal continuity, and household handoff visibility."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate?.("/contacts")}
              style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              Review Contacts
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("/emergency")}
              style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              Emergency Mode
            </button>
          </div>
        }
      />

      <SummaryPanel
        items={[
          { label: "Status", value: readiness.status, helper: "High-level estate continuity read" },
          { label: "Successor Contacts", value: readiness.metrics.successorContacts, helper: "Executor, trustee, and attorney roles" },
          { label: "Family Contacts", value: readiness.metrics.familyContacts, helper: "Core family handoff coverage" },
          { label: "Legal Asset Shells", value: readiness.metrics.legalAssets, helper: "Estate/legal records visible in platform assets" },
        ]}
      />

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

      <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
        <SectionCard title="Visible Successor Contacts" subtitle="Contacts already in the household record who can anchor estate and handoff workflows.">
          {loading ? (
            <div style={{ color: "#64748b" }}>Loading estate context...</div>
          ) : loadError ? (
            <EmptyState title="Estate context unavailable" description={loadError} />
          ) : successorContacts.length === 0 ? (
            <EmptyState
              title="No successor contacts visible yet"
              description="Add trustees, executors, attorneys, or family successors in Contacts to make this module more actionable."
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
