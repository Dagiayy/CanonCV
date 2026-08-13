import { colorForLabel } from "../utils/color";

/**
 * Shared bar-chart used anywhere we show per-label instance-count balance:
 * DatasetDetail's Overview tab and the Quality Audit page both need the exact
 * same "source label -> instance count, rarity-flagged" visualization.
 */
export default function ClassDistributionChart({ classes, title, subtitle, maxHeight = "max-h-96" }) {
  const sorted = [...(classes || [])].sort((a, b) => b.count - a.count);
  if (sorted.length === 0) return null;
  const maxCount = Math.max(...sorted.map((c) => c.count), 1);
  const rarityThreshold = Math.max(3, Math.round(maxCount * 0.05));

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{title || `Source Label Distribution (${sorted.length} labels)`}</h3>
        <span className="badge badge-accent">Interactive</span>
      </div>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className={`space-y-2 overflow-y-auto pr-1 ${maxHeight}`}>
        {sorted.map((c) => {
          const pct = Math.round((c.count / maxCount) * 100);
          const rare = c.count < rarityThreshold;
          return (
            <div key={c.label} className="group space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 font-mono text-slate-800">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorForLabel(c.label) }} />
                  {c.label}
                  {rare && <span className="badge badge-warning !py-0 !px-1.5 text-[9px]">rare</span>}
                </span>
                <span className="text-slate-500 font-mono">{c.count.toLocaleString()} ({pct}%)</span>
              </div>
              <div className="h-2.5 w-full rounded-lg bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-300 group-hover:opacity-80"
                  style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: colorForLabel(c.label) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
