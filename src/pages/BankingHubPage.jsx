import { useEffect, useMemo, useRef, useState } from "react";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
import { summarizeBankingModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildBankingHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { getPortalHubBundle, listAssets, listContacts } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

const EMPTY_BANKING_BUNDLE = { assets: [], contacts: [], portalBundle: null };

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
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

function ReadinessCheckpoint({ icon, label, status, detail }) {
  const tone =
    status === "ready" ? "good"
    : status === "partial" ? "warning"
    : "alert";
  const pill = pillStyle(tone);
  const statusLabel =
    status === "ready" ? "Ready"
    : status === "partial" ? "Partial"
    : "Missing";

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
        <div
          style={{
            ...pill,
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
        </div>
      </div>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{label}</div>
      <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function AccountCard({ asset }) {
  const type =
    String(asset.asset_subcategory || asset.asset_category || "").toLowerCase();
  const isChecking = type.includes("check");
  const isSavings = type.includes("saving");
  const isMoney = type.includes("money") || type.includes("market");
  const isBrokerage = type.includes("brokerage") || type.includes("invest");

  const typeLabel = isChecking
    ? "Checking Account"
    : isSavings
      ? "Savings Account"
      : isMoney
        ? "Money Market"
        : isBrokerage
          ? "Brokerage / Investment"
          : asset.asset_subcategory || asset.asset_category || "Banking Asset";

  const typeColor = isChecking
    ? { bg: "#eff6ff", text: "#1d4ed8" }
    : isSavings
      ? { bg: "#f0fdf4", text: "#166534" }
      : isMoney
        ? { bg: "#fdf4ff", text: "#7e22ce" }
        : { bg: "#f8fafc", text: "#475569" };

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
        <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>
            {asset.asset_name || "Banking Account"}
          </div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {asset.institution_name || "Institution not recorded"}
          </div>
        </div>
        <div
          style={{
            padding: "5px 10px",
            borderRadius: "999px",
            background: typeColor.bg,
            color: typeColor.text,
            fontSize: "11px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {typeLabel}
        </div>
      </div>
      {asset.description ? (
        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{asset.description}</div>
      ) : null}
    </div>
  );
}

function EmptyAccountsPanel({ onNavigate }) {
  return (
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
      <div style={{ fontSize: "40px" }}>🏦</div>
      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
          No banking records yet
        </div>
        <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "480px", margin: "0 auto" }}>
          Add your checking, savings, money market, or brokerage accounts so VaultedShield can map your household's cash access picture.
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
          maxWidth: "640px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {[
          { icon: "💳", label: "Checking account" },
          { icon: "💰", label: "Savings account" },
          { icon: "📈", label: "Brokerage account" },
          { icon: "🏧", label: "Money market" },
        ].map((item) => (
          <div
            key={item.label}
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
            <span>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
        <ActionButton label="Add Banking Record" primary onClick={() => onNavigate?.("/assets")} />
        <ActionButton label="Connect Portal" onClick={() => onNavigate?.("/portals")} />
      </div>
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

export default function BankingHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const accountsRef = useRef(null);
  const commandRef = useRef(null);
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
    return () => { active = false; };
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

  const bankingContacts = useMemo(
    () =>
      bundle.contacts.filter((contact) =>
        String(`${contact.role} ${contact.institution_name} ${contact.contact_type}`)
          .toLowerCase()
          .match(/bank|financial|advisor|broker|credit|lend/)
      ),
    [bundle.contacts]
  );

  const connectedPortals = useMemo(
    () => (bundle.portalBundle?.portals || []).filter((portal) =>
      String(`${portal.portal_type} ${portal.institution_name}`)
        .toLowerCase()
        .match(/bank|credit|invest|broker|financial/)
    ),
    [bundle.portalBundle]
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

  const heroScore = readiness.status === "Ready" ? 84 : readiness.status === "Building" ? 62 : bankingAssets.length > 0 ? 48 : 34;
  const heroTone = heroScore >= 80 ? "good" : heroScore >= 60 ? "info" : heroScore >= 45 ? "warning" : "alert";

  const checkpoints = useMemo(() => {
    const hasAccounts = bankingAssets.length > 0;
    const hasPortal = connectedPortals.length > 0;
    const hasContact = bankingContacts.length > 0;
    const emergencyPortalCount = readiness.metrics.emergencyPortals || 0;

    return [
      {
        icon: "💳",
        label: "Account visibility",
        status: hasAccounts ? "ready" : "missing",
        detail: hasAccounts
          ? `${bankingAssets.length} account${bankingAssets.length === 1 ? "" : "s"} are recorded and visible in the household financial picture.`
          : "No banking accounts have been added yet. A trusted family member would not know where to look in an emergency.",
      },
      {
        icon: "🔐",
        label: "Online access continuity",
        status: hasPortal ? (emergencyPortalCount > 0 ? "ready" : "partial") : "missing",
        detail: hasPortal
          ? emergencyPortalCount > 0
            ? `${emergencyPortalCount} banking portal${emergencyPortalCount === 1 ? "" : "s"} marked for emergency access.`
            : "Banking portals connected, but none are marked for emergency access recovery."
          : "No banking portals are connected. Access credentials and recovery instructions are not mapped.",
      },
      {
        icon: "👤",
        label: "Institution contacts",
        status: hasContact ? "ready" : bankingAssets.length > 0 ? "partial" : "missing",
        detail: hasContact
          ? `${bankingContacts.length} banking contact${bankingContacts.length === 1 ? "" : "s"} are on file — advisor, banker, or support.`
          : "No banking contacts recorded. In a crisis, knowing who to call at each institution matters.",
      },
    ];
  }, [bankingAssets.length, bankingContacts.length, connectedPortals.length, readiness.metrics.emergencyPortals]);

  const readyCount = checkpoints.filter((item) => item.status === "ready").length;

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      <FriendlyPageHero
        eyebrow="Banking and Cash"
        sectionTitle="Liquidity & Access"
        headline={
          bankingAssets.length === 0
            ? "Map where household cash lives and who can reach it"
            : readiness.status === "Ready"
              ? "Banking continuity looks well-covered from the visible records"
              : "Cash access is visible — access continuity still needs work"
        }
        summary={
          bankingAssets.length === 0
            ? "VaultedShield's banking module is not about balances — it's about continuity. If the primary account holder were unreachable, could the household access its money? That question drives everything here."
            : readiness.headline
        }
        transition={
          bankingAssets.length === 0
            ? "Start by adding one checking or savings account. That first record anchors the household cash picture and lets the emergency readiness view begin."
            : "The readiness checkpoints below show exactly where access continuity is solid and where it still has gaps."
        }
        actions={[
          { label: "Connect Portal", onClick: () => onNavigate?.("/portals"), kind: "primary" },
          { label: "See Accounts", onClick: () => accountsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
          { label: "Review Contacts", onClick: () => onNavigate?.("/contacts") },
        ]}
        score={heroScore}
        scoreTone={heroTone}
        scoreSubtitle="readiness"
        scoreIconLabel="BK"
        asideHeadline={readiness.status}
        asideSummary={readiness.headline}
        glanceEyebrow="At A Glance"
        glanceItems={[
          { label: "Accounts", value: bankingAssets.length || "None yet" },
          { label: "Portals connected", value: connectedPortals.length || "None yet" },
          { label: "Emergency access", value: readiness.metrics.emergencyPortals > 0 ? `${readiness.metrics.emergencyPortals} set up` : "Not mapped" },
          { label: "Banking contacts", value: bankingContacts.length || "None yet" },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Access Readiness"
          title={`${readyCount} of 3 checkpoints clear`}
          detail="Account visibility, portal access, and institution contacts are the three pillars of banking continuity."
          metric={`${bankingAssets.length} account${bankingAssets.length === 1 ? "" : "s"} visible`}
          tone={readyCount === 3 ? "good" : readyCount >= 1 ? "warning" : "alert"}
          statusLabel={readyCount === 3 ? "All Clear" : "Needs Work"}
          actionLabel="See Checkpoints"
          onAction={() => commandRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <FriendlyActionTile
          kicker="Emergency Scenario"
          title="Could your family reach cash right now?"
          detail="If the primary account holder were hospitalized tomorrow, would your household know which accounts exist and how to access them?"
          metric={connectedPortals.length > 0 ? `${connectedPortals.length} portals mapped` : "Not yet mapped"}
          tone={connectedPortals.length > 0 ? "info" : "alert"}
          statusLabel="Critical Gap"
          actionLabel="Map Portals"
          onAction={() => onNavigate?.("/portals")}
        />
        <FriendlyActionTile
          kicker="Institution Support"
          title="Who to call at each bank"
          detail="Advisor, banker, and support contacts for each institution reduce friction when access is lost or restricted."
          metric={`${bankingContacts.length} contact${bankingContacts.length === 1 ? "" : "s"} on file`}
          tone={bankingContacts.length > 0 ? "good" : "warning"}
          statusLabel={bankingContacts.length > 0 ? "Covered" : "Building"}
          actionLabel="Manage Contacts"
          onAction={() => onNavigate?.("/contacts")}
        />
      </div>

      {/* Emergency Readiness Checkpoints */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })} ref={commandRef}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Emergency Readiness
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
            In an emergency, could your household reach this money?
          </div>
          <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "680px" }}>
            VaultedShield checks three readiness pillars — not account balances, but whether a trusted family member could actually access household funds without friction.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          {checkpoints.map((checkpoint) => (
            <ReadinessCheckpoint key={checkpoint.label} {...checkpoint} />
          ))}
        </div>
        {readyCount < 3 ? (
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
            <strong>Household action needed:</strong> {3 - readyCount} readiness pillar{3 - readyCount === 1 ? "" : "s"} still missing. Start with portals — that's the fastest path to making banking access survivable for the whole household.
          </div>
        ) : (
          <div
            style={{
              padding: "16px 18px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)",
              border: "1px solid #bbf7d0",
              fontSize: "14px",
              color: "#14532d",
              lineHeight: "1.7",
            }}
          >
            All three readiness pillars are covered. Banking access continuity looks solid from the current household record set.
          </div>
        )}
      </div>

      {/* Account Visibility */}
      <div ref={accountsRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Account Visibility</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              Banking accounts currently tracked in the household financial picture.
            </div>
          </div>
          <ActionButton label="Add Account" onClick={() => onNavigate?.("/assets")} />
        </div>

        {loading ? (
          <div style={{ padding: "24px", color: "#64748b", textAlign: "center" }}>Loading banking records...</div>
        ) : loadError ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "14px",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "14px",
            }}
          >
            {loadError}
          </div>
        ) : bankingAssets.length === 0 ? (
          <EmptyAccountsPanel onNavigate={onNavigate} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {bankingAssets.map((asset) => (
              <AccountCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>

      {/* Portal Access */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "18px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Online Access & Portals</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              Online banking portals with login credentials and emergency recovery documentation.
            </div>
          </div>
          <ActionButton label="Manage Portals" onClick={() => onNavigate?.("/portals")} />
        </div>

        {connectedPortals.length === 0 ? (
          <div
            style={{
              padding: "28px 24px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              display: "grid",
              gap: "12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px" }}>🔑</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>No banking portals mapped yet</div>
            <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "440px", margin: "0 auto" }}>
              Portal mapping is where account access becomes survivable. Add login URLs, recovery instructions, and who holds emergency credentials.
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ActionButton label="Connect First Portal" primary onClick={() => onNavigate?.("/portals")} />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {connectedPortals.slice(0, 6).map((portal) => (
              <div
                key={portal.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: "2px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                    {portal.institution_name || portal.portal_name || "Banking Portal"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>{portal.portal_type || "Online Banking"}</div>
                </div>
                <div
                  style={{
                    ...pillStyle(portal.emergency_access ? "good" : "neutral"),
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  {portal.emergency_access ? "Emergency Access Set" : "Access Not Configured"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command Center */}
      {bankingCommand.rows.length > 0 ? (
        <SectionCard
          title="What Needs Attention"
          subtitle="Active continuity gaps in the household banking picture."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            {bankingCommand.rows.map((item) => (
              <CommandRow key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {/* Why This Matters */}
      <div
        style={{
          padding: "24px 26px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6 }}>
          Why This Module Exists
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.3" }}>
          Most families discover banking continuity problems at the worst possible moment
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {[
            {
              stat: "72%",
              label: "of households have no documented emergency cash access plan",
            },
            {
              stat: "48 hrs",
              label: "average delay to access accounts when primary holder is unreachable",
            },
            {
              stat: "3–6 mo",
              label: "of expenses in accessible cash is the household continuity target",
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#93c5fd", lineHeight: 1 }}>{item.stat}</div>
              <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
