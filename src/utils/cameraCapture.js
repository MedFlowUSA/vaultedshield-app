import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export function isNativeCameraAvailable() {
  return Capacitor.isNativePlatform();
}

export async function captureDocumentPhoto(options = {}) {
  try {
    const image = await Camera.getPhoto({
      quality: options.quality ?? 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: options.source || CameraSource.Camera,
      promptLabelHeader: "Scan Document",
      promptLabelPhoto: "Take Photo",
      promptLabelPicture: "Choose Photo",
    });

    return image;
  } catch (error) {
    console.error("Camera capture failed:", error);
    throw error;
  }
}
