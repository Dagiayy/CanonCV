const STYLES = {
  pending: { text: "text-ink-2", bg: "bg-black/[0.05]", dot: "bg-ink-3" },
  scanned: { text: "text-accent", bg: "bg-accent/10", dot: "bg-accent" },
  error: { text: "text-danger", bg: "bg-danger/10", dot: "bg-danger" },
  draft: { text: "text-warning", bg: "bg-warning/10", dot: "bg-warning" },
  ready: { text: "text-success", bg: "bg-success/10", dot: "bg-success" },
  archived: { text: "text-ink-2", bg: "bg-black/[0.05]", dot: "bg-ink-3" },
  queued: { text: "text-ink-2", bg: "bg-black/[0.05]", dot: "bg-ink-3" },
  running: { text: "text-accent", bg: "bg-accent/10", dot: "bg-accent", pulse: true },
  success: { text: "text-success", bg: "bg-success/10", dot: "bg-success" },
  failed: { text: "text-danger", bg: "bg-danger/10", dot: "bg-danger" },
  cancelled: { text: "text-ink-2", bg: "bg-black/[0.05]", dot: "bg-ink-3" },
};

export default function StatusBadge({ status, children }) {
  const s = STYLES[status] || STYLES.pending;
  return (
    <span className={`badge ${s.bg} ${s.text}`}>
      <span className={`relative h-1.5 w-1.5 rounded-full ${s.dot}`}>
        {s.pulse && <span className={`absolute inset-0 animate-ping rounded-full ${s.dot} opacity-75`} />}
      </span>
      {children ?? status}
    </span>
  );
}
