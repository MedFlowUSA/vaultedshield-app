const PROPERTY_DOCUMENT_CLASS_DEFINITIONS = [
  {
    document_class_key: "deed_reference",
    display_name: "Deed Reference",
    primary_use: "Ownership and title reference",
    expected_fields: ["property_address", "owner_name", "purchase_date"],
    related_property_types: ["primary_residence", "investment_property", "property_generic"],
  },
  {
    document_class_key: "tax_assessment_notice",
    display_name: "Tax Assessment Notice",
    primary_use: "Assessed value and county assessment visibility",
    expected_fields: ["assessed_value", "tax_year", "parcel_or_apn_masked"],
    related_property_types: ["primary_residence", "investment_property", "vacant_land", "property_generic"],
  },
  {
    document_class_key: "property_tax_bill",
    display_name: "Property Tax Bill",
    primary_use: "Tax amount and billing visibility",
    expected_fields: ["property_tax_amount", "tax_year", "property_address"],
    related_property_types: ["primary_residence", "investment_property", "second_home", "property_generic"],
  },
  {
    document_class_key: "hoa_statement",
    display_name: "HOA Statement",
    primary_use: "HOA dues and association visibility",
    expected_fields: ["hoa_present", "hoa_amount", "property_address"],
    related_property_types: ["condo_unit", "townhome_property", "vacation_property", "property_generic"],
  },
  {
    document_class_key: "appraisal_reference",
    display_name: "Appraisal Reference",
    primary_use: "Market value or appraisal visibility",
    expected_fields: ["estimated_market_value", "appraisal_reference_present", "property_address"],
    related_property_types: ["primary_residence", "investment_property", "multifamily_property", "property_generic"],
  },
  {
    document_class_key: "purchase_closing_reference",
    display_name: "Purchase Closing Reference",
    primary_use: "Purchase and title closing context",
    expected_fields: ["purchase_date", "purchase_price", "owner_name"],
    related_property_types: ["primary_residence", "second_home", "vacant_land", "property_generic"],
  },
  {
    document_class_key: "title_reference",
    display_name: "Title Reference",
    primary_use: "Title and ownership support",
    expected_fields: ["owner_name", "property_address", "parcel_or_apn_masked"],
    related_property_types: ["primary_residence", "investment_property", "property_generic"],
  },
  {
    document_class_key: "county_record_reference",
    display_name: "County Record Reference",
    primary_use: "County filing and parcel reference",
    expected_fields: ["county", "parcel_or_apn_masked", "property_address"],
    related_property_types: ["vacant_land", "investment_property", "property_generic"],
  },
  {
    document_class_key: "property_inspection_reference",
    display_name: "Property Inspection Reference",
    primary_use: "Inspection and condition visibility",
    expected_fields: ["property_address", "year_built", "square_footage"],
    related_property_types: ["primary_residence", "investment_property", "multifamily_property", "property_generic"],
  },
  {
    document_class_key: "lease_reference",
    display_name: "Lease Reference",
    primary_use: "Tenant and rental occupancy visibility",
    expected_fields: ["tenant_reference_present", "rental_indicator", "property_address"],
    related_property_types: ["investment_property", "rental_property_generic", "multifamily_property"],
  },
  {
    document_class_key: "other_property_document",
    display_name: "Other Property Document",
    primary_use: "Catch-all property document intake",
    expected_fields: ["property_address", "document_type"],
    related_property_types: ["property_generic"],
  },
];

export const PROPERTY_DOCUMENT_CLASS_REGISTRY = PROPERTY_DOCUMENT_CLASS_DEFINITIONS.reduce((accumulator, documentClass) => {
  accumulator[documentClass.document_class_key] = documentClass;
  return accumulator;
}, {});

export const PROPERTY_DOCUMENT_CLASS_KEYS = PROPERTY_DOCUMENT_CLASS_DEFINITIONS.map(
  (documentClass) => documentClass.document_class_key
);

export function listPropertyDocumentClasses() {
  return PROPERTY_DOCUMENT_CLASS_DEFINITIONS;
}

export function getPropertyDocumentClass(documentClassKey) {
  return PROPERTY_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
