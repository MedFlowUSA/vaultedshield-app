import {
  getMortgageDocumentClass,
  listMortgageDocumentClasses,
  MORTGAGE_DOCUMENT_CLASS_KEYS,
  MORTGAGE_DOCUMENT_CLASS_REGISTRY,
} from "./mortgageDocumentClasses";
import {
  createEmptyMortgageIntelligenceSchema,
  MORTGAGE_INTELLIGENCE_GROUPS,
  MORTGAGE_INTELLIGENCE_SCHEMA_VERSION,
  MORTGAGE_INTELLIGENCE_TEMPLATE,
} from "./mortgageIntelligenceSchema";
import {
  getMortgageLender,
  listMortgageLenders,
  MORTGAGE_LENDER_KEYS,
  MORTGAGE_LENDER_REGISTRY,
} from "./mortgageLenders";
import {
  getMortgageLoanType,
  listMortgageLoanTypes,
  MORTGAGE_LOAN_TYPE_KEYS,
  MORTGAGE_LOAN_TYPE_REGISTRY,
} from "./mortgageLoanTypes";
import {
  createEmptyMortgageSchema,
  MORTGAGE_MODULE_CONNECTIONS,
  MORTGAGE_SCHEMA_FIELD_MAP,
  MORTGAGE_SCHEMA_GROUPS,
  MORTGAGE_SCHEMA_TEMPLATE,
  MORTGAGE_SCHEMA_VERSION,
} from "./mortgageSchema";

export function getMortgageFoundation() {
  return {
    mortgageLoanTypes: MORTGAGE_LOAN_TYPE_REGISTRY,
    mortgageLoanTypeKeys: MORTGAGE_LOAN_TYPE_KEYS,
    mortgageLenders: MORTGAGE_LENDER_REGISTRY,
    mortgageLenderKeys: MORTGAGE_LENDER_KEYS,
    mortgageDocumentClasses: MORTGAGE_DOCUMENT_CLASS_REGISTRY,
    mortgageDocumentClassKeys: MORTGAGE_DOCUMENT_CLASS_KEYS,
    mortgageSchema: createEmptyMortgageSchema(),
    mortgageIntelligenceSchema: createEmptyMortgageIntelligenceSchema(),
    schemaGroups: MORTGAGE_SCHEMA_GROUPS,
    schemaFieldMap: MORTGAGE_SCHEMA_FIELD_MAP,
    schemaVersion: MORTGAGE_SCHEMA_VERSION,
    intelligenceGroups: MORTGAGE_INTELLIGENCE_GROUPS,
    intelligenceVersion: MORTGAGE_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: MORTGAGE_MODULE_CONNECTIONS,
  };
}

export {
  MORTGAGE_LOAN_TYPE_REGISTRY,
  MORTGAGE_LOAN_TYPE_KEYS,
  MORTGAGE_LENDER_REGISTRY,
  MORTGAGE_LENDER_KEYS,
  MORTGAGE_DOCUMENT_CLASS_REGISTRY,
  MORTGAGE_DOCUMENT_CLASS_KEYS,
  MORTGAGE_SCHEMA_GROUPS,
  MORTGAGE_SCHEMA_FIELD_MAP,
  MORTGAGE_SCHEMA_TEMPLATE,
  MORTGAGE_SCHEMA_VERSION,
  MORTGAGE_MODULE_CONNECTIONS,
  MORTGAGE_INTELLIGENCE_GROUPS,
  MORTGAGE_INTELLIGENCE_SCHEMA_VERSION,
  MORTGAGE_INTELLIGENCE_TEMPLATE,
  createEmptyMortgageSchema,
  createEmptyMortgageIntelligenceSchema,
  listMortgageLoanTypes,
  listMortgageLenders,
  listMortgageDocumentClasses,
  getMortgageLoanType,
  getMortgageLender,
  getMortgageDocumentClass,
};
