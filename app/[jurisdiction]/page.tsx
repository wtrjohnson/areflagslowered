import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Home from "../page.tsx";
import { jurisdictionBySlug } from "../../lib/jurisdictions.ts";
import { getRuntimeDb } from "../../lib/runtime-db.ts";
import { previewAltText, previewForJurisdiction, previewTitle, validShareToken } from "../../lib/social-preview.ts";
import { previewImageUrl } from "../../lib/share-preview-core.ts";
import { siteOrigin } from "../../lib/site-url.ts";
import { currentPublicStatus } from "../../lib/current-status.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ jurisdiction: string }>;
  searchParams: Promise<{ share?: string | string[] }>;
};

async function pageContext({ params, searchParams }: PageProps) {
  const { jurisdiction: slug } = await params;
  const jurisdiction = jurisdictionBySlug(slug);
  if (!jurisdiction) notFound();
  const rawShare = (await searchParams).share;
  const share = typeof rawShare === "string" ? rawShare : undefined;
  if (rawShare !== undefined && (!share || !validShareToken(share))) notFound();
  const preview = share ? await previewForJurisdiction(await getRuntimeDb(), jurisdiction, share) : undefined;
  if (share && !preview) notFound();
  return { jurisdiction, preview, share };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { jurisdiction, preview: savedPreview, share } = await pageContext(props);
  let preview = savedPreview;
  if (!preview) {
    try {
      preview = await previewForJurisdiction(await getRuntimeDb(), jurisdiction);
    } catch {
      preview = { token: "", socialDraftId: "", jurisdictionId: jurisdiction.id,
        usStatus: "uncertain" as const, stateStatus: "uncertain" as const, createdAt: new Date() };
    }
  }
  const origin = siteOrigin();
  const cleanUrl = `${origin}/${jurisdiction.slug}`;
  const socialUrl = share ? `${cleanUrl}?share=${encodeURIComponent(share)}` : cleanUrl;
  const imageUrl = previewImageUrl(origin, jurisdiction.slug, share);
  const alt = previewAltText(jurisdiction, preview.usStatus, preview.stateStatus);
  const title = previewTitle(jurisdiction, preview.usStatus, preview.stateStatus);
  const description = `Current U.S. and ${jurisdiction.name} flag status.`;
  return {
    title,
    description,
    alternates: { canonical: cleanUrl },
    openGraph: {
      type: "website",
      url: socialUrl,
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, alt }],
    },
  };
}

export default async function JurisdictionPage(props: PageProps) {
  const { jurisdiction } = await pageContext(props);
  const initialAnswer = await currentPublicStatus(jurisdiction);
  const origin = siteOrigin();
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: `Are flags lowered in ${jurisdiction.name}?`, url: `${origin}/${jurisdiction.slug}`, description: `Current U.S. and ${jurisdiction.name} flag status.` },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Are Flags Lowered?", item: origin }, { "@type": "ListItem", position: 2, name: jurisdiction.name, item: `${origin}/${jurisdiction.slug}` }] },
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><Home initialStateCode={jurisdiction.stateCode} initialAnswer={initialAnswer} /></>;
}
