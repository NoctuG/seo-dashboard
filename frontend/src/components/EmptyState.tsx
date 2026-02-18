import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Primary message shown below the icon. */
  message: string;
  /** Override the default Inbox icon with any React node. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Unified empty-state placeholder used throughout the dashboard when a
 * data list or section contains no items. Provides a consistent visual
 * treatment instead of plain "No data" text.
 */
export function EmptyState({ message, icon, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-8 gap-2 text-[var(--md-sys-color-on-surface-variant)] ${className ?? ""}`}
    >
      <span className="opacity-40">
        {icon ?? <Inbox size={28} />}
      </span>
      <p className="md-body-medium">{message}</p>
    </div>
  );
}
