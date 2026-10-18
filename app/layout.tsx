import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Are Flags Lowered?",
  description: "Find out why flags are at half-mast and whether yours should be lowered today.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
