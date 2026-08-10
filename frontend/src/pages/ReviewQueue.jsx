import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects, ReviewQueue } from "../api";
import { CheckCircle, ImageBroken, Tray } from "@phosphor-icons/react";

export default function ReviewQueuePage() {
  const { projectId } = useProject();
  const [items, setItems] = useState([]);
  const [taxonomy, setTaxonomy] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [its, tax] = await Promise.all([
      Projects.reviewQueue(projectId, statusFilter || undefined),
      Projects.taxonomy(projectId).catch(() => null),
    ]);
    setItems(its);
    setTaxonomy(tax);
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, statusFilter]);

  const resolve = async (id, classId) => {
    setBusy(id);
    try {
      await ReviewQueue.resolve(id, { resolution_class_id: classId });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">Review queue</h2>
        <select className="input w-auto py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
      </div>
      <p className="mb-4 text-xs text-ink-2">
        Resolving an item here queues it for inclusion the next time its dataset is normalized. It does not retroactively
        rewrite the original run's output.
      </p>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-48" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-16 text-center">
          <Tray size={28} className="mb-2 text-ink-3" />
          <p className="text-sm text-ink-2">No items{statusFilter ? ` with status "${statusFilter}"` : ""}.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={item.id} className="card stagger-item animate-fade-in-up p-3" style={{ "--stagger-index": i }}>
            {item.crop_thumbnail_path ? (
              <img src={`/api/media/review-crop/${item.id}`} alt="" className="mb-2.5 h-32 w-full rounded-control object-cover" />
            ) : (
              <div className="mb-2.5 flex h-32 w-full items-center justify-center rounded-control bg-surface-2 text-ink-3">
                <ImageBroken size={20} />
              </div>
            )}
            <p className="mb-0.5 text-xs text-ink-2">Source label</p>
            <p className="mb-2.5 font-mono text-sm text-ink">{item.source_label}</p>
            {item.status === "pending" ? (
              <select
                disabled={busy === item.id}
                defaultValue=""
                onChange={(e) => resolve(item.id, e.target.value === "__drop" ? null : Number(e.target.value))}
                className="input py-1.5 text-xs"
              >
                <option value="" disabled>
                  Resolve to…
                </option>
                <option value="__drop">Confirm drop</option>
                {(taxonomy?.classes || [])
                  .filter((c) => !c.deprecated)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}: {c.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="badge bg-success/10 text-success">
                <CheckCircle size={12} weight="fill" />
                {item.resolution_class_id != null ? `Class ${item.resolution_class_id}` : "Dropped"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
