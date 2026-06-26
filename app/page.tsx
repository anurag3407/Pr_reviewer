import Link from "next/link";
import styles from "./landing.module.css";
import { MAX_RETRIES } from "@/lib/types";

export default function LandingPage() {
  return (
    <main className={styles.hero}>
      <div className={styles.heroBackground} />
      
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandGlyph}>↻</span>
          <span className={styles.brandName}>Autoheal</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="#features" className={styles.navLink}>Features</Link>
          <Link href="#how-it-works" className={styles.navLink}>How it Works</Link>
          <a href="https://github.com/anurag3407/Pr_reviewer" target="_blank" rel="noopener noreferrer" className={styles.navLink}>GitHub</a>
        </div>
        <Link href="/dashboard" className={styles.launchBtn}>
          Open Console
        </Link>
      </nav>

      <div className={styles.content}>
        <div className={styles.badge}>
          <span className="pulse-dot"></span>
          Autoheal Beta is Live
        </div>
        
        <h1 className={styles.title}>
          AI PR Review & <br /> Release-Readiness
        </h1>
        
        <p className={styles.subtitle}>
          A closed-loop, state-driven auto-healing PR assistant. When a PR arrives, we test it, diagnose risks, generate a fix, and push it up to {MAX_RETRIES} times.
        </p>
        
        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primaryBtn}>
            Launch Operator Console
          </Link>
          <a href="https://github.com/anurag3407/Pr_reviewer" target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn}>
            View Documentation
          </a>
        </div>
      </div>

      <section id="features" className={styles.features}>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>↻</div>
            <h3 className={styles.featureTitle}>Closed-Loop Healing</h3>
            <p className={styles.featureDesc}>
              If a PR fails testing, Autoheal automatically diagnoses the issue, drafts a fix using Claude, pushes it to your branch, and retries the tests.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚡</div>
            <h3 className={styles.featureTitle}>Pluggable Testing</h3>
            <p className={styles.featureDesc}>
              Bring your own testing environment. Use npm test, deterministic mocks, or integrate directly with the real TestSprite platform.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>✋</div>
            <h3 className={styles.featureTitle}>Human-in-the-Loop</h3>
            <p className={styles.featureDesc}>
              Autoheal escalates to an operator after {MAX_RETRIES} consecutive failures. Review the threat grid and vital signs before approving or rejecting a release.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
