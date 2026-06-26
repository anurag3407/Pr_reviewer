import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autoheal · AI code review that reads your whole codebase",
  description:
    "Connect a repo, and on every pull request Autoheal reviews the diff with full-codebase context — " +
    "ranks each finding by severity, flags the PR SAFE/UNSAFE, and can fix it and re-scan until it's safe. " +
    "Powered by MiMo-V2.5-Pro (1M-token context).",
};

// Tint the Clerk widgets to match the ultra-dark glassmorphism shell.
const clerkAppearance = {
  variables: {
    colorBackground: "#0a0c11",
    colorPrimary: "#2fe3a0",
    colorText: "#e9eef6",
    colorTextSecondary: "#99a2b4",
    colorInputBackground: "#0f1218",
    colorInputText: "#e9eef6",
    borderRadius: "10px",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
    >
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* Loaded at runtime — no build-time network dependency; falls back to
              the stacks in globals.css when offline. */}
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
