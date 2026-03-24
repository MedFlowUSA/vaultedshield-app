import {
  getAutoDocumentClass,
  listAutoDocumentClasses,
  AUTO_DOCUMENT_CLASS_KEYS,
  AUTO_DOCUMENT_CLASS_REGISTRY,
} from "./autoDocumentClasses";
import {
  getAutoCarrier,
  listAutoCarriers,
  AUTO_CARRIER_KEYS,
  AUTO_CARRIER_REGISTRY,
} from "./autoCarriers";
import {
  createEmptyAutoIntelligenceSchema,
  AUTO_INTELLIGENCE_GROUPS,
  AUTO_INTELLIGENCE_SCHEMA_VERSION,
  AUTO_INTELLIGENCE_TEMPLATE,
} from "./autoIntelligenceSchema";
import {
  getAutoPolicyType,
  listAutoPolicyTypes,
  AUTO_POLICY_TYPE_KEYS,
  AUTO_POLICY_TYPE_REGISTRY,
} from "./autoPolicyTypes";
import {
  createEmptyAutoSchema,
  AUTO_MODULE_CONNECTIONS,
  AUTO_SCHEMA_FIELD_MAP,
  AUTO_SCHEMA_GROUPS,
  AUTO_SCHEMA_TEMPLATE,
  AUTO_SCHEMA_VERSION,
} from "./autoSchema";

export function getAutoFoundation() {
  return {
    autoPolicyTypes: AUTO_POLICY_TYPE_REGISTRY,
    autoPolicyTypeKeys: AUTO_POLICY_TYPE_KEYS,
    autoCarriers: AUTO_CARRIER_REGISTRY,
    autoCarrierKeys: AUTO_CARRIER_KEYS,
    autoDocumentClasses: AUTO_DOCUMENT_CLASS_REGISTRY,
    autoDocumentClassKeys: AUTO_DOCUMENT_CLASS_KEYS,
    autoSchema: createEmptyAutoSchema(),
    autoIntelligenceSchema: createEmptyAutoIntelligenceSchema(),
    schemaGroups: AUTO_SCHEMA_GROUPS,
    schemaFieldMap: AUTO_SCHEMA_FIELD_MAP,
    schemaVersion: AUTO_SCHEMA_VERSION,
    intelligenceGroups: AUTO_INTELLIGENCE_GROUPS,
    intelligenceVersion: AUTO_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: AUTO_MODULE_CONNECTIONS,
  };
}

export {
  AUTO_POLICY_TYPE_REGISTRY,
  AUTO_POLICY_TYPE_KEYS,
  AUTO_CARRIER_REGISTRY,
  AUTO_CARRIER_KEYS,
  AUTO_DOCUMENT_CLASS_REGISTRY,
  AUTO_DOCUMENT_CLASS_KEYS,
  AUTO_SCHEMA_GROUPS,
  AUTO_SCHEMA_FIELD_MAP,
  AUTO_SCHEMA_TEMPLATE,
  AUTO_SCHEMA_VERSION,
  AUTO_MODULE_CONNECTIONS,
  AUTO_INTELLIGENCE_GROUPS,
  AUTO_INTELLIGENCE_SCHEMA_VERSION,
  AUTO_INTELLIGENCE_TEMPLATE,
  createEmptyAutoSchema,
  createEmptyAutoIntelligenceSchema,
  listAutoPolicyTypes,
  listAutoCarriers,
  listAutoDocumentClasses,
  getAutoPolicyType,
  getAutoCarrier,
  getAutoDocumentClass,
};
