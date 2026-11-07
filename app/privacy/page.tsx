import type { Metadata } from "next";
import { ContentPage } from "../../components/content-page.tsx";

export const metadata: Metadata = { title: "Privacy", description: "Privacy information for Are Flags Lowered?, including the optional feedback form." };

export default function PrivacyPage() {
  return <ContentPage title="Privacy"><p>Are Flags Lowered? does not require an account to check flag status. The site stores your selected state locally in your browser so it can be shown when you return.</p><h2>Feedback</h2><p>If you submit feedback, we collect your message and any optional name and email address you provide. We use that information to review the report and, if needed, reply. Feedback submissions are deleted after 90 days.</p><h2>Sharing</h2><p>We do not sell personal information. We only share information when necessary to operate the service, comply with law, or protect the site and its users.</p><h2>Changes</h2><p>We may update this page as the service changes. The current version will always be available here.</p></ContentPage>;
}
