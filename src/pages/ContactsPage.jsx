import { useEffect, useState } from "react";
import ContactCard from "../components/shared/ContactCard";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import { createContact, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

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
      setContacts([]);
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

  return (
    <div>
      <PageHeader
        eyebrow="Contacts"
        title="Household and Advisor Contacts"
        description="Household, advisor, trustee, executor, and institution contacts now read from the live platform directory."
      />
      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Contact Records", value: contacts.length, helper: "Live Supabase directory" },
          { label: "Emergency Use", value: contacts.filter((item) => item.contact_type === "family" || item.contact_type === "executor").length, helper: "Family and successor contacts" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: "18px" }}>
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

        <SectionCard title="Live Contact Directory" subtitle="Current working household contacts from Supabase.">
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

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Contacts: {contacts.length}
        </div>
      ) : null}
    </div>
  );
}
