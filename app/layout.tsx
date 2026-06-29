import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoHeal · Autonomous Pipeline Healing. Zero Downtime.",
  description:
    "AutoHeal is a multi-agent CI/CD engineer that automatically triages, repairs, and commits fixes " +
    "for broken builds. It monitors your pipeline, isolates the faulty commit, and runs a self-correction " +
    "loop up to 5 times — escalating to a human only for complex architectural decisions. Ship resilient " +
    "software faster, with absolute confidence.",
};

// Tint the Clerk widgets to match the ultra-dark glassmorphism shell.
// The card is deliberately a few shades lighter than the page (#06070b) and
// carries a border + shadow so it reads as an elevated surface instead of
// blending into the background (the previous near-black card was invisible).
const clerkAppearance = {
  variables: {
    colorBackground: "#10131c",
    colorPrimary: "#a78bfa",
    colorText: "#f4f7fc",
    colorTextSecondary: "#9aa3b7",
    colorInputBackground: "#0a0c12",
    colorInputText: "#f4f7fc",
    colorNeutral: "#ffffff",
    borderRadius: "12px",
    fontFamily: '"Space Grotesk", system-ui, sans-serif',
  },
  elements: {
    cardBox: {
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: "20px",
      boxShadow:
        "0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(139, 92, 246, 0.18)",
    },
    card: {
      backgroundColor: "rgba(16, 19, 28, 0.92)",
      backdropFilter: "blur(20px)",
    },
    headerTitle: { fontSize: "1.45rem", fontWeight: 700, color: "#f4f7fc" },
    headerSubtitle: { color: "#9aa3b7" },
    socialButtonsBlockButton: {
      backgroundColor: "rgba(255, 255, 255, 0.045)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      color: "#f4f7fc",
    },
    socialButtonsBlockButtonText: { color: "#f4f7fc", fontWeight: 500 },
    dividerLine: { backgroundColor: "rgba(255, 255, 255, 0.1)" },
    dividerText: { color: "#6b7488" },
    formFieldLabel: { color: "#c9d1e2", fontWeight: 500 },
    formFieldInput: {
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      color: "#f4f7fc",
    },
    formButtonPrimary: {
      background: "linear-gradient(120deg, #c4b5fd, #a78bfa 55%, #38bdf8)",
      color: "#0a0712",
      fontWeight: 700,
      fontSize: "0.95rem",
      textTransform: "none",
      boxShadow: "0 8px 24px rgba(139, 92, 246, 0.4)",
    },
    footer: { background: "transparent" },
    footerActionText: { color: "#9aa3b7" },
    footerActionLink: { color: "#c4b5fd", fontWeight: 600 },
    identityPreviewEditButton: { color: "#c4b5fd" },
    formFieldInputShowPasswordButton: { color: "#9aa3b7" },
    formResendCodeLink: { color: "#c4b5fd" },
    otpCodeFieldInput: {
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      color: "#f4f7fc",
    },
    // logout / account popover off the dashboard UserButton
    userButtonPopoverCard: {
      backgroundColor: "rgba(16, 19, 28, 0.96)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
    },
    userButtonPopoverActionButton: { color: "#e9eef6" },
    userButtonPopoverActionButtonText: { color: "#e9eef6" },
    userButtonPopoverFooter: { background: "transparent" },
    userPreviewMainIdentifier: { color: "#f4f7fc" },
    userPreviewSecondaryIdentifier: { color: "#9aa3b7" },
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
