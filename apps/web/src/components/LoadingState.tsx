// Loading counterpart to EmptyState: same centered layout, a spinner
// instead of an icon. Kept as a separate component rather than an
// EmptyState variant since a spinner isn't an icon choice — it doesn't
// take one.

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="tab-empty-state">
      <span className="tab-loading-spinner" aria-hidden="true" />
      <p className="tab-empty-state-text muted">{message}</p>
    </div>
  );
}
