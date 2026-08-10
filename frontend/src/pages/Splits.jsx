import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects, Splits } from "../api";
import { Shuffle } from "@phosphor-icons/react";

function CreateSplitForm({ runs, datasetNames, onCreated }) {
  const { projectId } = useProject();
  const [name, setName] = useState("");
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [groupBy, setGroupBy] = useState("none");
  const [trainRatio, setTrainRatio] = useState(0.8);
  const [valRatio, setValRatio] = useState(0.1);
  const [testRatio, setTestRatio] = useState(0.1);
  const [seed, setSeed] = useState(42);
  const [useKFolds, setUseKFolds] = useState(false);
  const [kFolds, setKFolds] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleRun = (id) => {
    setSelectedRuns((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await Splits.create(projectId, {
        name,
        source_run_ids: [...selectedRuns],
        group_by: groupBy,
        train_ratio: trainRatio,
        val_ratio: valRatio,
        test_ratio: testRatio,
        seed,
        k_folds: useKFolds ? kFolds : null,
      });
      setName("");
      setSelectedRuns(new Set());
      onCreated();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">New split plan</h3>
      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      <label className="mb-3 block text-sm font-medium text-ink-2">
        Name
        <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <div className="mb-3">
        <p className="mb-1.5 text-sm font-medium text-ink-2">Source runs (successful normalization runs to split)</p>
        <div className="max-h-40 overflow-y-auto rounded-control border border-border p-2">
          {runs.map((r) => (
            <label key={r.id} className="flex items-center gap-2 py-1 text-xs">
              <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={selectedRuns.has(r.id)} onChange={() => toggleRun(r.id)} />
              <span className="text-ink">{datasetNames[r.dataset_id] || r.dataset_id}</span>
              <span className="text-ink-3">· {new Date(r.started_at).toLocaleDateString()}</span>
            </label>
          ))}
          {runs.length === 0 && <p className="text-xs text-ink-3">No successful runs yet.</p>}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-ink-2">
          Group by
          <select className="input mt-1.5" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">None (per-image stratified)</option>
            <option value="source_dataset">Source dataset (whole dataset in one split)</option>
          </select>
        </label>
        <label className="text-sm font-medium text-ink-2">
          Seed
          <input type="number" className="input mt-1.5" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={useKFolds} onChange={(e) => setUseKFolds(e.target.checked)} />
        Use k-fold instead of train/val/test
      </label>

      {useKFolds ? (
        <label className="mb-4 block text-sm font-medium text-ink-2">
          Number of folds
          <input type="number" min={2} className="input mt-1.5" value={kFolds} onChange={(e) => setKFolds(Number(e.target.value))} />
        </label>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <label className="text-sm font-medium text-ink-2">
            Train
            <input type="number" step="0.05" className="input mt-1.5" value={trainRatio} onChange={(e) => setTrainRatio(Number(e.target.value))} />
          </label>
          <label className="text-sm font-medium text-ink-2">
            Val
            <input type="number" step="0.05" className="input mt-1.5" value={valRatio} onChange={(e) => setValRatio(Number(e.target.value))} />
          </label>
          <label className="text-sm font-medium text-ink-2">
            Test
            <input type="number" step="0.05" className="input mt-1.5" value={testRatio} onChange={(e) => setTestRatio(Number(e.target.value))} />
          </label>
        </div>
      )}

      <button type="submit" disabled={saving || selectedRuns.size === 0 || !name} className="btn btn-primary">
        <Shuffle size={14} weight="bold" />
        {saving ? "Building split…" : "Build split"}
      </button>
    </form>
  );
}

export default function SplitsPage() {
  const { projectId } = useProject();
  const [plans, setPlans] = useState([]);
  const [runs, setRuns] = useState([]);
  const [datasetNames, setDatasetNames] = useState({});

  const load = async () => {
    const [ps, rs, ds] = await Promise.all([Splits.list(projectId), Projects.runs(projectId), Projects.datasets(projectId)]);
    setPlans(ps);
    setRuns(rs.filter((r) => r.status === "success"));
    setDatasetNames(Object.fromEntries(ds.map((d) => [d.id, d.name])));
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">Dataset splits</h2>
        <p className="text-xs text-ink-2">Stratified, grouped, reproducible train/val/test (or k-fold) assignments</p>
      </div>

      <div className="mb-6">
        <CreateSplitForm runs={runs} datasetNames={datasetNames} onCreated={load} />
      </div>

      <h3 className="mb-2 text-sm font-semibold text-ink">Existing plans</h3>
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {p.name} <span className="text-ink-3">v{p.version}</span>
              </span>
              <span className="badge bg-black/[0.05] text-ink-2">
                {p.k_folds ? `${p.k_folds}-fold` : `${p.train_ratio}/${p.val_ratio}/${p.test_ratio}`} · seed {p.seed} · group_by={p.group_by}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-ink-2">
              {Object.entries(p.stats).map(([split, s]) => (
                <span key={split}>
                  <b className="text-ink">{split}</b>: {s.images} images
                </span>
              ))}
            </div>
          </div>
        ))}
        {plans.length === 0 && <p className="text-sm text-ink-2">No split plans yet.</p>}
      </div>
    </div>
  );
}
