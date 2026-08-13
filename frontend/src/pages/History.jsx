import { Fragment, useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects } from "../api";
import StatusBadge from "../components/StatusBadge";
import NormalizedOutputGallery from "../components/NormalizedOutputGallery";
import { CaretDown, ClockCounterClockwise } from "@phosphor-icons/react";

export default function History() {
  const { projectId } = useProject();
  const [runs, setRuns] = useState([]);
  const [datasetFilter, setDatasetFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [datasetNames, setDatasetNames] = useState({});

  useEffect(() => {
    if (!projectId) return;
    Projects.runs(projectId).then(setRuns);
    Projects.datasets(projectId).then((ds) => setDatasetNames(Object.fromEntries(ds.map((d) => [d.id, d.name]))));
  }, [projectId]);

  const filtered = runs.filter(
    (r) => (!datasetFilter || r.dataset_id === datasetFilter) && (!statusFilter || r.status === statusFilter)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Run History & Logs</h2>
            <span className="badge badge-accent">Audit Trail</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Historical execution log of dataset normalization runs, label counts, and output artifacts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select className="input text-xs py-2 w-44 font-semibold" value={datasetFilter} onChange={(e) => setDatasetFilter(e.target.value)}>
            <option value="">All Datasets</option>
            {Object.entries(datasetNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="input text-xs py-2 w-36 font-semibold" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {["queued", "running", "success", "failed", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Dataset Name</th>
              <th className="py-3 px-4">Started At</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Images Written</th>
              <th className="py-3 px-4">Warnings</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="py-3.5 px-4 font-bold text-slate-900">{datasetNames[r.dataset_id] || r.dataset_id}</td>
                  <td className="py-3.5 px-4 text-slate-500 font-medium">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    {r.stats?.images_written ?? "-"} / {r.stats?.images_processed ?? "-"}
                  </td>
                  <td className="py-3.5 px-4">
                    {r.stats?.bbox_warnings?.length ? (
                      <span className="badge badge-warning text-[10px]">{r.stats.bbox_warnings.length} Warnings</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="btn btn-ghost text-xs p-1 text-slate-500">
                      <CaretDown
                        size={16}
                        weight="bold"
                        className={`transition-transform duration-200 ${expanded === r.id ? "rotate-180" : ""}`}
                      />
                    </button>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-slate-50/80 animate-fade-in-up">
                    <td colSpan={6} className="p-4 border-t border-b border-slate-200">
                      <div className="space-y-3">
                        <p className="font-mono text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 break-all">{r.output_path}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                          <span>Annotations: <b>{r.stats?.annotations_processed}</b></span>
                          <span>Dropped: <b>{r.stats?.dropped_label_count}</b></span>
                          <span>Review Queue: <b>{r.stats?.review_queue_count}</b></span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {Object.entries(r.stats?.per_class_count_after || {}).map(([k, v]) => (
                            <span key={k} className="badge badge-neutral text-xs">
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                        {r.log_excerpt && (
                          <pre className="whitespace-pre-wrap rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-mono text-rose-700">{r.log_excerpt}</pre>
                        )}
                        {r.status === "success" && (
                          <div className="pt-2">
                            <h4 className="text-xs font-bold text-slate-800 mb-2">Normalized Output Preview</h4>
                            <NormalizedOutputGallery run={r} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <ClockCounterClockwise size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No matching normalization runs</p>
          </div>
        )}
      </div>
    </div>
  );
}
