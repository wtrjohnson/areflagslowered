import type { Metadata } from "next";
import { ContentPage } from "../../components/content-page.tsx";
import { siteOrigin } from "../../lib/site-url.ts";

const questions = [
  ["Are flags at half-staff today?", "Use the status checker to see the current U.S. flag status and the status for your selected state or territory. Orders can change during the day."],
  ["Why are flags lowered?", "Flags are commonly lowered to honor the death of a public official, member of the military, first responder, or other person or group named in an official order."],
  ["Who can order flags lowered?", "For the U.S. flag, the President and governors have authority in different circumstances. A local or institutional flag display may also follow its own controlling policy."],
  ["Do recurring observances always mean flags are lowered?", "No. A commemorative observance does not automatically create a current order. Check the applicable official instruction and its dates."],
  ["How long do flags stay at half-staff?", "The duration is set by the applicable order. It may be a single day, a range of dates, a time of day, or until further notice."],
  ["What should I do if this site is wrong?", "Please use the feedback button on the status page and include the official source or correction. We review reports and update confirmed information."],
];

export const metadata: Metadata = { title: "Flag status FAQ", description: "Answers to common questions about half-staff and half-mast orders, timing, authority, and correct flag display." };

export default function FaqPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) };
  return <ContentPage title="Flag status FAQ"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />{questions.map(([question, answer]) => <section className="faq-item" key={question}><h2>{question}</h2><p>{answer}</p></section>)}<p><a href={siteOrigin()}>Check the current flag status.</a></p></ContentPage>;
}
