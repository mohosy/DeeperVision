import { Hero } from "@/components/marketing/Hero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Footer } from "@/components/marketing/Footer";

export default function HomePage() {
  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
      </main>
      <Footer />
    </div>
  );
}
