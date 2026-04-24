import { getSupabaseClient, isSupabaseConfigured } from "./client.js";

export const VAULTED_POLICY_FILES_BUCKET = "vaulted-policy-files";
export const VAULTED_PLATFORM_DOCUMENTS_BUCKET = "vaulted-platform-documents";

function sanitizeFileName(value) {
  return String(value || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildFallbackSignature(file, headBytes = []) {
  return [
    "fallback",
    file?.name || "unknown",
    file?.size || 0,
    file?.lastModified || 0,
    headBytes.join("-"),
  ].join(":");
}

export async function buildDocumentSourceHash(file) {
  if (!file) return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
      return `sha256:${bufferToHex(digest)}`;
    }

    const headBytes = Array.from(new Uint8Array(arrayBuffer.slice(0, Math.min(64, arrayBuffer.byteLength))));
    return buildFallbackSignature(file, headBytes);
  } catch {
    return buildFallbackSignature(file);
  }
}

export function buildDocumentVersionLabel({ documentRole, statementDate, existingVersionCount = 0 }) {
  const role = documentRole || "document";
  const datePart = statementDate || "undated";
  return `${role}-${datePart}-v${existingVersionCount + 1}`;
}

export function buildStoragePath({ policyId, documentRole, statementDate, sourceHash, fileName }) {
  const role = sanitizeFileName(documentRole || "document");
  const datePart = sanitizeFileName(statementDate || "undated");
  const hashPart = sanitizeFileName(sourceHash || "unhashed");
  const safeFileName = sanitizeFileName(fileName);
  return `${policyId}/${role}/${datePart}/${hashPart}/${safeFileName}`;
}

async function uploadFileToBucket({
  file,
  baseId,
  documentRole,
  statementDate,
  sourceHash,
  storageBucket,
}) {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return {
      attempted: false,
      succeeded: false,
      storageBucket: null,
      storagePath: null,
      errorSummary: "Supabase storage is not configured.",
    };
  }

  if (!file || !baseId) {
    return {
      attempted: false,
      succeeded: false,
      storageBucket,
      storagePath: null,
      errorSummary: "Original file or policy id missing.",
    };
  }

  const storagePath = buildStoragePath({
    policyId: baseId,
    documentRole,
    statementDate,
    sourceHash,
    fileName: file.name,
  });

  const { error } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, file, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });

  if (error && !/already exists/i.test(error.message || "")) {
    return {
      attempted: true,
      succeeded: false,
      storageBucket,
      storagePath,
      errorSummary: error.message || "Storage upload failed.",
    };
  }

  return {
    attempted: true,
    succeeded: true,
    storageBucket,
    storagePath,
    mimeType: file.type || "application/pdf",
    errorSummary: "",
  };
}

export async function uploadVaultedDocumentFile({
  file,
  policyId,
  documentRole,
  statementDate,
  sourceHash,
}) {
  return uploadFileToBucket({
    file,
    baseId: policyId,
    documentRole,
    statementDate,
    sourceHash,
    storageBucket: VAULTED_POLICY_FILES_BUCKET,
  });
}

export async function uploadPlatformDocumentFile({
  file,
  householdId,
  documentRole,
  sourceHash,
}) {
  return uploadFileToBucket({
    file,
    baseId: householdId,
    documentRole,
    statementDate: null,
    sourceHash,
    storageBucket: VAULTED_PLATFORM_DOCUMENTS_BUCKET,
  });
}
