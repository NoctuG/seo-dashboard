import { AlertTriangle, RefreshCw } from "lucide-react";

interface InlineAlertProps {
  /** Human-readable error description. */
  message: string;
  /** If provided, a retry button is rendered. */
  onRetry?: () => void;
  /** Label for the retry button (defaults to "Retry"). */
  retryLabel?: string;
}

/**
 * Inline alert banner used to surface API errors inside a section.
 * Replaces the previous pattern of raw `<p className="text-red-600">` text.
 * When `onRetry` is provided the user can re-trigger the failing request
 * without a full page reload.
 */
export function InlineAlert({
  message,
  onRetry,
  retryLabel = "Retry",
}: InlineAlertProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-[var(--md-sys-color-error)] bg-[color-mix(in_srgb,var(--md-sys-color-error)_8%,transparent)] px-4 py-3"
    >
      <AlertTriangle
        size={16}
        className="shrink-0 text-[var(--md-sys-color-error)]"
      />
      <span className="md-body-medium flex-1 text-[var(--md-sys-color-error)]">
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 md-label-medium rounded border border-[var(--md-sys-color-error)] px-3 py-1 text-[var(--md-sys-color-error)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-error)_12%,transparent)] transition-colors"
        >
          <RefreshCw size={13} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
