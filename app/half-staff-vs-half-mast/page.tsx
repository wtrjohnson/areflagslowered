import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "../../components/content-page.tsx";

export const metadata: Metadata = { title: "Half-staff vs. half-mast", description: "Learn the difference between half-staff and half-mast, and how to display a flag correctly during a lowering order." };

export default function HalfStaffPage() {
  return <ContentPage title="Half-staff vs. half-mast">
    <p>The terms describe the same respectful flag position. “Half-staff” is commonly used for flags displayed on land; “half-mast” is commonly used for flags on ships and at sea. In everyday use, people often use either term.</p>
    <h2>How to display a flag at half-staff</h2>
    <ol><li>Raise the flag briskly to the peak of the staff.</li><li>Lower it ceremoniously to a position about halfway down the staff.</li><li>At the end of the day, raise it to the peak again before lowering it for removal.</li></ol>
    <p>Follow the wording, dates, times, and flags covered by the specific order. A state order may apply to a state flag, the U.S. flag, or both.</p>
    <p><Link href="/">Check the current status for the United States or your state.</Link></p>
  </ContentPage>;
}
