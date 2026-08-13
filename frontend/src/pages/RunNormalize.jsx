import { useEffect, useRef, useState } from "react";
import { useProject } from "../ProjectContext";
import { Datasets, Normalize, Projects } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import { Lightning, Play, WarningCircle } from "@phosphor-icons/react";

function JobPanel({ job }) {
  if (!job) return null;
  const stats = job.stats || {};
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs animate-fade-in-up space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{job._datasetName}</span>
        <StatusBadge status={job.status} />
      </div>

      {(job.status === "queued" || job.status === "running") && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${job.progress_percent}%` }}
            />
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-slate-600">
            {job.progress_percent}% · Processing {job.current_file}
          </p>
        </div>
      )}

      {job.status === "failed" && (
        <pre className="whitespace-pre-wrap rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-mono text-rose-700">{job.log_excerpt}</pre>
      )}

      {job.status === "success" && (
        <div className="space-y-2 text-xs text-slate-600">
          <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Images Output</span>
              <span className="font-bold text-slate-900">{stats.images_written} / {stats.images_processed}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Annotations</span>
              <span className="font-bold text-slate-900">{stats.annotations_processed}</span>
            </div>
          </div>
          <p className="text-slate-500">
            Dropped labels: {stats.dropped_label_count} · Review queue entries: {stats.review_queue_count}
          </p>
          <p className="break-all font-mono text-[11px] text-slate-400 bg-slate-100 p-2 rounded-lg">{job.output_path}</p>
          
          <div className="pt-1">
            <p className="font-bold text-slate-800 mb-1">Per-Class Counts Post-Mapping:</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.per_class_count_after || {}).map(([k, v]) => (
                <span key={k} className="badge badge-neutral text-xs">
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RunNormalize() {
  const { projectId } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [jobs, setJobs] = useState({});
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
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Normalize Engine</h2>
            <span className="badge badge-accent">ETL Pipeline</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Execute deterministic label mapping, coordinate auditing, and output normalized image variants.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || selected.size === 0}
          className="btn btn-primary text-xs py-2 px-4 shadow-md shadow-indigo-200"
        >
          {running ? <Spinner size={16} /> : <Play size={16} weight="fill" />}
          <span>{running ? "Queuing Jobs…" : `Execute Normalization (${selected.size} Selected)`}</span>
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700">{error}</p>}

      {/* Datasets Selection Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 w-10">Select</th>
              <th className="py-3 px-4">Dataset</th>
              <th className="py-3 px-4">Mapping Status</th>
              <th className="py-3 px-4">Source Images</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {datasets.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    disabled={d._mappingStatus !== "ready"}
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td className="py-3.5 px-4 font-bold text-slate-900">{d.name}</td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={d._mappingStatus || "pending"}>{d._mappingStatus || "No Mapping Table"}</StatusBadge>
                </td>
                <td className="py-3.5 px-4 font-semibold">{d.num_images.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Execution Jobs Grid */}
      {Object.keys(jobs).length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Object.values(jobs).map((j) => (
            <JobPanel key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
