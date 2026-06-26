import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autoheal · operator console",
  description:
    "Autonomous PR healing — test, diagnose, fix, retry. State memory on a live Lemma pod.",
};

import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* Loaded by the browser at runtime — no build-time network dependency.
              Falls back to the stacks in globals.css when offline. */}
          <link
            href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>
          <div className="grain" aria-hidden="true" />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
