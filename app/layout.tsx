import type { Metadata } from "next";
import "./globals.css";
import { siteOrigin } from "../lib/site-url.ts";

const origin = siteOrigin();
const title = "Are flags lowered today? Current U.S. half-staff status";
const description = "Check whether U.S. and state flags are at half-staff today, why they were lowered, and when the order ends.";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: { default: title, template: "%s | Are Flags Lowered?" },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "Are Flags Lowered?", title, description },
  twitter: { card: "summary", title, description },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Are Flags Lowered?", url: origin, description }, { "@type": "Organization", name: "Are Flags Lowered?", url: origin }] };
  return <html lang="en"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />{children}</body></html>;
}
