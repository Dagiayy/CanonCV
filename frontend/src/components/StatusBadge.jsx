const STYLES = {
  pending: { text: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  scanned: { text: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-500" },
  error: { text: "text-rose-700", bg: "bg-rose-50 border-rose-200", dot: "bg-rose-500" },
  draft: { text: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  ready: { text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  archived: { text: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  queued: { text: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  running: { text: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-500", pulse: true },
  success: { text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  failed: { text: "text-rose-700", bg: "bg-rose-50 border-rose-200", dot: "bg-rose-500" },
  cancelled: { text: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
};

export default function StatusBadge({ status, children }) {
  const s = STYLES[status] || STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${s.bg} ${s.text}`}>
      <span className={`relative h-1.5 w-1.5 rounded-full ${s.dot}`}>
        {s.pulse && <span className={`absolute inset-0 animate-ping rounded-full ${s.dot} opacity-75`} />}
      </span>
      <span>{children ?? status}</span>
    </span>
  );
}
