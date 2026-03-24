export const WARRANTY_PROVIDER_REGISTRY = {
  american_home_shield: {
    provider_key: "american_home_shield",
    display_name: "American Home Shield",
    institution_type: "warranty_provider",
    known_portal_urls: ["ahs.com"],
    known_contract_labels: ["home warranty contract", "coverage details"],
    known_claim_labels: ["service request", "claim"],
    known_expiration_labels: ["expiration date", "coverage end"],
    notes: "Starter home-warranty provider profile.",
  },
  choice_home_warranty: {
    provider_key: "choice_home_warranty",
    display_name: "Choice Home Warranty",
    institution_type: "warranty_provider",
    known_portal_urls: ["choicehomewarranty.com"],
    known_contract_labels: ["service agreement", "policy coverage"],
    known_claim_labels: ["claim", "service request"],
    known_expiration_labels: ["expiration date"],
    notes: "Starter home-warranty profile.",
  },
  cinch_home_services: {
    provider_key: "cinch_home_services",
    display_name: "Cinch Home Services",
    institution_type: "warranty_provider",
    known_portal_urls: ["cinchhomeservices.com"],
    known_contract_labels: ["home service plan"],
    known_claim_labels: ["service claim", "request service"],
    known_expiration_labels: ["coverage term"],
    notes: "Starter home-services warranty profile.",
  },
  asurion: {
    provider_key: "asurion",
    display_name: "Asurion",
    institution_type: "warranty_provider",
    known_portal_urls: ["asurion.com"],
    known_contract_labels: ["protection plan", "device protection"],
    known_claim_labels: ["start a claim", "claim status"],
    known_expiration_labels: ["coverage ends", "plan expiration"],
    notes: "Starter electronics/device protection profile.",
  },
  squaretrade_allstate_protection: {
    provider_key: "squaretrade_allstate_protection",
    display_name: "SquareTrade / Allstate Protection",
    institution_type: "warranty_provider",
    known_portal_urls: ["squaretrade.com", "allstateprotectionplans.com"],
    known_contract_labels: ["protection plan", "service contract"],
    known_claim_labels: ["file a claim", "claim number"],
    known_expiration_labels: ["coverage end date"],
    notes: "Starter electronics and appliance protection profile.",
  },
  geek_squad_protection_reference: {
    provider_key: "geek_squad_protection_reference",
    display_name: "Geek Squad Protection Reference",
    institution_type: "warranty_provider",
    known_portal_urls: ["bestbuy.com"],
    known_contract_labels: ["geek squad protection", "protection plan"],
    known_claim_labels: ["service claim"],
    known_expiration_labels: ["expiration date"],
    notes: "Retail protection-plan reference profile.",
  },
  home_depot_protection_plan_reference: {
    provider_key: "home_depot_protection_plan_reference",
    display_name: "Home Depot Protection Plan Reference",
    institution_type: "warranty_provider",
    known_portal_urls: ["homedepot.com"],
    known_contract_labels: ["protection plan", "extended service plan"],
    known_claim_labels: ["service request"],
    known_expiration_labels: ["coverage ends"],
    notes: "Retail appliance and equipment plan reference.",
  },
  lowes_protection_plan_reference: {
    provider_key: "lowes_protection_plan_reference",
    display_name: "Lowe's Protection Plan Reference",
    institution_type: "warranty_provider",
    known_portal_urls: ["lowes.com"],
    known_contract_labels: ["protection plan", "service agreement"],
    known_claim_labels: ["claim", "service request"],
    known_expiration_labels: ["expiration date"],
    notes: "Retail appliance and product plan reference.",
  },
  manufacturer_generic: {
    provider_key: "manufacturer_generic",
    display_name: "Generic Manufacturer Warranty",
    institution_type: "manufacturer_warranty",
    known_portal_urls: [],
    known_contract_labels: ["limited warranty", "manufacturer warranty"],
    known_claim_labels: ["warranty claim", "support request"],
    known_expiration_labels: ["warranty period", "expiration date"],
    notes: "Fallback manufacturer warranty profile.",
  },
  provider_generic_warranty: {
    provider_key: "provider_generic_warranty",
    display_name: "Generic Warranty Provider",
    institution_type: "warranty_provider",
    known_portal_urls: [],
    known_contract_labels: ["service contract", "warranty agreement"],
    known_claim_labels: ["claim", "service contact"],
    known_expiration_labels: ["expiration date", "coverage end"],
    notes: "Fallback profile for unknown or regional warranty providers.",
  },
};

export const WARRANTY_PROVIDER_KEYS = Object.freeze(Object.keys(WARRANTY_PROVIDER_REGISTRY));

export function listWarrantyProviders() {
  return Object.values(WARRANTY_PROVIDER_REGISTRY);
}

export function getWarrantyProvider(providerKey) {
  return WARRANTY_PROVIDER_REGISTRY[providerKey] || null;
}
