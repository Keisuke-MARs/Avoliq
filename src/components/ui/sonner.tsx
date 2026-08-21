import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

interface Props extends ToasterProps {
  /** OSのカラースキーム。購読はPalette側で行い、ここでは受け取るだけ */
  isDark: boolean;
}

/**
 * sonner の Toaster ラッパー。
 * shadcn/ui の CLI が生成する版は next-themes に依存しており Vite プロジェクトでは動かないため、
 * useColorScheme の値を受け取る最小構成を手書きしている。
 *
 * 面は不透明にする。ガラスの器の上にさらにガラスを重ねると屈折が二乗になって濁るため。
 */
export function Toaster({ isDark, ...props }: Props) {
  return (
    <SonnerToaster
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border av-border av-surface-raised av-text-1 text-[13px] shadow-lg",
          description: "av-text-2",
          error: "av-danger-text",
        },
      }}
      {...props}
    />
  );
}
