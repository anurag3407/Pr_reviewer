import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { AutoHealLoop } from "./sections/AutoHealLoop";
import { ArchitectureEngine } from "./sections/ArchitectureEngine";
import { BottomCTA } from "./sections/BottomCTA";
import { Footer } from "./sections/Footer";

export function LandingPage() {
  return (
    <div className="landing-v2" data-landing="true">
      <Nav />
      <Hero />
      <AutoHealLoop />
      <ArchitectureEngine />
      <BottomCTA />
      <Footer />
    </div>
  );
}
