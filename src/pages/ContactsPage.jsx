import { useEffect, useState } from "react";
import ContactCard from "../components/shared/ContactCard";
import EmptyState from "../components/shared/EmptyState";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeContactsModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { createContact, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const EMPTY_CONTACTS = [];

const CONTACT_TYPES = [
  "family",
  "attorney",
  "CPA",
  "advisor",
  "insurance_agent",
  "trustee",
  "executor",
  "institution",
];

export default function ContactsPage() {
  const { isTablet } = useResponsiveLayout();
  const householdState = usePlatformHousehold();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
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
      queueMicrotask(() => {
        setContacts(EMPTY_CONTACTS);
      });
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
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

  async function handleCreateContact(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.full_name.trim()) return;

    setLoading(true);
    const result = await createContact({
      household_id: householdState.context.householdId,
      ...form,
    });

    if (result.error) {
      setSubmitError(result.error.message || "Contact creation failed.");
      setLoading(false);
      return;
    }

    setContacts((current) => [result.data, ...current]);
    setForm({
      full_name: "",
      contact_type: "family",
      organization_name: "",
      email: "",
      phone: "",
      notes: "",
    });
    setSubmitError("");
    setLoading(false);
  }

  const contactRead = summarizeContactsModule(contacts);
  const topRailLayout = isTablet ? "1fr" : "1.35fr 1fr";
  const contentRailLayout = isTablet ? "1fr" : "1fr 1.25fr";
  const contactHeroScore = Math.round(
    contacts.length > 0
      ? Math.min(88, 34 + contacts.length * 5 + Number(contactRead.metrics.successorContacts || 0) * 8)
      : 24
  );
  const contactHeroTone =
    contactHeroScore >= 80 ? "good" : contactHeroScore >= 60 ? "info" : contactHeroScore >= 44 ? "warning" : "alert";
  const contactHeroGlanceItems = [
    { label: "Working Household", value: householdState.household?.household_name || "Loading" },
    { label: "Contact Records", value: contacts.length },
    { label: "Emergency Use", value: contacts.filter((item) => item.contact_type === "family" || item.contact_type === "executor").length },
    { label: "Advisors", value: contactRead.metrics.advisorContacts },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <FriendlyPageHero
        eyebrow="Contacts"
        sectionTitle="Household and Advisor Contacts"
        headline="Make the people around the household easy to reach before an urgent moment forces the issue."
        summary={contactRead.headline}
        transition="This top layer should answer whether the directory feels usable. The deeper contact list and create flow stay below."
        actions={[]}
        score={contactHeroScore}
        scoreTone={contactHeroTone}
        scoreSubtitle="directory score"
        scoreIconLabel="contacts"
        asideHeadline={contacts.length > 0 ? "Directory is taking shape" : "Start with the first key contact"}
        asideSummary={contactRead.notes[0] || "A few trusted contacts can make the whole household file feel more usable."}
        glanceItems={contactHeroGlanceItems}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Simple Read"
          title={contactRead.status === "Ready" ? "Directory looks usable" : "Directory is still building"}
          detail={contactRead.headline}
          metric={`${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
          tone={contactHeroTone}
          statusLabel="Simple Read"
          actionLabel="Add Contact"
          onAction={() => document.querySelector('input[placeholder="Full name"]')?.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
        <FriendlyActionTile
          kicker="Best First Step"
          title={contacts.length > 0 ? "Fill the next missing role" : "Add the first family or advisor contact"}
          detail={contactRead.notes[0] || "Start with the people you would actually need in a handoff or emergency."}
          metric={`${contactRead.metrics.missingDirectReach || 0} missing reach`}
          tone="warning"
          statusLabel="Guided Focus"
          actionLabel="See Directory"
          onAction={() => document.querySelector('[data-contacts-directory="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <FriendlyActionTile
          kicker="What Can Wait"
          title="Perfect notes can come later"
          detail="Direct contact details matter more than fully polished metadata on the first pass."
          metric={`${contactRead.metrics.institutionContacts || 0} institution`}
          tone="info"
          statusLabel="Building"
          actionLabel="Review Contacts"
          onAction={() => document.querySelector('[data-contacts-directory="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: topRailLayout, gap: "18px" }}>
        <SectionCard title="Directory Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{contactRead.headline}</div>
              <StatusBadge
                label={contactRead.status}
                tone={contactRead.status === "Ready" ? "good" : contactRead.status === "Building" ? "warning" : "alert"}
              />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {contactRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Role Coverage">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Successors:</strong> {contactRead.metrics.successorContacts}</div>
            <div><strong>Advisors:</strong> {contactRead.metrics.advisorContacts}</div>
            <div><strong>Institutions:</strong> {contactRead.metrics.institutionContacts}</div>
            <div><strong>Missing direct reach:</strong> {contactRead.metrics.missingDirectReach}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: contentRailLayout, gap: "18px" }}>
        <SectionCard title="Add Contact" subtitle="Minimal create flow for the household continuity directory.">
          <form onSubmit={handleCreateContact} style={{ display: "grid", gap: "12px" }}>
            <input
              value={form.full_name}
              onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              placeholder="Full name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <select
              value={form.contact_type}
              onChange={(event) => setForm((current) => ({ ...current, contact_type: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {CONTACT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              value={form.organization_name}
              onChange={(event) => setForm((current) => ({ ...current, organization_name: event.target.value }))}
              placeholder="Organization name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Phone"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notes"
              rows={4}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />
            <button
              type="submit"
              disabled={loading || !householdState.context.householdId}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              {loading ? "Saving..." : "Add Contact"}
            </button>
            {submitError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{submitError}</div> : null}
          </form>
        </SectionCard>

        <SectionCard data-contacts-directory="true" title="Live Contact Directory" subtitle="Current working household contacts from Supabase.">
          {contacts.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  name={contact.full_name}
                  role={contact.contact_type || "contact"}
                  details={[
                    contact.organization_name,
                    contact.email,
                    contact.phone,
                    contact.notes,
                  ]
                    .filter(Boolean)
                    .join(" | ") || "No additional details yet."}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No contacts yet"
              description="Add the first family, advisor, trustee, or institution contact to activate the household directory."
            />
          )}
        </SectionCard>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Contacts: {contacts.length}
        </div>
      ) : null}
    </div>
  );
}
