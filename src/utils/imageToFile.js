function resolveImageFetchPath(image) {
  return image?.webPath || image?.path || "";
}

export async function convertImageToFile(image) {
  const fetchPath = resolveImageFetchPath(image);
  if (!fetchPath) {
    throw new Error("Captured image path is unavailable.");
  }

  const response = await fetch(fetchPath);
  const blob = await response.blob();
  const extension = image?.format || "jpg";

  return new File([blob], `scan-${Date.now()}.${extension}`, {
    type: blob.type || "image/jpeg",
  });
}
