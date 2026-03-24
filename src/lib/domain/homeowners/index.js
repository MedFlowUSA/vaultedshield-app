import {
  HOMEOWNERS_CARRIER_KEYS,
  HOMEOWNERS_CARRIER_REGISTRY,
  getHomeownersCarrier,
  listHomeownersCarriers,
} from "./homeownersCarriers";
import {
  HOMEOWNERS_DOCUMENT_CLASS_KEYS,
  HOMEOWNERS_DOCUMENT_CLASS_REGISTRY,
  getHomeownersDocumentClass,
  listHomeownersDocumentClasses,
} from "./homeownersDocumentClasses";
import {
  createEmptyHomeownersIntelligenceSchema,
  HOMEOWNERS_INTELLIGENCE_GROUPS,
  HOMEOWNERS_INTELLIGENCE_SCHEMA_VERSION,
  HOMEOWNERS_INTELLIGENCE_TEMPLATE,
} from "./homeownersIntelligenceSchema";
import {
  HOMEOWNERS_MODULE_CONNECTIONS,
  HOMEOWNERS_SCHEMA_FIELD_MAP,
  HOMEOWNERS_SCHEMA_GROUPS,
  HOMEOWNERS_SCHEMA_TEMPLATE,
  HOMEOWNERS_SCHEMA_VERSION,
  createEmptyHomeownersSchema,
} from "./homeownersSchema";
import {
  getHomeownersPolicyType,
  HOMEOWNERS_POLICY_TYPE_KEYS,
  HOMEOWNERS_POLICY_TYPE_REGISTRY,
  listHomeownersPolicyTypes,
} from "./homeownersPolicyTypes";

export function getHomeownersFoundation() {
  return {
    homeownersPolicyTypes: HOMEOWNERS_POLICY_TYPE_REGISTRY,
    homeownersPolicyTypeKeys: HOMEOWNERS_POLICY_TYPE_KEYS,
    homeownersCarriers: HOMEOWNERS_CARRIER_REGISTRY,
    homeownersCarrierKeys: HOMEOWNERS_CARRIER_KEYS,
    homeownersDocumentClasses: HOMEOWNERS_DOCUMENT_CLASS_REGISTRY,
    homeownersDocumentClassKeys: HOMEOWNERS_DOCUMENT_CLASS_KEYS,
    homeownersSchema: createEmptyHomeownersSchema(),
    homeownersIntelligenceSchema: createEmptyHomeownersIntelligenceSchema(),
    schemaGroups: HOMEOWNERS_SCHEMA_GROUPS,
    schemaFieldMap: HOMEOWNERS_SCHEMA_FIELD_MAP,
    schemaVersion: HOMEOWNERS_SCHEMA_VERSION,
    intelligenceGroups: HOMEOWNERS_INTELLIGENCE_GROUPS,
    intelligenceVersion: HOMEOWNERS_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: HOMEOWNERS_MODULE_CONNECTIONS,
  };
}

export {
  HOMEOWNERS_POLICY_TYPE_REGISTRY,
  HOMEOWNERS_POLICY_TYPE_KEYS,
  HOMEOWNERS_CARRIER_REGISTRY,
  HOMEOWNERS_CARRIER_KEYS,
  HOMEOWNERS_DOCUMENT_CLASS_REGISTRY,
  HOMEOWNERS_DOCUMENT_CLASS_KEYS,
  HOMEOWNERS_SCHEMA_GROUPS,
  HOMEOWNERS_SCHEMA_FIELD_MAP,
  HOMEOWNERS_SCHEMA_TEMPLATE,
  HOMEOWNERS_SCHEMA_VERSION,
  HOMEOWNERS_MODULE_CONNECTIONS,
  HOMEOWNERS_INTELLIGENCE_GROUPS,
  HOMEOWNERS_INTELLIGENCE_SCHEMA_VERSION,
  HOMEOWNERS_INTELLIGENCE_TEMPLATE,
  createEmptyHomeownersSchema,
  createEmptyHomeownersIntelligenceSchema,
  listHomeownersPolicyTypes,
  listHomeownersCarriers,
  listHomeownersDocumentClasses,
  getHomeownersPolicyType,
  getHomeownersCarrier,
  getHomeownersDocumentClass,
};
