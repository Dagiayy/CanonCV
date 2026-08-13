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
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Human-in-the-Loop Review Queue</h2>
            <span className="badge badge-warning">Zero Guessing Policy</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Resolve ambiguous source class labels flagged during dataset ingestion into canonical taxonomy assignments.
          </p>
        </div>

        <select className="input text-xs py-2 w-44 font-semibold" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending font-bold">Pending Approval</option>
          <option value="resolved">Resolved Items</option>
          <option value="">All Items</option>
        </select>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <Tray size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-800">No Review Queue Items</p>
          <p className="text-xs text-slate-400 mt-1">All ambiguous label instances with status "{statusFilter || "all"}" have been addressed.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div>
              {item.crop_thumbnail_path ? (
                <img src={`/api/media/review-crop/${item.id}`} alt="" className="mb-3 h-36 w-full rounded-xl object-cover border border-slate-100" />
              ) : (
                <div className="mb-3 flex h-36 w-full items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <ImageBroken size={24} />
                </div>
              )}
              <span className="text-[10px] uppercase font-bold text-slate-400 block">UNMAPPED SOURCE LABEL</span>
              <p className="mb-3 font-mono font-bold text-sm text-slate-900 bg-slate-50 p-2 rounded-lg border border-slate-100 truncate">{item.source_label}</p>
            </div>

            {item.status === "pending" ? (
              <select
                disabled={busy === item.id}
                defaultValue=""
                onChange={(e) => resolve(item.id, e.target.value === "__drop" ? null : Number(e.target.value))}
                className="input py-2 text-xs font-semibold"
              >
                <option value="" disabled>
                  Assign Canonical Class...
                </option>
                <option value="__drop">Confirm Drop Label</option>
                {(taxonomy?.classes || [])
                  .filter((c) => !c.deprecated)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id}: {c.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="badge badge-success text-xs py-1">
                <CheckCircle size={14} weight="fill" />
                {item.resolution_class_id != null ? `Resolved to Class #${item.resolution_class_id}` : "Confirmed Dropped"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
