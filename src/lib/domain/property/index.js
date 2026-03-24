import {
  getPropertyDocumentClass,
  listPropertyDocumentClasses,
  PROPERTY_DOCUMENT_CLASS_KEYS,
  PROPERTY_DOCUMENT_CLASS_REGISTRY,
} from "./propertyDocumentClasses";
import {
  createEmptyPropertyIntelligenceSchema,
  PROPERTY_INTELLIGENCE_GROUPS,
  PROPERTY_INTELLIGENCE_SCHEMA_VERSION,
  PROPERTY_INTELLIGENCE_TEMPLATE,
} from "./propertyIntelligenceSchema";
import {
  createEmptyPropertySchema,
  PROPERTY_MODULE_CONNECTIONS,
  PROPERTY_SCHEMA_FIELD_MAP,
  PROPERTY_SCHEMA_GROUPS,
  PROPERTY_SCHEMA_TEMPLATE,
  PROPERTY_SCHEMA_VERSION,
} from "./propertySchema";
import {
  getPropertyType,
  listPropertyTypes,
  PROPERTY_TYPE_KEYS,
  PROPERTY_TYPE_REGISTRY,
} from "./propertyTypes";

export function getPropertyFoundation() {
  return {
    propertyTypes: PROPERTY_TYPE_REGISTRY,
    propertyTypeKeys: PROPERTY_TYPE_KEYS,
    propertyDocumentClasses: PROPERTY_DOCUMENT_CLASS_REGISTRY,
    propertyDocumentClassKeys: PROPERTY_DOCUMENT_CLASS_KEYS,
    propertySchema: createEmptyPropertySchema(),
    propertyIntelligenceSchema: createEmptyPropertyIntelligenceSchema(),
    schemaGroups: PROPERTY_SCHEMA_GROUPS,
    schemaFieldMap: PROPERTY_SCHEMA_FIELD_MAP,
    schemaVersion: PROPERTY_SCHEMA_VERSION,
    intelligenceGroups: PROPERTY_INTELLIGENCE_GROUPS,
    intelligenceVersion: PROPERTY_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: PROPERTY_MODULE_CONNECTIONS,
  };
}

export {
  PROPERTY_TYPE_REGISTRY,
  PROPERTY_TYPE_KEYS,
  PROPERTY_DOCUMENT_CLASS_REGISTRY,
  PROPERTY_DOCUMENT_CLASS_KEYS,
  PROPERTY_SCHEMA_GROUPS,
  PROPERTY_SCHEMA_FIELD_MAP,
  PROPERTY_SCHEMA_TEMPLATE,
  PROPERTY_SCHEMA_VERSION,
  PROPERTY_MODULE_CONNECTIONS,
  PROPERTY_INTELLIGENCE_GROUPS,
  PROPERTY_INTELLIGENCE_SCHEMA_VERSION,
  PROPERTY_INTELLIGENCE_TEMPLATE,
  createEmptyPropertySchema,
  createEmptyPropertyIntelligenceSchema,
  listPropertyTypes,
  listPropertyDocumentClasses,
  getPropertyType,
  getPropertyDocumentClass,
};
