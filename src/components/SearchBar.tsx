import { Search } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { SEARCH_INPUT_ID } from "@/hooks/useKeyboard";

export function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  return (
    <div
      className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
      style={{ borderColor: "var(--st-palette-border)" }}
    >
      <Search
        size={18}
        className="shrink-0"
        style={{ color: "var(--st-text-tertiary)" }}
      />
      <input
        id={SEARCH_INPUT_ID}
        data-testid="search-input"
        type="text"
        // パレットを開いた瞬間から打ち始められるようにする
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="タスクを検索、または入力して新規作成"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="st-search-input w-full bg-transparent text-[17px] outline-none"
        style={{ color: "var(--st-text-primary)" }}
      />
    </div>
  );
}
