import React from "react";
import { ImageResponse } from "next/og";
import { getRuntimeDb } from "../../../../lib/runtime-db.ts";
import { jurisdictionFromImageAsset, previewForJurisdiction, validShareToken, type PreviewStatus } from "../../../../lib/social-preview.ts";
import { siteOrigin } from "../../../../lib/site-url.ts";
import { previewFlagPresentation, previewGeometry } from "../../../../lib/preview-image.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function flagGroup(src: string, status: PreviewStatus) {
  const presentation = previewFlagPresentation(status);
  return React.createElement("div", {
    style: { display: "flex", position: "relative", width: previewGeometry.flagWidth + previewGeometry.poleWidth, height: previewGeometry.poleHeight },
  },
  React.createElement("div", {
    style: { position: "absolute", left: 0, top: 0, width: previewGeometry.poleWidth, height: previewGeometry.poleHeight, borderRadius: "10px 10px 0 0", background: "#111111" },
  }),
  React.createElement("img", {
    src,
    width: previewGeometry.flagWidth,
    height: previewGeometry.flagHeight,
    alt: "",
    style: {
      display: "block",
      position: "absolute",
      left: previewGeometry.poleWidth,
      top: presentation.offset,
      width: previewGeometry.flagWidth,
      height: previewGeometry.flagHeight,
      objectFit: "fill",
      opacity: presentation.opacity,
    },
  }));
}

export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const jurisdiction = jurisdictionFromImageAsset((await params).asset);
  if (!jurisdiction) return new Response("Not found", { status: 404 });
  const share = new URL(request.url).searchParams.get("share") || undefined;
  if (share && !validShareToken(share)) return new Response("Not found", { status: 404 });
  const preview = await previewForJurisdiction(await getRuntimeDb(), jurisdiction, share);
  if (!preview) return new Response("Not found", { status: 404 });
  const origin = siteOrigin();
  const image = React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      gap: previewGeometry.groupGap,
      background: "#f8f8f6",
    },
  },
  flagGroup(`${origin}/flags/us-preview.svg`, preview.usStatus),
  flagGroup(`${origin}${jurisdiction.flagAsset}`, preview.stateStatus));
  return new ImageResponse(image, {
    width: previewGeometry.width,
    height: previewGeometry.height,
    headers: {
      "cache-control": share ? "public, max-age=31536000, immutable" : "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
