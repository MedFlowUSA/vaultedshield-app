import {
  getWarrantyDocumentClass,
  listWarrantyDocumentClasses,
  WARRANTY_DOCUMENT_CLASS_KEYS,
  WARRANTY_DOCUMENT_CLASS_REGISTRY,
} from "./warrantyDocumentClasses";
import {
  getWarrantyProvider,
  listWarrantyProviders,
  WARRANTY_PROVIDER_KEYS,
  WARRANTY_PROVIDER_REGISTRY,
} from "./warrantyProviders";
import {
  createEmptyWarrantyIntelligenceSchema,
  WARRANTY_INTELLIGENCE_GROUPS,
  WARRANTY_INTELLIGENCE_SCHEMA_VERSION,
  WARRANTY_INTELLIGENCE_TEMPLATE,
} from "./warrantyIntelligenceSchema";
import {
  getWarrantyType,
  listWarrantyTypes,
  WARRANTY_TYPE_KEYS,
  WARRANTY_TYPE_REGISTRY,
} from "./warrantyTypes";
import {
  createEmptyWarrantySchema,
  WARRANTY_MODULE_CONNECTIONS,
  WARRANTY_SCHEMA_FIELD_MAP,
  WARRANTY_SCHEMA_GROUPS,
  WARRANTY_SCHEMA_TEMPLATE,
  WARRANTY_SCHEMA_VERSION,
} from "./warrantySchema";

export function getWarrantyFoundation() {
  return {
    warrantyTypes: WARRANTY_TYPE_REGISTRY,
    warrantyTypeKeys: WARRANTY_TYPE_KEYS,
    warrantyProviders: WARRANTY_PROVIDER_REGISTRY,
    warrantyProviderKeys: WARRANTY_PROVIDER_KEYS,
    warrantyDocumentClasses: WARRANTY_DOCUMENT_CLASS_REGISTRY,
    warrantyDocumentClassKeys: WARRANTY_DOCUMENT_CLASS_KEYS,
    warrantySchema: createEmptyWarrantySchema(),
    warrantyIntelligenceSchema: createEmptyWarrantyIntelligenceSchema(),
    schemaGroups: WARRANTY_SCHEMA_GROUPS,
    schemaFieldMap: WARRANTY_SCHEMA_FIELD_MAP,
    schemaVersion: WARRANTY_SCHEMA_VERSION,
    intelligenceGroups: WARRANTY_INTELLIGENCE_GROUPS,
    intelligenceVersion: WARRANTY_INTELLIGENCE_SCHEMA_VERSION,
    moduleConnections: WARRANTY_MODULE_CONNECTIONS,
  };
}

export {
  WARRANTY_TYPE_REGISTRY,
  WARRANTY_TYPE_KEYS,
  WARRANTY_PROVIDER_REGISTRY,
  WARRANTY_PROVIDER_KEYS,
  WARRANTY_DOCUMENT_CLASS_REGISTRY,
  WARRANTY_DOCUMENT_CLASS_KEYS,
  WARRANTY_SCHEMA_GROUPS,
  WARRANTY_SCHEMA_FIELD_MAP,
  WARRANTY_SCHEMA_TEMPLATE,
  WARRANTY_SCHEMA_VERSION,
  WARRANTY_MODULE_CONNECTIONS,
  WARRANTY_INTELLIGENCE_GROUPS,
  WARRANTY_INTELLIGENCE_SCHEMA_VERSION,
  WARRANTY_INTELLIGENCE_TEMPLATE,
  createEmptyWarrantySchema,
  createEmptyWarrantyIntelligenceSchema,
  listWarrantyTypes,
  listWarrantyProviders,
  listWarrantyDocumentClasses,
  getWarrantyType,
  getWarrantyProvider,
  getWarrantyDocumentClass,
};
