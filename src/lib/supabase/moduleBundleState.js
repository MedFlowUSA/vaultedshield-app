export function buildBundleWarnings(entries = []) {
  return entries
    .filter((entry) => entry?.error)
    .map((entry) => ({
      area: entry.area,
      message: entry.error?.message || `${entry.label || entry.area || "Bundle data"} could not be loaded.`,
    }));
}

export function assembleModuleBundle({
  coreResult,
  coreKey,
  missingMessage,
  collections = [],
}) {
  const normalizedCoreResult = coreResult || { data: null, error: null };
  const fatalError =
    normalizedCoreResult.error || (!normalizedCoreResult.data ? new Error(missingMessage) : null);
  const bundleWarnings = buildBundleWarnings(
    collections.map((entry) => ({
      area: entry.area,
      label: entry.label,
      error: entry.result?.error || null,
    }))
  );

  if (fatalError) {
    return {
      data: null,
      error: fatalError,
    };
  }

  const bundleData = {
    [coreKey]: normalizedCoreResult.data,
    bundleWarnings,
    isPartialBundle: bundleWarnings.length > 0,
  };

  collections.forEach((entry) => {
    bundleData[entry.key] = entry.result?.data || entry.fallbackData || [];
  });

  return {
    data: bundleData,
    error: null,
  };
}
