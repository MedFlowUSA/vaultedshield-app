import { useEffect, useMemo, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import ContactCard from "../components/shared/ContactCard";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import ExportModal from "../components/shared/ExportModal";
import NotesPanel from "../components/shared/NotesPanel";
import StatusBadge from "../components/shared/StatusBadge";
import { buildHouseholdIntelligence } from "../lib/domain/platformIntelligence";
import { createAssetTask, getEmergencyModeBundle, updateHousehold } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  if (tone === "alert") return { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

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
  const isTablet = false;
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
  const summaryRailLayout = isTablet ? "1fr" : "minmax(0, 1.15fr) minmax(0, 1fr)";
  const dualLayout = isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const documentRailLayout = isTablet ? "1fr" : "minmax(0, 1.25fr) minmax(0, 1fr)";
  const notesRailLayout = isTablet ? "1fr" : "minmax(0, 1.1fr) minmax(0, 1fr)";
  const emergencyHeroScore =
    intelligence.emergency_readiness.score_label === "Strong"
      ? 84
      : intelligence.emergency_readiness.score_label === "Moderate"
        ? 62
        : intelligence.emergency_readiness.score_label === "Needs Attention"
          ? 38
          : 52;
  const emergencyHeroTone =
    emergencyHeroScore >= 80 ? "good" : emergencyHeroScore >= 60 ? "info" : emergencyHeroScore >= 45 ? "warning" : "alert";
  const emergencyHeroGlanceItems = [
    { label: "Household", value: bundle.household?.household_name || householdState.household?.household_name || "Loading" },
    { label: "Emergency Contacts", value: bundle.emergencyContacts.length },
    { label: "Key Documents", value: bundle.keyDocuments.length },
    { label: "Open Tasks", value: bundle.openTasks.length },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #881337 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Emergency Mode
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>Emergency Continuity Mode</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>
              {intelligence.emergency_readiness.notes[0] || "This view combines contacts, key assets, documents, portal continuity, and open work into one emergency read."}
            </div>
          </div>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "grid",
              gap: "4px",
              textAlign: "center",
              minWidth: "100px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#fca5a5" }}>{emergencyHeroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>continuity</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: "10px" }}>
          {emergencyHeroGlanceItems.map((item) => (
            <div key={item.label} style={{ padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "2px" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => document.querySelector('[data-emergency-notes="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#be123c", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Review Emergency Notes
          </button>
          <button
            type="button"
            onClick={() => document.querySelector('[data-emergency-contacts="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Key Contacts
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Simple Read",
            title: intelligence.emergency_readiness.score_label === "Strong" ? "Emergency handoff looks usable" : "Emergency handoff still needs support",
            detail: intelligence.emergency_readiness.notes[0] || "This read is based on the current household contacts, records, and open continuity work.",
            metric: intelligence.emergency_readiness.score_label,
            tone: emergencyHeroTone,
            statusLabel: "Simple Read",
            actionLabel: "See Contacts",
            onAction: () => document.querySelector('[data-emergency-contacts="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Best First Step",
            title: "Clear the biggest missing continuity blocker",
            detail: intelligence.missing_item_prompts[0] || "Use the key contacts, documents, and portal gaps below to strengthen the emergency picture.",
            metric: `${bundle.openTasks.length} open`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Open Notes",
            onAction: () => document.querySelector('[data-emergency-notes="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "What Can Wait",
            title: "Deeper review can follow after the first handoff",
            detail: "The most important goal is making the household understandable in a stressful moment. Additional optimization can come afterward.",
            metric: `${bundle.portalReadiness.portalCount} portals`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "See Documents",
            onAction: () => document.querySelector('[data-emergency-documents="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px", alignContent: "start" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={tile.onAction} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: summaryRailLayout, gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Emergency Readiness Summary</div>
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
          <div style={{ display: "grid", gap: "10px" }}>
            {intelligence.emergency_readiness.notes.map((reason) => (
              <div key={reason} style={{ color: "#475569", lineHeight: "1.6" }}>{reason}</div>
            ))}
            <div style={{ color: "#475569", lineHeight: "1.6" }}>
              {intelligence.portal_continuity.notes[0] || "Portal continuity notes are not yet available."}
            </div>
          </div>
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Missing Item Prompts</div>
          {intelligence.missing_item_prompts.length > 0 ? (
            <NotesPanel notes={intelligence.missing_item_prompts} />
          ) : (
            <EmptyState
              title="No major gaps flagged"
              description="Current emergency continuity inputs are reasonably populated for a first-pass household view."
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Document Completeness</div>
          <AIInsightPanel
            title={intelligence.document_completeness.score_label}
            summary={intelligence.document_completeness.notes[0] || "Document completeness notes are not yet available."}
            bullets={intelligence.document_completeness.notes.slice(1, 4)}
          />
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Portal Continuity</div>
          <AIInsightPanel
            title={intelligence.portal_continuity.score_label}
            summary={intelligence.portal_continuity.notes[0] || "Portal continuity notes are not yet available."}
            bullets={[
              `Linked portals: ${intelligence.portal_continuity.linked_portal_count}`,
              `Emergency-relevant portals: ${intelligence.portal_continuity.emergency_relevant_portal_count}`,
              `Portals missing recovery hints: ${intelligence.portal_continuity.missing_recovery_count}`,
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
        <div data-emergency-contacts="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Key Contacts</div>
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
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Key Assets</div>
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
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: documentRailLayout, gap: "18px" }}>
        <div data-emergency-documents="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Key Documents</div>
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState
              title="No key documents found"
              description="Generic household documents will appear here as platform records are added. Specialized life-policy documents remain in the deep insurance workflow."
            />
          )}
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Open Alerts and Tasks</div>
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
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: notesRailLayout, gap: "18px" }}>
        <div data-emergency-notes="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Emergency Notes</div>
          <div style={{ display: "grid", gap: "12px" }}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              placeholder="Add emergency handoff notes, household instructions, access reminders, or family continuity context."
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={!bundle.household?.id}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Save Emergency Notes
            </button>
            {saveError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{saveError}</div> : null}
          </div>
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Emergency Follow-Up Task</div>
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
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Members: {bundle.householdMembers.length} | Emergency Contacts: {bundle.emergencyContacts.length} | Professional Contacts: {bundle.keyProfessionalContacts.length} | Assets: {bundle.assets.length} | Documents: {bundle.keyDocuments.length} | Portals: {bundle.portalReadiness.portalCount} | Alerts: {bundle.openAlerts.length} | Tasks: {bundle.openTasks.length} | docStatus={intelligence.document_completeness.score_label} | emergencyStatus={intelligence.emergency_readiness.score_label} | portalStatus={intelligence.portal_continuity.score_label} | prompts={intelligence.missing_item_prompts.length} | flags={intelligence.review_flags.join(", ") || "none"} | Error: {saveError || "none"} | Loading: {loading ? "yes" : "no"}
        </div>
      ) : null}
    </div>
  );
}
