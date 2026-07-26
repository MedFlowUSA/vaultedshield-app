import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeEstateModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildEstateHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { listAssets, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
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

function ActionButton({ label, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: "12px",
        border: primary ? "none" : "1px solid #e2e8f0",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const ROLE_CONFIG = {
  executor: { label: "Executor", icon: "⚖️", color: { bg: "#eff6ff", text: "#1d4ed8" }, description: "Responsible for carrying out the will and settling the estate." },
  trustee: { label: "Trustee", icon: "🏛️", color: { bg: "#f5f3ff", text: "#6d28d9" }, description: "Manages trust assets on behalf of beneficiaries." },
  attorney: { label: "Attorney", icon: "📋", color: { bg: "#fdf4ff", text: "#86198f" }, description: "Legal counsel for estate documents and proceedings." },
  "power of attorney": { label: "Power of Attorney", icon: "✍️", color: { bg: "#fff7ed", text: "#c2410c" }, description: "Authorized to make legal and financial decisions on your behalf." },
  beneficiary: { label: "Beneficiary", icon: "🎯", color: { bg: "#f0fdf4", text: "#166534" }, description: "Designated to receive assets from the estate or policies." },
};

function getRoleConfig(contactType) {
  const normalized = String(contactType || "").toLowerCase();
  return ROLE_CONFIG[normalized] || { label: contactType || "Contact", icon: "👤", color: { bg: "#f8fafc", text: "#475569" }, description: "" };
}

function ReadinessCheckpoint({ icon, label, status, detail }) {
  const tone =
    status === "ready" ? "good"
    : status === "partial" ? "warning"
    : "alert";
  const pill = pillStyle(tone);
  const statusLabel = status === "ready" ? "In Place" : status === "partial" ? "Partial" : "Missing";

  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: "18px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ fontSize: "28px", lineHeight: 1 }}>{icon}</div>
        <div style={{ ...pill, padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{label}</div>
      <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function SuccessorCard({ contact }) {
  const config = getRoleConfig(contact.contact_type);
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: "18px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "14px",
              background: config.color.bg,
              display: "grid",
              placeItems: "center",
              fontSize: "22px",
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              {contact.full_name || "Contact"}
            </div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              {contact.organization_name || "Organization not recorded"}
            </div>
          </div>
        </div>
        <div
          style={{
            ...pillStyle("info"),
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {config.label}
        </div>
      </div>
      {config.description ? (
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{config.description}</div>
      ) : null}
      {contact.email || contact.phone ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {contact.email ? (
            <div style={{ ...pillStyle("neutral"), padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
              {contact.email}
            </div>
          ) : null}
          {contact.phone ? (
            <div style={{ ...pillStyle("neutral"), padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
              {contact.phone}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DocumentTracker({ documents }) {
  const docTypes = [
    { key: "will", icon: "📜", label: "Last Will and Testament", description: "Directs how assets are distributed after death." },
    { key: "trust", icon: "🏛️", label: "Trust Document", description: "Holds and manages assets for beneficiaries during and after life." },
    { key: "poa", icon: "✍️", label: "Power of Attorney", description: "Grants authority to act on your behalf legally and financially." },
    { key: "healthcare", icon: "🏥", label: "Healthcare Directive", description: "Specifies medical treatment preferences if you're incapacitated." },
    { key: "beneficiary", icon: "🎯", label: "Beneficiary Designations", description: "Updates across life policies, retirement accounts, and bank accounts." },
  ];

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {docTypes.map((doc) => {
        const hasDoc = documents.some((d) =>
          String(`${d.asset_name} ${d.asset_category} ${d.description}`)
            .toLowerCase()
            .includes(doc.key === "poa" ? "power" : doc.key)
        );
        return (
          <div
            key={doc.key}
            style={{
              padding: "14px 16px",
              borderRadius: "14px",
              background: "#f8fafc",
              border: `1px solid ${hasDoc ? "#bbf7d0" : "#e2e8f0"}`,
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div style={{ fontSize: "24px", flexShrink: 0 }}>{doc.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{doc.label}</div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.5", marginTop: "2px" }}>{doc.description}</div>
            </div>
            <div
              style={{
                ...pillStyle(hasDoc ? "good" : "neutral"),
                padding: "4px 10px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 800,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {hasDoc ? "On File" : "Not Added"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommandRow({ item, onNavigate }) {
  const urgencyTone =
    item.urgency === "critical" ? "alert"
    : item.urgency === "warning" ? "warning"
    : "neutral";
  const pill = pillStyle(urgencyTone);

  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: "18px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
        <div style={{ ...pill, padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>
          {item.urgencyMeta?.badge || item.urgency}
        </div>
      </div>
      <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.65" }}>{item.blocker}</div>
      {item.consequence ? (
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{item.consequence}</div>
      ) : null}
      <ActionButton label={item.nextAction || "Review Now"} onClick={() => onNavigate?.(item.route)} />
    </div>
  );
}

export default function EstateHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const successorContactsRef = useRef(null);
  const documentRef = useRef(null);
  const [bundle, setBundle] = useState({ contacts: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [, setLoadError] = useState("");

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
    return () => { active = false; };
  }, [householdState.context.householdId, householdState.loading]);

  const readiness = useMemo(() => summarizeEstateModule(bundle), [bundle]);

  const successorContacts = useMemo(
    () =>
      bundle.contacts.filter((contact) =>
        ["executor", "trustee", "attorney", "power of attorney", "beneficiary"].includes(
          String(contact.contact_type || "").toLowerCase()
        )
      ),
    [bundle.contacts]
  );

  const legalAssets = useMemo(
    () =>
      bundle.assets.filter((asset) =>
        String(`${asset.asset_category} ${asset.asset_subcategory} ${asset.asset_name}`)
          .toLowerCase()
          .match(/will|trust|estate|legal|power|attorney|directive|benefi/)
      ),
    [bundle.assets]
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

  const heroScore = readiness.status === "Ready" ? 84 : readiness.status === "Building" ? 62 : successorContacts.length > 0 ? 48 : 34;

  const checkpoints = useMemo(() => {
    const hasExecutor = successorContacts.some((c) =>
      ["executor", "trustee"].includes(String(c.contact_type || "").toLowerCase())
    );
    const hasLegalDocs = legalAssets.length > 0;
    const hasBeneficiary = successorContacts.some((c) =>
      String(c.contact_type || "").toLowerCase() === "beneficiary"
    );

    return [
      {
        icon: "⚖️",
        label: "Executor or trustee named",
        status: hasExecutor ? "ready" : "missing",
        detail: hasExecutor
          ? "An executor or trustee is on file — there is someone named to manage the estate handoff."
          : "No executor or trustee is recorded. Without a named person, estate settlement can be delayed, disputed, or assigned by a court.",
      },
      {
        icon: "📜",
        label: "Legal documents on file",
        status: hasLegalDocs ? "ready" : legalAssets.length === 0 ? "missing" : "partial",
        detail: hasLegalDocs
          ? `${legalAssets.length} estate or legal document shell${legalAssets.length === 1 ? "" : "s"} are in the household record.`
          : "No will, trust, or power of attorney documents are indexed here. Upload them to the vault and link them from this module.",
      },
      {
        icon: "🎯",
        label: "Beneficiary designations current",
        status: hasBeneficiary ? "partial" : "missing",
        detail: hasBeneficiary
          ? "At least one beneficiary contact is recorded. Cross-reference against life insurance policies and retirement accounts to confirm all designations are current."
          : "No beneficiary contacts are recorded. This is one of the most common estate planning gaps — beneficiary designations override a will.",
      },
    ];
  }, [successorContacts, legalAssets]);

  const readyCount = checkpoints.filter((item) => item.status === "ready").length;
  const partialCount = checkpoints.filter((item) => item.status === "partial").length;
  const scrollToSuccessorContacts = () => successorContactsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollToDocuments = () => documentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const handleTileAction = (action) => {
    if (action === "insurance") {
      onNavigate?.("/insurance");
      return;
    }
    if (action === "emergency") {
      onNavigate?.("/emergency");
      return;
    }
    scrollToSuccessorContacts();
  };

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Estate and Legal
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {successorContacts.length === 0 && legalAssets.length === 0
                ? "Name who steps in — before you ever need to think in legal terms"
                : readiness.status === "Ready"
                  ? "Household succession looks reasonably clear from the visible records"
                  : "Estate handoff is building — a few key gaps still need to be closed"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {successorContacts.length === 0
                ? "Estate planning starts with one question: if something happened to you today, would the right people know what to do?"
                : readiness.headline}
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#d8b4fe" }}>{heroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>readiness</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Successor Contacts", value: successorContacts.length || "None" },
            { label: "Legal Documents", value: legalAssets.length || "None" },
            { label: "Pillars Clear", value: `${readyCount + partialCount}/3` },
            { label: "Action Items", value: estateCommand.rows.length || "None" },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#e9d5ff" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label="Add Successor Contact" primary onClick={() => onNavigate?.("/contacts")} />
          <button
            type="button"
            onClick={scrollToDocuments}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Documents
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/emergency")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Emergency Mode
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Succession Read",
            title: `${readyCount} of 3 pillars in place`,
            detail: "Executor, legal documents, and beneficiary designations are the three pillars of a clear estate handoff.",
            metric: `${successorContacts.length} successor contact${successorContacts.length === 1 ? "" : "s"}`,
            tone: readyCount === 3 ? "good" : readyCount >= 1 ? "warning" : "alert",
            statusLabel: readyCount === 3 ? "Complete" : "Gaps Exist",
            actionLabel: "See Checkpoints",
            action: "successors",
          },
          {
            kicker: "Biggest Risk",
            title: "Beneficiary designations override a will",
            detail: "Life insurance policies and retirement accounts pay out to whoever is named on the beneficiary form — not what the will says.",
            metric: "Review every 2–3 years",
            tone: "warning",
            statusLabel: "Review Required",
            actionLabel: "Check Policies",
            action: "insurance",
          },
          {
            kicker: "Emergency Access",
            title: "Does your family know where everything is?",
            detail: "Emergency mode creates a structured access summary for trusted successors — so the right people can act quickly.",
            metric: legalAssets.length > 0 ? `${legalAssets.length} docs on file` : "No docs yet",
            tone: "info",
            statusLabel: "Set Up Now",
            actionLabel: "Open Emergency Mode",
            action: "emergency",
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{
              padding: "20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={() => handleTileAction(tile.action)} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Readiness Checkpoints */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })} ref={successorContactsRef}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#7e22ce", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Succession Readiness
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
            If something happened today, would your household know what to do?
          </div>
          <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "680px" }}>
            These three checkpoints are the most commonly missed estate planning gaps. None require an attorney to start — just the right contacts and documents in place.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          {checkpoints.map((checkpoint) => (
            <ReadinessCheckpoint key={checkpoint.label} {...checkpoint} />
          ))}
        </div>
        {readyCount + partialCount < 3 ? (
          <div
            style={{
              padding: "16px 18px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)",
              border: "1px solid #fde68a",
              fontSize: "14px",
              color: "#78350f",
              lineHeight: "1.7",
            }}
          >
            <strong>Priority action:</strong> Start with naming an executor in Contacts. That single step anchors the entire estate picture and takes less than five minutes.
          </div>
        ) : null}
      </div>

      {/* Successor Contacts */}
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Successor Contacts</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              Executors, trustees, attorneys, and beneficiaries currently on file.
            </div>
          </div>
          <ActionButton label="Add Contact" primary onClick={() => onNavigate?.("/contacts")} />
        </div>

        {loading ? (
          <div style={{ padding: "24px", color: "#64748b", textAlign: "center" }}>Loading estate records...</div>
        ) : successorContacts.length === 0 ? (
          <div
            style={{
              padding: "36px 32px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              border: "1px dashed #cbd5e1",
              display: "grid",
              gap: "20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "40px" }}>⚖️</div>
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>No successor contacts yet</div>
              <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "480px", margin: "0 auto" }}>
                Add the people responsible for carrying out the estate plan — executor, trustee, attorney, beneficiaries. These contacts make the household handoff picture readable.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", maxWidth: "600px", margin: "0 auto", width: "100%" }}>
              {Object.entries(ROLE_CONFIG).slice(0, 4).map(([key, config]) => (
                <div
                  key={key}
                  style={{
                    padding: "14px 12px",
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>{config.icon}</span>
                  {config.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ActionButton label="Add First Successor" primary onClick={() => onNavigate?.("/contacts")} />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {successorContacts.map((contact) => (
              <SuccessorCard key={contact.id} contact={contact} />
            ))}
          </div>
        )}
      </div>

      {/* Document Tracker */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })} ref={documentRef}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Estate Document Checklist</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              Five documents that form the core of any estate plan. Upload to the vault and link them here.
            </div>
          </div>
          <ActionButton label="Open Vault" onClick={() => onNavigate?.("/vault")} />
        </div>
        <DocumentTracker documents={legalAssets} />
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: "13px",
            color: "#64748b",
            lineHeight: "1.7",
          }}
        >
          <strong style={{ color: "#0f172a" }}>Note:</strong> These statuses are inferred from asset names and descriptions. Upload documents to the vault, then add them as assets with matching names to have them appear here.
        </div>
      </div>

      {/* Command Center */}
      {estateCommand.rows.length > 0 ? (
        <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>What Needs Attention</div>
            <div style={{ color: "#64748b", lineHeight: "1.6" }}>Active estate planning gaps in the household record.</div>
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            {estateCommand.rows.map((item) => (
              <CommandRow key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Why This Matters */}
      <div
        style={{
          padding: "24px 26px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6 }}>
          Why Estate Planning Matters Now
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.3" }}>
          Most people plan to do this — but never do it before they need to
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {[
            {
              stat: "60%",
              label: "of American adults have no will or estate documents in place",
            },
            {
              stat: "#1 gap",
              label: "beneficiary designations that contradict the will — and the designation wins",
            },
            {
              stat: "18 mo",
              label: "average time to settle an estate without proper documentation in place",
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#d8b4fe", lineHeight: 1 }}>{item.stat}</div>
              <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: "1.6" }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label="Add Executor Contact" primary onClick={() => onNavigate?.("/contacts")} />
          <button
            type="button"
            onClick={() => onNavigate?.("/emergency")}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "transparent",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Open Emergency Mode
          </button>
        </div>
      </div>
    </div>
  );
}
