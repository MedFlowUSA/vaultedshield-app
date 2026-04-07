import { buildHouseholdRiskContinuityMap } from ".";
import { annotateReviewWorkflowItems } from "./reviewWorkflowState";
import {
  buildAssetReviewQueueItems,
  buildAutoReviewQueueItems,
  buildHealthReviewQueueItems,
  buildHomeownersReviewQueueItems,
  buildPropertyReviewQueueItems,
  buildRetirementReviewQueueItems,
  buildWarrantyReviewQueueItems,
} from "./reviewQueue";

export function buildHouseholdReviewQueueItems({
  bundle = {},
  intelligence = null,
  savedPolicyRows = [],
  reviewWorkflowState = {},
} = {}) {
  const householdMap = buildHouseholdRiskContinuityMap(bundle || {}, intelligence, savedPolicyRows || []);
  const queueItems = annotateReviewWorkflowItems(
    [
      ...(householdMap?.review_priorities || []),
      ...buildAssetReviewQueueItems(bundle || {}),
      ...buildAutoReviewQueueItems(bundle || {}),
      ...buildHealthReviewQueueItems(bundle || {}),
      ...buildHomeownersReviewQueueItems(bundle || {}),
      ...buildPropertyReviewQueueItems(bundle || {}),
      ...buildRetirementReviewQueueItems(bundle || {}),
      ...buildWarrantyReviewQueueItems(bundle || {}),
    ],
    reviewWorkflowState || {}
  );

  return {
    householdMap,
    queueItems,
  };
}
