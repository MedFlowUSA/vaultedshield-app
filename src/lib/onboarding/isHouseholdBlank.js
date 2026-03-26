export function isBootstrapOnlyHouseholdMember(member) {
  return Boolean(
    member?.metadata?.bootstrap &&
      member?.role_type === "self" &&
      member?.is_primary
  );
}

function countMeaningfulPortals(bundle = {}) {
  const readiness = bundle.portalReadiness || {};
  return readiness.linkedPortalCount || readiness.portalCount || 0;
}

export function getHouseholdBlankState(bundle = {}, savedPolicyRows = []) {
  const householdMembers = bundle.householdMembers || [];
  const explicitMembers = householdMembers.filter((member) => !isBootstrapOnlyHouseholdMember(member));
  const contacts = bundle.contacts || [];
  const emergencyContacts = bundle.emergencyContacts || [];
  const professionalContacts = bundle.keyProfessionalContacts || [];
  const setupCounts = {
    assets: (bundle.assets || []).length,
    documents: (bundle.documents || []).length,
    policies: Array.isArray(savedPolicyRows) ? savedPolicyRows.length : 0,
    emergencyContacts: emergencyContacts.length,
    portals: countMeaningfulPortals(bundle),
  };

  const reasons = [];
  if (setupCounts.assets > 0) reasons.push("assets_present");
  if (setupCounts.documents > 0) reasons.push("documents_present");
  if (setupCounts.policies > 0) reasons.push("policies_present");
  if (setupCounts.emergencyContacts > 0) reasons.push("emergency_contacts_present");
  if (setupCounts.portals > 0) reasons.push("portals_present");
  if (explicitMembers.length > 0) reasons.push("household_members_present");
  if (contacts.length > 0) reasons.push("contacts_present");
  if (professionalContacts.length > 0) reasons.push("professional_contacts_present");
  if ((bundle.openAlerts || []).length > 0) reasons.push("alerts_present");
  if ((bundle.openTasks || []).length > 0) reasons.push("tasks_present");
  if ((bundle.reports || []).length > 0) reasons.push("reports_present");
  if ((bundle.properties || []).length > 0) reasons.push("properties_present");
  if ((bundle.mortgageLoans || []).length > 0) reasons.push("mortgage_loans_present");
  if ((bundle.homeownersPolicies || []).length > 0) reasons.push("homeowners_policies_present");

  const isBlank = reasons.length === 0;

  return {
    isBlank,
    reasons: isBlank ? ["no_meaningful_household_records"] : reasons,
    setupCounts,
    detailCounts: {
      explicitMembers: explicitMembers.length,
      contacts: contacts.length,
      professionalContacts: professionalContacts.length,
      properties: (bundle.properties || []).length,
      mortgageLoans: (bundle.mortgageLoans || []).length,
      homeownersPolicies: (bundle.homeownersPolicies || []).length,
    },
  };
}

export function buildHouseholdOnboardingChecklist(blankState, bundle = {}, savedPolicyRows = []) {
  const properties = bundle.properties || [];
  const mortgageLoans = bundle.mortgageLoans || [];
  const homeownersPolicies = bundle.homeownersPolicies || [];
  const explicitMembers = blankState?.detailCounts?.explicitMembers || 0;
  const documents = blankState?.setupCounts?.documents || 0;
  const emergencyContacts = blankState?.setupCounts?.emergencyContacts || 0;
  const policies = Array.isArray(savedPolicyRows) ? savedPolicyRows.length : 0;

  return [
    {
      id: "household_member",
      label: "Add household member",
      complete: explicitMembers > 0,
      hint: explicitMembers > 0 ? "Household membership is on record." : "Add a spouse, partner, parent, or dependent when relevant.",
      route: "/contacts",
    },
    {
      id: "primary_property",
      label: "Add primary property",
      complete: properties.length > 0,
      hint: properties.length > 0 ? "A property record is already visible." : "Start with the main home or most important property record.",
      route: "/property",
    },
    {
      id: "mortgage_or_owned",
      label: "Add mortgage or mark property as owned free and clear",
      complete: mortgageLoans.length > 0,
      hint:
        mortgageLoans.length > 0
          ? "Mortgage visibility is already connected."
          : properties.length > 0
            ? "If the property is owned free and clear, keep the property record live and skip mortgage setup for now."
            : "This step becomes relevant after you add a property.",
      route: "/property",
    },
    {
      id: "insurance",
      label: "Add life or homeowners insurance",
      complete: policies > 0 || homeownersPolicies.length > 0,
      hint:
        policies > 0 || homeownersPolicies.length > 0
          ? "Insurance visibility has started."
          : "Upload a life policy or add home protection once property records exist.",
      route: "/insurance",
    },
    {
      id: "documents",
      label: "Upload your first document",
      complete: documents > 0,
      hint: documents > 0 ? "Documents are already in the household vault." : "A single statement, declaration page, or trust PDF is enough to begin.",
      route: "/upload-center",
    },
    {
      id: "emergency_contact",
      label: "Add an emergency contact",
      complete: emergencyContacts > 0,
      hint: emergencyContacts > 0 ? "Emergency contact coverage has started." : "Add a family member, executor, or another emergency contact.",
      route: "/contacts",
    },
  ];
}
