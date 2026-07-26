import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_DOCUMENT_BYTES, validateDocumentFile } from "../src/lib/uploads/fileValidation.js";
import { getAuthLandingState } from "../src/lib/auth/authLandingState.js";

const validPdf = validateDocumentFile({ name: "policy.pdf", type: "application/pdf", size: 1024 });
assert.equal(validPdf.ok, true);

const invalidExecutable = validateDocumentFile({ name: "policy.exe", type: "application/octet-stream", size: 1024 });
assert.equal(invalidExecutable.ok, false);

const oversized = validateDocumentFile({ name: "policy.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES + 1 });
assert.equal(oversized.ok, false);

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260725_close_anonymous_document_access.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /set public = false/i);
assert.match(migration, /to authenticated/i);
assert.doesNotMatch(migration, /to anon,\s*authenticated/i);
assert.match(migration, /revoke execute .* from anon/i);

const valuationProvider = fs.readFileSync(
  new URL("../src/lib/domain/propertyValuation/providers/realCompProvider.js", import.meta.url),
  "utf8"
);
assert.match(valuationProvider, /SIMULATED_FALLBACK \|\| "false"/);

const previousWindow = globalThis.window;
globalThis.window = {
  location: { search: "", hash: "#/login?type=recovery&access_token=test-token" },
};
assert.equal(getAuthLandingState().status, "password_recovery");
globalThis.window = previousWindow;

console.log("PASS production data and upload hardening defaults");
