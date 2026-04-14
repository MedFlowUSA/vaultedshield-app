import { findExistingHouseholdIssueByIdentity, upsertHouseholdIssue } from "../../supabase/issueData.js";
import { buildDetectedIssues } from "./buildDetectedIssues.js";

function buildSyncError(issue, processedCount, error) {
  const description = [
    issue?.module_key || "unknown-module",
    issue?.issue_type || "unknown-type",
    issue?.issue_key || "unknown-key",
    issue?.asset_id || "asset:null",
    issue?.record_id || "record:null",
  ].join(" | ");
  const syncError = new Error(
    `VaultedShield could not sync detected household issue ${description} after processing ${processedCount} item${processedCount === 1 ? "" : "s"}. ${error?.message || ""}`.trim()
  );
  syncError.cause = error;
  syncError.issue = issue;
  syncError.processedCount = processedCount;
  return syncError;
}

export async function syncDetectedIssues(context = {}, options = {}) {
  const detectedIssues = buildDetectedIssues(context);
  const results = {
    createdCount: 0,
    updatedCount: 0,
    reopenedCount: 0,
    totalProcessed: 0,
    issues: [],
  };

  for (const issue of detectedIssues) {
    try {
      const existingIssue = await findExistingHouseholdIssueByIdentity(issue, options);
      const syncedIssue = await upsertHouseholdIssue(issue, options);

      if (!existingIssue) {
        results.createdCount += 1;
      } else if (existingIssue.status === "open") {
        results.updatedCount += 1;
      } else if (existingIssue.status === "resolved" || existingIssue.status === "ignored") {
        results.reopenedCount += 1;
      } else {
        results.updatedCount += 1;
      }

      results.totalProcessed += 1;
      results.issues.push(syncedIssue);
    } catch (error) {
      throw buildSyncError(issue, results.totalProcessed, error);
    }
  }

  return results;
}
