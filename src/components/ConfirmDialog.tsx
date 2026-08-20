import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** キーボードだけで操作できる確認ダイアログ。Enter=実行 / Esc=取消 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onConfirm();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="alertdialog"
      aria-label={title}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-6 outline-none backdrop-blur-[2px]"
    >
      <div
        className="w-full max-w-sm rounded-xl p-5 shadow-xl"
        style={{ backgroundColor: "var(--st-palette-bg)" }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#FF3B30]" />
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--st-text-primary)" }}
            >
              {title}
            </h2>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--st-text-secondary)" }}
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="st-btn-ghost rounded-md px-3 py-1.5 transition-colors"
            style={{ color: "var(--st-text-secondary)" }}
          >
            キャンセル (Esc)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[#FF3B30] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel} (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
