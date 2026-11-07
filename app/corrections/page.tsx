import type { Metadata } from "next";
import { ContentPage } from "../../components/content-page.tsx";

export const metadata: Metadata = { title: "Corrections policy", description: "How to report an error or submit an official correction to Are Flags Lowered?" };

export default function CorrectionsPage() {
  return <ContentPage title="Corrections policy"><p>Accuracy matters when people rely on an active flag-lowering order. If you find an error, omission, expired order, or official correction, use the feedback button on the status page.</p><p>Please include the state or jurisdiction, the affected date, and a link to the official proclamation, executive order, or agency announcement when available. We review reports against the issuing authority and correct confirmed information as promptly as possible.</p><p>We may mark a result “Needs review” while details are being verified rather than guessing.</p></ContentPage>;
}
