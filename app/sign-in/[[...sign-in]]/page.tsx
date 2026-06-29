import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="authpage">
      <div className="authpage__inner">
        <Link href="/" className="authpage__brand" aria-label="Autoheal home">
          <span className="authpage__brand-glyph" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 1 1-3.5-7.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M8.5 12.5l2.2 2.2L16 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="authpage__brand-name">Autoheal</span>
        </Link>
        <p className="authpage__tagline">
          Welcome back — sign in to your self-healing pipelines.
        </p>
        <SignIn signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
