export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

const ALLOWED_MIME_TYPES = new Set(DOCUMENT_ACCEPT.split(","));
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);

export function validateDocumentFile(file) {
  if (!file) return { ok: false, message: "No file was selected." };
  if (file.size <= 0) return { ok: false, message: "This file is empty." };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: "This file is larger than the 25 MB upload limit." };
  }
  const mimeType = String(file.type || "").toLowerCase();
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_MIME_TYPES.has(mimeType) && !ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "Unsupported format. Upload a PDF, JPEG, PNG, WebP, HEIC, or HEIF document.",
    };
  }
  return { ok: true, message: "" };
}
