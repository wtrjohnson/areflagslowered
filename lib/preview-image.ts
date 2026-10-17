import type { PreviewStatus } from "./share-preview-core.ts";

export const previewGeometry = {
  width: 1200,
  height: 630,
  flagWidth: 405,
  flagHeight: 405 * 350 / 559,
  poleWidth: 12,
  poleHeight: 405,
  groupGap: 180,
} as const;

export function previewFlagPresentation(status: PreviewStatus) {
  if (status === "half_mast") return { offset: (previewGeometry.poleHeight - previewGeometry.flagHeight) / 2, opacity: 1 };
  if (status === "uncertain") return { offset: 63, opacity: 0.45 };
  return { offset: 0, opacity: 1 };
}
