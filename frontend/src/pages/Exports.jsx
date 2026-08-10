import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Exports, Splits } from "../api";
import StatusBadge from "../components/StatusBadge";
import { Package } from "@phosphor-icons/react";

function CreateExportForm({ splitPlans, onCreated }) {
  const { projectId } = useProject();
  const [splitPlanId, setSplitPlanId] = useState("");
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await Exports.create(projectId, { split_plan_id: splitPlanId || null, tag });
      setTag("");
      onCreated();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">New export</h3>
      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}
      <label className="mb-3 block text-sm font-medium text-ink-2">
        Split plan
        <select className="input mt-1.5" value={splitPlanId} onChange={(e) => setSplitPlanId(e.target.value)} required>
          <option value="">Select a split plan…</option>
          {splitPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} v{p.version}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-4 block text-sm font-medium text-ink-2">
        Semantic tag, optional (e.g. "bicycle-dataset-v2.3")
        <input className="input mt-1.5" value={tag} onChange={(e) => setTag(e.target.value)} />
      </label>
      <button type="submit" disabled={saving || !splitPlanId} className="btn btn-primary">
        <Package size={14} weight="bold" />
        {saving ? "Exporting…" : "Create export"}
      </button>
    </form>
  );
}

function LineageView({ exportId }) {
  const [lineage, setLineage] = useState(null);
  useEffect(() => {
    Exports.lineage(exportId).then(setLineage);
  }, [exportId]);

  if (!lineage) return <p className="text-xs text-ink-2">Loading lineage…</p>;

  return (
    <div className="mt-3 rounded-control bg-surface-2 p-3 text-xs">
      <p className="mb-1 text-ink-2">
        Split: <b className="text-ink">{lineage.split_plan?.name}</b> v{lineage.split_plan?.version} · group_by=
        {lineage.split_plan?.group_by} · seed {lineage.split_plan?.seed}
      </p>
      <p className="mb-2 text-ink-2">Source runs:</p>
      <ul className="space-y-1">
        {lineage.source_runs.map((r) => (
          <li key={r.run_id} className="rounded border border-border bg-surface p-2">
            <span className="text-ink">{r.dataset.name}</span>
            <span className="text-ink-3"> · mapping v{r.mapping_table?.version} · taxonomy v{r.taxonomy_version}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ExportsPage() {
  const { projectId } = useProject();
  const [exports, setExports] = useState([]);
  const [splitPlans, setSplitPlans] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const [ex, sp] = await Promise.all([Exports.list(projectId), Splits.list(projectId)]);
    setExports(ex);
    setSplitPlans(sp);
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">Exports</h2>
        <p className="text-xs text-ink-2">Immutable, versioned training-ready snapshots with a full lineage manifest</p>
      </div>

      <div className="mb-6">
        <CreateExportForm splitPlans={splitPlans} onCreated={load} />
      </div>

      <h3 className="mb-2 text-sm font-semibold text-ink">Existing exports</h3>
      <div className="space-y-3">
        {exports.map((e) => (
          <div key={e.id} className="card p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {e.tag || `export v${e.version}`} <span className="text-ink-3">v{e.version}</span>
              </span>
              <StatusBadge status={e.status} />
            </div>
            <p className="mb-2 break-all font-mono text-[11px] text-ink-3">{e.output_path}</p>
            {e.status === "success" && (
              <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="btn btn-ghost !px-2 !py-1 text-xs">
                {expanded === e.id ? "Hide lineage" : "View lineage"}
              </button>
            )}
            {expanded === e.id && <LineageView exportId={e.id} />}
          </div>
        ))}
        {exports.length === 0 && <p className="text-sm text-ink-2">No exports yet.</p>}
      </div>
    </div>
  );
}
