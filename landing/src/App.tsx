import { FeatureBoard } from "./sections/FeatureBoard";
import { FeatureSearch } from "./sections/FeatureSearch";
import { StickyStage } from "./sections/StickyStage";

export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <StickyStage />
      <FeatureSearch />
      <FeatureBoard />
    </main>
  );
}
