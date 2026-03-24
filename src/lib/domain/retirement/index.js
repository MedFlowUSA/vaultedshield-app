import {
  RETIREMENT_DOCUMENT_CLASS_REGISTRY,
  RETIREMENT_DOCUMENT_CLASS_KEYS,
  getRetirementDocumentClass,
  listRetirementDocumentClasses,
} from "./retirementDocumentClasses";
import {
  RETIREMENT_PROVIDER_REGISTRY,
  RETIREMENT_PROVIDER_KEYS,
  getRetirementProvider,
  listRetirementProviders,
} from "./retirementProviders";
import {
  createEmptyRetirementIntelligenceSchema,
  RETIREMENT_INTELLIGENCE_GROUPS,
  RETIREMENT_INTELLIGENCE_SCHEMA_VERSION,
  RETIREMENT_INTELLIGENCE_TEMPLATE,
} from "./retirementIntelligenceSchema";
import {
  createEmptyRetirementSchema,
  RETIREMENT_MODULE_CONNECTIONS,
  RETIREMENT_SCHEMA_FIELD_MAP,
  RETIREMENT_SCHEMA_GROUPS,
  RETIREMENT_SCHEMA_TEMPLATE,
  RETIREMENT_SCHEMA_VERSION,
} from "./retirementSchema";
import {
  getRetirementType,
  RETIREMENT_TYPE_KEYS,
  RETIREMENT_TYPE_REGISTRY,
  listRetirementTypes,
} from "./retirementTypes";

export function getRetirementFoundation() {
  return {
    retirementTypes: RETIREMENT_TYPE_REGISTRY,
    retirementTypeKeys: RETIREMENT_TYPE_KEYS,
    retirementProviders: RETIREMENT_PROVIDER_REGISTRY,
    retirementProviderKeys: RETIREMENT_PROVIDER_KEYS,
    retirementDocumentClasses: RETIREMENT_DOCUMENT_CLASS_REGISTRY,
    retirementDocumentClassKeys: RETIREMENT_DOCUMENT_CLASS_KEYS,
    retirementSchema: createEmptyRetirementSchema(),
    retirementIntelligenceSchema: createEmptyRetirementIntelligenceSchema(),
    schemaGroups: RETIREMENT_SCHEMA_GROUPS,
    schemaFieldMap: RETIREMENT_SCHEMA_FIELD_MAP,
    schemaVersion: RETIREMENT_SCHEMA_VERSION,
    intelligenceGroups: RETIREMENT_INTELLIGENCE_GROUPS,
    intelligenceVersion: RETIREMENT_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: RETIREMENT_MODULE_CONNECTIONS,
  };
}

export {
  RETIREMENT_TYPE_REGISTRY,
  RETIREMENT_TYPE_KEYS,
  RETIREMENT_PROVIDER_REGISTRY,
  RETIREMENT_PROVIDER_KEYS,
  RETIREMENT_DOCUMENT_CLASS_REGISTRY,
  RETIREMENT_DOCUMENT_CLASS_KEYS,
  RETIREMENT_SCHEMA_GROUPS,
  RETIREMENT_SCHEMA_FIELD_MAP,
  RETIREMENT_SCHEMA_TEMPLATE,
  RETIREMENT_SCHEMA_VERSION,
  RETIREMENT_MODULE_CONNECTIONS,
  RETIREMENT_INTELLIGENCE_GROUPS,
  RETIREMENT_INTELLIGENCE_SCHEMA_VERSION,
  RETIREMENT_INTELLIGENCE_TEMPLATE,
  createEmptyRetirementSchema,
  createEmptyRetirementIntelligenceSchema,
  listRetirementTypes,
  listRetirementProviders,
  listRetirementDocumentClasses,
  getRetirementType,
  getRetirementProvider,
  getRetirementDocumentClass,
};
