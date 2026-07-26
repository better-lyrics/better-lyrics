import type { DocumentPictureInPicture, PictureInPictureCapability } from "./types";

function isDocumentPictureInPicture<TWindow>(value: unknown): value is DocumentPictureInPicture<TWindow> {
  return (
    typeof value === "object" && value !== null && "requestWindow" in value && typeof value.requestWindow === "function"
  );
}

export function getPictureInPictureCapability<TWindow = Window>(host: object): PictureInPictureCapability<TWindow> {
  if (!("documentPictureInPicture" in host)) return { kind: "missing" };

  const candidate = host.documentPictureInPicture;
  if (!isDocumentPictureInPicture<TWindow>(candidate)) return { kind: "malformed" };
  return { kind: "supported", api: candidate };
}
