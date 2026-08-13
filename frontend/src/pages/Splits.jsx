import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects, Splits } from "../api";
import Spinner from "../components/Spinner";
import { Scissors, Shuffle } from "@phosphor-icons/react";

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
    <form onSubmit={submit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Create New Dataset Split Plan</h3>
        <span className="badge badge-accent">Reproducible Seed</span>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">{error}</p>}

      <label className="block text-xs font-semibold text-slate-600">
        Split Plan Name
        <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. YOLO Train-Val-Test 80-10-10" />
      </label>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Source Normalization Runs</p>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-1.5">
          {runs.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" checked={selectedRuns.has(r.id)} onChange={() => toggleRun(r.id)} />
              <span className="font-bold text-slate-900">{datasetNames[r.dataset_id] || r.dataset_id}</span>
              <span className="text-slate-400 font-mono text-[11px]">({new Date(r.started_at).toLocaleDateString()})</span>
            </label>
          ))}
          {runs.length === 0 && <p className="text-xs text-slate-400">No successful normalization runs found.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-semibold text-slate-600">
          Grouping Policy
          <select className="input mt-1.5 text-xs" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">Per-image Stratified (Preserve Class Ratio)</option>
            <option value="source_dataset">Group by Source Dataset</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Random Seed
          <input type="number" className="input mt-1.5 text-xs font-mono" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" checked={useKFolds} onChange={(e) => setUseKFolds(e.target.checked)} />
        Use K-Fold Cross Validation Instead of Ratio Split
      </label>

      {useKFolds ? (
        <label className="block text-xs font-semibold text-slate-600">
          Number of Folds (K)
          <input type="number" min={2} className="input mt-1.5 text-xs font-mono w-32" value={kFolds} onChange={(e) => setKFolds(Number(e.target.value))} />
        </label>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Train Ratio
            <input type="number" step="0.05" className="input mt-1.5 text-xs font-mono" value={trainRatio} onChange={(e) => setTrainRatio(Number(e.target.value))} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Val Ratio
            <input type="number" step="0.05" className="input mt-1.5 text-xs font-mono" value={valRatio} onChange={(e) => setValRatio(Number(e.target.value))} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Test Ratio
            <input type="number" step="0.05" className="input mt-1.5 text-xs font-mono" value={testRatio} onChange={(e) => setTestRatio(Number(e.target.value))} />
          </label>
        </div>
      )}

      <button type="submit" disabled={saving || selectedRuns.size === 0 || !name} className="btn btn-primary text-xs py-2 px-4 shadow-md shadow-indigo-200">
        {saving ? <Spinner size={16} /> : <Shuffle size={16} weight="bold" />}
        <span>{saving ? "Building Split..." : "Generate Split Plan"}</span>
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
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Dataset Splits & Cross-Validation</h2>
            <span className="badge badge-accent">Zero Leakage</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Build seed-reproducible stratified train/val/test splits or k-folds with class balance preservation.
          </p>
        </div>
      </div>

      <CreateSplitForm runs={runs} datasetNames={datasetNames} onCreated={load} />

      <h3 className="text-sm font-bold text-slate-900 pt-2">Existing Dataset Split Plans</h3>
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">{p.name}</span>
                <span className="text-xs text-slate-400 font-mono ml-2">v{p.version}</span>
              </div>
              <span className="badge badge-neutral">
                {p.k_folds ? `${p.k_folds}-fold` : `${p.train_ratio}/${p.val_ratio}/${p.test_ratio}`} · Seed: {p.seed}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              {Object.entries(p.stats).map(([split, s]) => (
                <div key={split}>
                  <span className="uppercase text-[10px] text-slate-400 block">{split}</span>
                  <span className="text-slate-900 font-bold">{s.images.toLocaleString()} Images</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
            No split plans created yet. Use the form above to partition normalized runs.
          </div>
        )}
      </div>
    </div>
  );
}
