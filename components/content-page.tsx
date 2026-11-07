import type { ReactNode } from "react";
import Link from "next/link";

export function ContentPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="content-page"><header className="content-header"><Link className="content-brand" href="/">AreFlagsLowered?</Link></header><article><h1>{title}</h1>{children}</article><footer className="site-footer"><p>Current flag status can change quickly. Follow the applicable official order for your location.</p><nav aria-label="Site information"><Link href="/">Check flag status</Link></nav></footer></main>;
}
