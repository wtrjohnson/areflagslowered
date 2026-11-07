import type { Metadata } from "next";
import { ContentPage } from "../../components/content-page.tsx";

export const metadata: Metadata = { title: "How we verify flag-lowering orders", description: "How Are Flags Lowered? reviews official half-staff and half-mast orders before showing a current status." };

export default function HowWeVerifyPage() {
  return <ContentPage title="How we verify flag-lowering orders">
    <p>Are Flags Lowered? is designed to make official flag-lowering information easier to check. We treat official proclamations, executive orders, and agency announcements as the source of record.</p>
    <h2>Our review process</h2>
    <ol><li>We collect announcements from official government sources and incoming notices.</li><li>We identify the jurisdiction, flag affected, reason, and effective start and end of the order.</li><li>We review the order before it is reflected in the public status.</li><li>We update or remove a result when an official correction, cancellation, or expiration is confirmed.</li></ol>
    <h2>What the status means</h2>
    <p>A “half-mast” result means an active order applies to the flag and location shown. “Full mast” means we have not found an active applicable order. “Needs review” means the available information is not clear enough to give a definitive answer.</p>
    <h2>Limits</h2>
    <p>Orders can be issued, changed, or clarified at any time. This site is a guide, not the controlling authority. When it matters, confirm the current instruction with the issuing government office.</p>
  </ContentPage>;
}
