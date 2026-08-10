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
    <div>
      <h2 className="mb-4 text-[17px] font-semibold tracking-tight text-ink">Normalization run history</h2>

      <div className="mb-4 flex gap-2">
        <select className="input w-auto py-1.5 text-sm" value={datasetFilter} onChange={(e) => setDatasetFilter(e.target.value)}>
          <option value="">All datasets</option>
          {Object.entries(datasetNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["queued", "running", "success", "failed", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5">Dataset</th>
              <th className="px-3.5 py-2.5">Started</th>
              <th className="px-3.5 py-2.5">Status</th>
              <th className="px-3.5 py-2.5">Images</th>
              <th className="px-3.5 py-2.5">Warnings</th>
              <th className="px-3.5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="px-3.5 py-2.5 text-ink">{datasetNames[r.dataset_id] || r.dataset_id}</td>
                  <td className="px-3.5 py-2.5 text-ink-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3.5 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-2">
                    {r.stats?.images_written ?? "-"} / {r.stats?.images_processed ?? "-"}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-2">{r.stats?.bbox_warnings?.length ?? 0}</td>
                  <td className="px-3.5 py-2.5">
                    <CaretDown
                      size={13}
                      weight="bold"
                      className={`text-ink-3 transition-transform duration-200 ${expanded === r.id ? "rotate-180" : ""}`}
                      style={{ transitionTimingFunction: "var(--ease-spring)" }}
                    />
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="animate-fade-in-up border-t border-border bg-surface-2/50">
                    <td colSpan={6} className="px-3.5 py-4 text-xs">
                      <p className="mb-1 break-all font-mono text-ink-2">{r.output_path}</p>
                      <p className="text-ink-2">
                        Annotations processed: {r.stats?.annotations_processed}, dropped: {r.stats?.dropped_label_count}, review
                        queue: {r.stats?.review_queue_count}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(r.stats?.per_class_count_after || {}).map(([k, v]) => (
                          <span key={k} className="badge bg-black/[0.06] text-ink-2">
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                      {r.log_excerpt && (
                        <pre className="mt-2 whitespace-pre-wrap rounded-control bg-danger/10 p-2.5 text-danger">{r.log_excerpt}</pre>
                      )}
                      {r.status === "success" && (
                        <div className="mt-3">
                          <h4 className="mb-2 font-semibold text-ink">Normalized output</h4>
                          <NormalizedOutputGallery run={r} />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClockCounterClockwise size={26} className="mb-2 text-ink-3" />
            <p className="text-sm text-ink-2">No runs match these filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
