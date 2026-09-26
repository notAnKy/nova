import type { Metadata } from "next";
import "./globals.css";
import { EscapeNavigation } from "@/features/shell/escape-navigation";

export const metadata: Metadata = {
  title: "Nova — Workspace",
  description: "A calm space for teams to talk and make progress.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><EscapeNavigation />{children}</body></html>;
}
