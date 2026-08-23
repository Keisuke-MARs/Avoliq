import { DesignNotes } from "./sections/DesignNotes";
import { FeatureBoard } from "./sections/FeatureBoard";
import { FeatureGrid } from "./sections/FeatureGrid";
import { FeatureLocal } from "./sections/FeatureLocal";
import { FeatureSearch } from "./sections/FeatureSearch";
import { StickyStage } from "./sections/StickyStage";
import { TechSpecs } from "./sections/TechSpecs";

export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <StickyStage />
      <FeatureSearch />
      <FeatureBoard />
      <FeatureLocal />
      <FeatureGrid />
      <DesignNotes />
      <TechSpecs />
    </main>
  );
}
