import { useEffect, useMemo, useRef, useState } from "react";
import ContactCard from "../components/shared/ContactCard";
import { summarizeContactsModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { createContact, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const EMPTY_CONTACTS = [];

const CONTACT_TYPES = [
  "family", "attorney", "CPA", "advisor", "insurance_agent", "trustee", "executor", "institution",
];

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

export default function ContactsPage() {
  const householdState = usePlatformHousehold();
  const directoryRef = useRef(null);
  const [contacts, setContacts] = useState(EMPTY_CONTACTS);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    contact_type: "family",
    organization_name: "",
    email: "",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    if (!householdState.context.householdId) {
      queueMicrotask(() => setContacts(EMPTY_CONTACTS));
      return;
    }
    let active = true;
    async function loadContacts() {
      setLoading(true);
      const result = await listContacts(householdState.context.householdId);
      if (!active) return;
      setContacts(result.data || []);
      setSubmitError(result.error?.message || "");
      setLoading(false);
    }
    loadContacts();
    return () => { active = false; };
  }, [householdState.context.householdId]);

  async function handleCreateContact(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.full_name.trim()) return;
    setLoading(true);
    const result = await createContact({ household_id: householdState.context.householdId, ...form });
    if (result.error) {
      setSubmitError(result.error.message || "Contact creation failed.");
      setLoading(false);
      return;
    }
    setContacts((current) => [result.data, ...current]);
    setForm({ full_name: "", contact_type: "family", organization_name: "", email: "", phone: "", notes: "" });
    setSubmitError("");
    setShowAddForm(false);
    setLoading(false);
  }

  const contactRead = useMemo(() => summarizeContactsModule(contacts), [contacts]);
  const heroScore = Math.round(
    contacts.length > 0
      ? Math.min(88, 34 + contacts.length * 5 + Number(contactRead.metrics.successorContacts || 0) * 8)
      : 24
  );
  const scoreTone = heroScore >= 80 ? "good" : heroScore >= 60 ? "info" : heroScore >= 44 ? "warning" : "alert";
  const emergencyCount = contacts.filter((c) => ["family", "executor"].includes(c.contact_type)).length;
  const scrollToDirectory = () => directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const openAddContactForm = () => {
    setShowAddForm(true);
    setTimeout(scrollToDirectory, 50);
  };
  const handleTileAction = (action) => {
    if (action === "add_contact") {
      openAddContactForm();
      return;
    }
    scrollToDirectory();
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
              Contacts
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {contacts.length === 0
                ? "Make the right people easy to reach before an urgent moment forces it"
                : contactRead.status === "Ready"
                  ? "Contact directory looks solid for a household handoff"
                  : "Directory is building — a few key roles still need contacts"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {contactRead.headline}
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
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>directory score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Contact Records", value: contacts.length || "None" },
            { label: "Emergency Use", value: emergencyCount || 0 },
            { label: "Advisors", value: contactRead.metrics.advisorContacts || 0 },
            { label: "Missing Reach", value: contactRead.metrics.missingDirectReach || 0 },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#e9d5ff" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={openAddContactForm}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Add Contact
          </button>
          <button
            type="button"
            onClick={scrollToDirectory}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Directory
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Directory Status",
            title: contactRead.status === "Ready" ? "Directory looks usable" : "Directory is still building",
            detail: contactRead.headline,
            metric: `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`,
            tone: scoreTone,
            statusLabel: contactRead.status,
            actionLabel: "See Directory",
            action: "directory",
          },
          {
            kicker: "Best First Step",
            title: contacts.length > 0 ? "Fill the next missing role" : "Add the first family or advisor contact",
            detail: contactRead.notes[0] || "Start with the people you would actually need in a handoff or emergency.",
            metric: `${contactRead.metrics.missingDirectReach || 0} missing reach`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Add Contact",
            action: "add_contact",
          },
          {
            kicker: "What Can Wait",
            title: "Perfect notes come after direct reach",
            detail: "Direct contact details — email and phone — matter more than fully polished metadata on the first pass.",
            metric: `${contactRead.metrics.institutionContacts || 0} institution contacts`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "Review Contacts",
            action: "directory",
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

      {/* Readiness + Role Coverage */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Directory Readiness</div>
            <div style={{ ...pillStyle(scoreTone), padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>{contactRead.status}</div>
          </div>
          <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>{contactRead.headline}</div>
          {contactRead.notes.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#64748b", fontSize: "13px" }}>
              {contactRead.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </div>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Role Coverage</div>
          <div style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong style={{ color: "#334155" }}>Successors:</strong> {contactRead.metrics.successorContacts}</div>
            <div><strong style={{ color: "#334155" }}>Advisors:</strong> {contactRead.metrics.advisorContacts}</div>
            <div><strong style={{ color: "#334155" }}>Institutions:</strong> {contactRead.metrics.institutionContacts}</div>
            <div><strong style={{ color: "#334155" }}>Missing direct reach:</strong> {contactRead.metrics.missingDirectReach}</div>
          </div>
        </div>
      </div>

      {/* Contact Directory + Add Form */}
      <div ref={directoryRef} style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#4c1d95", textTransform: "uppercase", letterSpacing: "0.1em" }}>Contacts</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>Household Contact Directory</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              {contacts.length > 0 ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on file.` : "No contacts yet — add the first below."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              background: showAddForm ? "#0f172a" : "#f8fafc",
              color: showAddForm ? "#ffffff" : "#0f172a",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {showAddForm ? "Cancel" : "Add Contact"}
          </button>
        </div>

        {showAddForm ? (
          <form onSubmit={handleCreateContact} style={{ display: "grid", gap: "12px", padding: "20px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>New Contact</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <label style={{ display: "grid", gap: "5px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Full name</span>
                <input value={form.full_name} onChange={(e) => setForm((c) => ({ ...c, full_name: e.target.value }))} placeholder="Full name" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }} />
              </label>
              <label style={{ display: "grid", gap: "5px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Role</span>
                <select value={form.contact_type} onChange={(e) => setForm((c) => ({ ...c, contact_type: e.target.value }))} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "14px" }}>
                  {CONTACT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: "5px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Organization name</span>
                <input value={form.organization_name} onChange={(e) => setForm((c) => ({ ...c, organization_name: e.target.value }))} placeholder="Organization name" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }} />
              </label>
              <label style={{ display: "grid", gap: "5px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Email</span>
                <input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" type="email" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }} />
              </label>
              <label style={{ display: "grid", gap: "5px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Phone</span>
                <input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }} />
              </label>
            </div>
            <label style={{ display: "grid", gap: "5px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Notes" rows={3} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical", fontSize: "14px" }} />
            </label>
            {submitError ? <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fee2e2", color: "#991b1b", fontSize: "13px" }}>{submitError}</div> : null}
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="submit" disabled={loading || !householdState.context.householdId} style={{ padding: "10px 18px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "14px", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Saving..." : "Add Contact"}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: "10px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {contacts.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                name={contact.full_name}
                role={contact.contact_type || "contact"}
                details={[contact.organization_name, contact.email, contact.phone, contact.notes].filter(Boolean).join(" | ") || "No additional details yet."}
              />
            ))}
          </div>
        ) : !showAddForm ? (
          <div style={{ padding: "32px", borderRadius: "16px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "12px" }}>
            <div style={{ fontSize: "36px" }}>👥</div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>No contacts yet</div>
            <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "400px", margin: "0 auto" }}>
              Add the first family, advisor, trustee, or institution contact to activate the household directory.
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={() => setShowAddForm(true)} style={{ padding: "10px 18px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                Add First Contact
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Contacts: {contacts.length}
        </div>
      ) : null}
    </div>
  );
}
