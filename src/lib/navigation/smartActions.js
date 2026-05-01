export const ACTION_KEY_ROUTES = {
  open_property_hub: "/property",
  open_homeowners_hub: "/insurance/homeowners",
  open_mortgage_hub: "/mortgage",
  open_insurance_hub: "/insurance",
  open_reports_hub: "/reports",
  open_portals_hub: "/portals",
  open_estate_hub: "/estate",
  open_contacts_hub: "/contacts",
};

export function resolveSmartActionRoute(actionKey) {
  return actionKey ? ACTION_KEY_ROUTES[actionKey] || null : null;
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
