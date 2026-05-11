export const ACTION_KEY_ROUTES = {
  open_property_hub: "/property",
  open_homeowners_hub: "/insurance/homeowners",
  open_mortgage_hub: "/mortgage",
  open_insurance_hub: "/insurance",
  open_auto_hub: "/insurance/auto",
  open_health_hub: "/insurance/health",
  open_retirement_hub: "/retirement",
  open_banking_hub: "/banking",
  open_reports_hub: "/reports",
  open_portals_hub: "/portals",
  open_estate_hub: "/estate",
  open_contacts_hub: "/contacts",
};

export function resolveSmartActionRoute(actionKey) {
  return actionKey ? ACTION_KEY_ROUTES[actionKey] || null : null;
}

export function inferSmartActionKeyFromText(text = "") {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("homeowners")) return "open_homeowners_hub";
  if (normalized.includes("mortgage")) return "open_mortgage_hub";
  if (normalized.includes("property")) return "open_property_hub";
  if (normalized.includes("retirement")) return "open_retirement_hub";
  if (normalized.includes("portal") || normalized.includes("access")) return "open_portals_hub";
  if (normalized.includes("banking")) return "open_banking_hub";
  if (normalized.includes("estate") || normalized.includes("trust") || normalized.includes("will")) return "open_estate_hub";
  if (normalized.includes("health")) return "open_health_hub";
  if (normalized.includes("auto")) return "open_auto_hub";
  if (
    normalized.includes("policy") ||
    normalized.includes("coi") ||
    normalized.includes("charge") ||
    normalized.includes("statement") ||
    normalized.includes("insurance")
  ) {
    return "open_insurance_hub";
  }
  if (normalized.includes("report")) return "open_reports_hub";

  return null;
}

export function executeSmartAction(action, context = {}) {
  if (!action) return;

  const {
    navigate,
    scrollToSection,
  } = context;

  if (action.type === "scroll_section" && action.section && typeof scrollToSection === "function") {
    scrollToSection(action.section);
    return;
  }

  if (action.action_key && resolveSmartActionRoute(action.action_key) && typeof navigate === "function") {
    navigate(action.route || resolveSmartActionRoute(action.action_key));
    return;
  }

  if (action.route && typeof navigate === "function") {
    navigate(action.route);
  }
}
