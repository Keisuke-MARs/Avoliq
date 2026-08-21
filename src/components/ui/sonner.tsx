import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

/**
 * sonner の Toaster ラッパー。
 * shadcn/ui の CLI が生成する版は next-themes に依存しており Vite プロジェクトでは動かないため、
 * テーマ固定（light）の最小構成を手書きしている。
 */
interface AvoliqToasterProps extends ToasterProps {
  /**
   * OSのカラースキーム。呼び出し元(Palette)からの受け渡し口を先に用意するだけで、
   * このpropでthemeを駆動する対応（面のトークン化含む）はTask 6で行う。
   */
  isDark?: boolean;
}

export function Toaster({ isDark: _isDark, ...props }: AvoliqToasterProps) {
  return (
    <SonnerToaster
      theme="light"
      position="bottom-right"
      closeButton={false}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-black/5 bg-white text-[13px] shadow-lg",
        },
      }}
      {...props}
    />
  );
}
