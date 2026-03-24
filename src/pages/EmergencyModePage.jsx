import { useEffect, useMemo, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import ContactCard from "../components/shared/ContactCard";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import ExportModal from "../components/shared/ExportModal";
import NotesPanel from "../components/shared/NotesPanel";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import StatusBadge from "../components/shared/StatusBadge";
import { buildHouseholdIntelligence } from "../lib/domain/platformIntelligence";
import { createAssetTask, getEmergencyModeBundle, updateHousehold } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EmergencyModePage() {
  const householdState = usePlatformHousehold();
  const [bundle, setBundle] = useState({
    household: null,
    householdMembers: [],
    emergencyContacts: [],
    keyProfessionalContacts: [],
    assets: [],
    keyDocuments: [],
    openAlerts: [],
    openTasks: [],
    reports: [],
    portals: [],
    portalReadiness: {
      portalCount: 0,
      linkedPortalCount: 0,
      emergencyRelevantCount: 0,
      missingRecoveryCount: 0,
      criticalAssetsWithoutLinkedPortals: [],
    },
  });
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notes, setNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  useEffect(() => {
    if (!householdState.context.householdId) {
      return;
    }

    let active = true;

    async function loadBundle() {
      setLoading(true);
      const result = await getEmergencyModeBundle(householdState.context.householdId);
      if (!active) return;

      setBundle(result.data || {
        household: null,
        householdMembers: [],
        emergencyContacts: [],
        keyProfessionalContacts: [],
        assets: [],
        keyDocuments: [],
        openAlerts: [],
        openTasks: [],
        reports: [],
        portals: [],
        portalReadiness: {
          portalCount: 0,
          linkedPortalCount: 0,
          emergencyRelevantCount: 0,
          missingRecoveryCount: 0,
          criticalAssetsWithoutLinkedPortals: [],
        },
      });
      setNotes(result.data?.household?.notes || "");
      setSaveError(result.error?.message || "");
      setLoading(false);
    }

    loadBundle();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

  const intelligence = useMemo(() => {
    const intelligenceBundle = {
      ...bundle,
      documents: bundle.keyDocuments,
      keyAssets: bundle.assets.filter((asset) =>
        ["insurance", "banking", "retirement", "estate", "property", "homeowners", "health_insurance", "auto_insurance", "mortgage", "warranty"].includes(asset.asset_category)
      ),
    };
    return buildHouseholdIntelligence(intelligenceBundle);
  }, [bundle]);

  async function handleSaveNotes() {
    if (!bundle.household?.id) return;
    const result = await updateHousehold(bundle.household.id, {
      household_name: bundle.household.household_name,
      household_status: bundle.household.household_status,
      notes,
      metadata: bundle.household.metadata || {},
    });

    if (result.error) {
      setSaveError(result.error.message || "Emergency notes could not be saved.");
      return;
    }

    setBundle((current) => ({
      ...current,
      household: result.data,
    }));
    setSaveError("");
  }

  async function handleCreateEmergencyTask(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !taskTitle.trim()) return;

    const result = await createAssetTask({
      household_id: householdState.context.householdId,
      task_type: "emergency_follow_up",
      title: taskTitle,
      description: "Created from Emergency Mode.",
      status: "open",
      metadata: { emergency_mode: true },
    });

    if (result.error) {
      setSaveError(result.error.message || "Emergency task could not be created.");
      return;
    }

    setBundle((current) => ({
      ...current,
      openTasks: [result.data, ...current.openTasks],
    }));
    setTaskTitle("");
    setSaveError("");
  }

  const prioritizedContacts = [
    ...bundle.householdMembers.filter((member) => ["spouse", "partner", "self"].includes(member.role_type)),
    ...bundle.keyProfessionalContacts.filter((contact) =>
      ["executor", "trustee", "attorney", "advisor", "CPA", "insurance_agent", "institution"].includes(contact.contact_type)
    ),
  ].filter(
    (contact, index, array) =>
      index === array.findIndex((item) => item.id === contact.id || item.full_name === contact.full_name)
  );

  const keyAssets = bundle.assets
    .filter((asset) =>
      ["insurance", "banking", "retirement", "estate", "property"].includes(asset.asset_category)
    )
    .slice(0, 10);

  const documentRows = bundle.keyDocuments.map((document) => ({
    name: document.file_name || "Unnamed document",
    role: [
      document.document_type,
      document.assets?.asset_name,
      document.assets?.asset_category,
    ]
      .filter(Boolean)
      .join(" | "),
    status: document.processing_status || "uploaded",
    updatedAt: formatDate(document.created_at),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Emergency Mode"
        title="Emergency Continuity Mode"
        description="Live household continuity view using the current working household, contacts, assets, documents, alerts, tasks, and reports."
      />

      <SummaryPanel
        items={[
          { label: "Household", value: bundle.household?.household_name || householdState.household?.household_name || "Loading", helper: "Current household context" },
          { label: "Members", value: bundle.householdMembers.length, helper: "Household members on record" },
          { label: "Emergency Contacts", value: bundle.emergencyContacts.length, helper: "Family and continuity contacts" },
          { label: "Assets", value: bundle.assets.length, helper: "Tracked household assets" },
          { label: "Documents", value: bundle.keyDocuments.length, helper: "Generic vault documents" },
          { label: "Portals", value: bundle.portalReadiness.portalCount, helper: "Access continuity records" },
          { label: "Open Alerts", value: bundle.openAlerts.length, helper: "Unresolved continuity flags" },
          { label: "Open Tasks", value: bundle.openTasks.length, helper: "Pending continuity actions" },
          { label: "Doc Readiness", value: intelligence.document_completeness.score_label, helper: "Cross-module document completeness" },
          { label: "Portal Continuity", value: intelligence.portal_continuity.score_label, helper: "Linked access continuity status" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
        <SectionCard title="Emergency Readiness Summary">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <StatusBadge
              label={intelligence.emergency_readiness.score_label}
              tone={
                intelligence.emergency_readiness.score_label === "Strong"
                  ? "good"
                  : intelligence.emergency_readiness.score_label === "Moderate"
                    ? "warning"
                    : "info"
              }
            />
            <div style={{ color: "#475569" }}>
              Readiness is based on contacts, assets, documents, alerts, open tasks, and portal continuity visibility.
            </div>
          </div>
          <div style={{ marginTop: "16px", display: "grid", gap: "10px" }}>
            {intelligence.emergency_readiness.notes.map((reason) => (
              <div key={reason} style={{ color: "#475569", lineHeight: "1.6" }}>{reason}</div>
            ))}
            <div style={{ color: "#475569", lineHeight: "1.6" }}>
              {intelligence.portal_continuity.notes[0] || "Portal continuity notes are not yet available."}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Missing Item Prompts">
          {intelligence.missing_item_prompts.length > 0 ? (
            <NotesPanel notes={intelligence.missing_item_prompts} />
          ) : (
            <EmptyState
              title="No major gaps flagged"
              description="Current emergency continuity inputs are reasonably populated for a first-pass household view."
            />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
        <SectionCard title="Document Completeness">
          <AIInsightPanel
            title={intelligence.document_completeness.score_label}
            summary={intelligence.document_completeness.notes[0] || "Document completeness notes are not yet available."}
            bullets={intelligence.document_completeness.notes.slice(1, 4)}
          />
        </SectionCard>

        <SectionCard title="Portal Continuity">
          <AIInsightPanel
            title={intelligence.portal_continuity.score_label}
            summary={intelligence.portal_continuity.notes[0] || "Portal continuity notes are not yet available."}
            bullets={[
              `Linked portals: ${intelligence.portal_continuity.linked_portal_count}`,
              `Emergency-relevant portals: ${intelligence.portal_continuity.emergency_relevant_portal_count}`,
              `Portals missing recovery hints: ${intelligence.portal_continuity.missing_recovery_count}`,
            ]}
          />
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
        <SectionCard title="Key Contacts">
          {prioritizedContacts.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {prioritizedContacts.slice(0, 8).map((contact) => (
                <ContactCard
                  key={contact.id || contact.full_name}
                  name={contact.full_name}
                  role={contact.role_type || contact.contact_type || "contact"}
                  details={[
                    contact.relationship_label,
                    contact.organization_name,
                    contact.email,
                    contact.phone,
                  ]
                    .filter(Boolean)
                    .join(" | ") || "No additional details available."}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No emergency contacts yet"
              description="Add household or professional contacts to improve continuity readiness."
            />
          )}
        </SectionCard>

        <SectionCard title="Key Assets">
          {keyAssets.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {keyAssets.map((asset) => (
                <div key={asset.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{asset.asset_name}</div>
                  <div style={{ marginTop: "4px", color: "#64748b" }}>
                    {asset.asset_category}
                    {asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : ""}
                  </div>
                  <div style={{ marginTop: "6px", color: "#475569" }}>
                    {asset.institution_name || "No institution"} | {asset.status}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No key assets yet"
              description="Insurance, banking, retirement, estate, or property assets will strengthen emergency continuity visibility."
            />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "18px" }}>
        <SectionCard title="Key Documents">
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState
              title="No key documents found"
              description="Generic household documents will appear here as platform records are added. Specialized life-policy documents remain in the deep insurance workflow."
            />
          )}
        </SectionCard>

        <SectionCard title="Open Alerts and Tasks">
          {bundle.openAlerts.length > 0 || bundle.openTasks.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {bundle.openAlerts.map((alert) => (
                <div key={alert.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#fff7ed", border: "1px solid #fdba74", color: "#7c2d12" }}>
                  <div style={{ fontWeight: 700 }}>{alert.title}</div>
                  <div style={{ marginTop: "4px" }}>{alert.description || alert.alert_type}</div>
                </div>
              ))}
              {bundle.openTasks.map((task) => (
                <div key={task.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{task.title}</div>
                  <div style={{ marginTop: "4px" }}>{task.description || task.task_type || "Open task"}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No open alerts or tasks"
              description="This household currently has no open platform alerts or emergency-related tasks."
            />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px" }}>
        <SectionCard title="Emergency Notes">
          <div style={{ display: "grid", gap: "12px" }}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              placeholder="Add emergency handoff notes, household instructions, access reminders, or family continuity context."
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />
            <button
              onClick={handleSaveNotes}
              disabled={!bundle.household?.id}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Save Emergency Notes
            </button>
            {saveError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{saveError}</div> : null}
          </div>
        </SectionCard>

        <SectionCard title="Emergency Follow-Up Task">
          <form onSubmit={handleCreateEmergencyTask} style={{ display: "grid", gap: "12px" }}>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Create a quick emergency follow-up task"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <button
              type="submit"
              disabled={!bundle.household?.id || !taskTitle.trim()}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Add Emergency Task
            </button>
          </form>
          <div style={{ marginTop: "18px" }}>
            <ExportModal />
          </div>
        </SectionCard>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Members: {bundle.householdMembers.length} | Emergency Contacts: {bundle.emergencyContacts.length} | Professional Contacts: {bundle.keyProfessionalContacts.length} | Assets: {bundle.assets.length} | Documents: {bundle.keyDocuments.length} | Portals: {bundle.portalReadiness.portalCount} | Alerts: {bundle.openAlerts.length} | Tasks: {bundle.openTasks.length} | docStatus={intelligence.document_completeness.score_label} | emergencyStatus={intelligence.emergency_readiness.score_label} | portalStatus={intelligence.portal_continuity.score_label} | prompts={intelligence.missing_item_prompts.length} | flags={intelligence.review_flags.join(", ") || "none"} | Error: {saveError || "none"} | Loading: {loading ? "yes" : "no"}
        </div>
      ) : null}
    </div>
  );
}
