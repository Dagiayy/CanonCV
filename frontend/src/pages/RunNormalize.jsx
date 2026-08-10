import { useEffect, useRef, useState } from "react";
import { useProject } from "../ProjectContext";
import { Datasets, Normalize, Projects } from "../api";
import StatusBadge from "../components/StatusBadge";
import { Play, WarningCircle } from "@phosphor-icons/react";

function JobPanel({ job }) {
  if (!job) return null;
  const stats = job.stats || {};
  return (
    <div className="card animate-fade-in-up p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{job._datasetName}</span>
        <StatusBadge status={job.status} />
      </div>
      {(job.status === "queued" || job.status === "running") && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-1.5 rounded-full bg-accent transition-all duration-300"
              style={{ width: `${job.progress_percent}%`, transitionTimingFunction: "var(--ease-spring)" }}
            />
          </div>
          <p className="mt-1.5 truncate text-xs text-ink-2">
            {job.progress_percent}% · {job.current_file}
          </p>
        </div>
      )}
      {job.status === "failed" && (
        <pre className="whitespace-pre-wrap rounded-control bg-danger/10 p-2.5 text-xs text-danger">{job.log_excerpt}</pre>
      )}
      {job.status === "success" && (
        <div className="space-y-1 text-xs text-ink-2">
          <p>
            Images written <b className="text-ink">{stats.images_written}</b> / processed {stats.images_processed}
          </p>
          <p>Annotations processed: {stats.annotations_processed}</p>
          <p>
            Dropped: {stats.dropped_label_count} (bbox-fatal: {stats.bbox_fatal_drops})
          </p>
          <p>Sent to review queue: {stats.review_queue_count}</p>
          <p className="break-all pt-1 font-mono text-[11px] text-ink-3">{job.output_path}</p>
          <div className="pt-2">
            <p className="font-medium text-ink">Per-class counts after mapping</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(stats.per_class_count_after || {}).map(([k, v]) => (
                <span key={k} className="badge bg-black/[0.05] text-ink-2">
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
          {stats.bbox_warnings?.length > 0 && (
            <details className="pt-1">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-warning">
                <WarningCircle size={13} weight="bold" />
                {stats.bbox_warnings.length} bbox/coverage warning{stats.bbox_warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto rounded-control bg-surface-2 p-2">
                {stats.bbox_warnings.map((w, i) => (
                  <li key={i}>
                    {w.file}: {w.issue}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function RunNormalize() {
  const { projectId } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [jobs, setJobs] = useState({}); // jobId -> run
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const load = async () => {
    const ds = await Projects.datasets(projectId);
    const withMapping = await Promise.all(
      ds.map(async (d) => {
        const mt = await Datasets.mapping(d.id).catch(() => null);
        return { ...d, _mappingStatus: mt?.status || null };
      })
    );
    setDatasets(withMapping);
  };

  useEffect(() => {
    if (projectId) load();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const run = async () => {
    setError("");
    setRunning(true);
    try {
      const { job_ids, errors } = await Normalize.run([...selected]);
      if (Object.keys(errors).length) {
        setError(Object.entries(errors).map(([id, msg]) => `${datasets.find((d) => d.id === id)?.name || id}: ${msg}`).join(" · "));
      }
      const names = Object.fromEntries(datasets.map((d) => [d.id, d.name]));
      const initial = {};
      for (const jid of job_ids) initial[jid] = { id: jid, status: "queued", progress_percent: 0, _datasetName: "…" };
      setJobs(initial);

      pollRef.current = setInterval(async () => {
        const updates = await Promise.all(job_ids.map((jid) => Normalize.job(jid)));
        setJobs((prev) => {
          const next = { ...prev };
          for (const u of updates) {
            const dsId = u.dataset_id;
            next[u.id] = { ...u, _datasetName: names[dsId] || dsId };
          }
          return next;
        });
        if (updates.every((u) => ["success", "failed", "cancelled"].includes(u.status))) {
          clearInterval(pollRef.current);
        }
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setRunning(false);
    }
  };

  const readyDatasets = datasets.filter((d) => d._mappingStatus === "ready");

  return (
    <div>
      <h2 className="mb-1 text-[17px] font-semibold tracking-tight text-ink">Run normalization</h2>
      <p className="mb-4 text-sm text-ink-2">Select datasets whose mapping table is marked "ready", then run.</p>

      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5"></th>
              <th className="px-3.5 py-2.5">Dataset</th>
              <th className="px-3.5 py-2.5">Mapping status</th>
              <th className="px-3.5 py-2.5">Images</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr key={d.id} className="border-t border-border transition-colors hover:bg-surface-2/60">
                <td className="px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    disabled={d._mappingStatus !== "ready"}
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td className="px-3.5 py-2.5 text-ink">{d.name}</td>
                <td className="px-3.5 py-2.5">
                  <StatusBadge status={d._mappingStatus || "pending"}>{d._mappingStatus || "no mapping table"}</StatusBadge>
                </td>
                <td className="px-3.5 py-2.5 text-ink-2">{d.num_images.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={run} disabled={running || selected.size === 0} className="btn btn-primary mb-6">
        <Play size={14} weight="fill" />
        Run normalization · {selected.size} selected, {readyDatasets.length} ready total
      </button>

      {Object.keys(jobs).length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.values(jobs).map((j) => (
            <JobPanel key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
