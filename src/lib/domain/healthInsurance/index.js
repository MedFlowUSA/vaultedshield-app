import {
  getHealthDocumentClass,
  listHealthDocumentClasses,
  HEALTH_DOCUMENT_CLASS_KEYS,
  HEALTH_DOCUMENT_CLASS_REGISTRY,
} from "./healthDocumentClasses";
import {
  getHealthCarrier,
  listHealthCarriers,
  HEALTH_CARRIER_KEYS,
  HEALTH_CARRIER_REGISTRY,
} from "./healthCarriers";
import {
  createEmptyHealthIntelligenceSchema,
  HEALTH_INTELLIGENCE_GROUPS,
  HEALTH_INTELLIGENCE_SCHEMA_VERSION,
  HEALTH_INTELLIGENCE_TEMPLATE,
} from "./healthIntelligenceSchema";
import {
  getHealthPlanType,
  listHealthPlanTypes,
  HEALTH_PLAN_TYPE_KEYS,
  HEALTH_PLAN_TYPE_REGISTRY,
} from "./healthPlanTypes";
import {
  createEmptyHealthSchema,
  HEALTH_MODULE_CONNECTIONS,
  HEALTH_SCHEMA_FIELD_MAP,
  HEALTH_SCHEMA_GROUPS,
  HEALTH_SCHEMA_TEMPLATE,
  HEALTH_SCHEMA_VERSION,
} from "./healthSchema";

export function getHealthFoundation() {
  return {
    healthPlanTypes: HEALTH_PLAN_TYPE_REGISTRY,
    healthPlanTypeKeys: HEALTH_PLAN_TYPE_KEYS,
    healthCarriers: HEALTH_CARRIER_REGISTRY,
    healthCarrierKeys: HEALTH_CARRIER_KEYS,
    healthDocumentClasses: HEALTH_DOCUMENT_CLASS_REGISTRY,
    healthDocumentClassKeys: HEALTH_DOCUMENT_CLASS_KEYS,
    healthSchema: createEmptyHealthSchema(),
    healthIntelligenceSchema: createEmptyHealthIntelligenceSchema(),
    schemaGroups: HEALTH_SCHEMA_GROUPS,
    schemaFieldMap: HEALTH_SCHEMA_FIELD_MAP,
    schemaVersion: HEALTH_SCHEMA_VERSION,
    intelligenceGroups: HEALTH_INTELLIGENCE_GROUPS,
    intelligenceVersion: HEALTH_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: HEALTH_MODULE_CONNECTIONS,
  };
}

export {
  HEALTH_PLAN_TYPE_REGISTRY,
  HEALTH_PLAN_TYPE_KEYS,
  HEALTH_CARRIER_REGISTRY,
  HEALTH_CARRIER_KEYS,
  HEALTH_DOCUMENT_CLASS_REGISTRY,
  HEALTH_DOCUMENT_CLASS_KEYS,
  HEALTH_SCHEMA_GROUPS,
  HEALTH_SCHEMA_FIELD_MAP,
  HEALTH_SCHEMA_TEMPLATE,
  HEALTH_SCHEMA_VERSION,
  HEALTH_MODULE_CONNECTIONS,
  HEALTH_INTELLIGENCE_GROUPS,
  HEALTH_INTELLIGENCE_SCHEMA_VERSION,
  HEALTH_INTELLIGENCE_TEMPLATE,
  createEmptyHealthSchema,
  createEmptyHealthIntelligenceSchema,
  listHealthPlanTypes,
  listHealthCarriers,
  listHealthDocumentClasses,
  getHealthPlanType,
  getHealthCarrier,
  getHealthDocumentClass,
};
