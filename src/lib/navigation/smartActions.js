export function executeSmartAction(action, context = {}) {
  if (!action) return;

  const {
    navigate,
    scrollToSection,
  } = context;
  const actionKeyRoutes = {
    open_property_hub: "/property",
    open_homeowners_hub: "/insurance/homeowners",
    open_mortgage_hub: "/mortgage",
    open_insurance_hub: "/insurance",
    open_reports_hub: "/reports",
    open_portals_hub: "/portals",
    open_estate_hub: "/estate",
    open_contacts_hub: "/contacts",
  };

  if (action.type === "scroll_section" && action.section && typeof scrollToSection === "function") {
    scrollToSection(action.section);
    return;
  }

  if (action.action_key && actionKeyRoutes[action.action_key] && typeof navigate === "function") {
    navigate(action.route || actionKeyRoutes[action.action_key]);
    return;
  }

  if (action.route && typeof navigate === "function") {
    navigate(action.route);
  }
}
