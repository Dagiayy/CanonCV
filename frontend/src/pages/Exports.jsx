import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Exports, Splits } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import { Export, Package, TreeStructure } from "@phosphor-icons/react";

const EXPORT_FORMATS = [
  { id: "yolo", label: "YOLO (Ultralytics)", hint: "images/ + labels/ txt + data.yaml — trains directly with YOLO11, YOLO26, or any Ultralytics version" },
  { id: "coco_json", label: "COCO JSON", hint: "images/ + annotations/instances_<split>.json — for tooling built around the COCO detection format" },
  { id: "voc_xml", label: "Pascal VOC XML", hint: "images/ + annotations/*.xml — one XML file per image, pixel-space boxes" },
];

const YOLO_VARIANTS = ["yolo26", "yolo11", "yolov8", "custom"];

function CreateExportForm({ splitPlans, onCreated }) {
  const { projectId } = useProject();
  const [splitPlanId, setSplitPlanId] = useState("");
  const [tag, setTag] = useState("");
  const [exportFormat, setExportFormat] = useState("yolo");
  const [yoloVariant, setYoloVariant] = useState("yolo26");
  const [customVariant, setCustomVariant] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await Exports.create(projectId, {
        split_plan_id: splitPlanId || null,
        tag,
        export_format: exportFormat,
        yolo_variant: yoloVariant === "custom" ? customVariant || "custom" : yoloVariant,
      });
      setTag("");
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
        <h3 className="text-sm font-bold text-slate-900">Create Exported Dataset Bundle</h3>
        <span className="badge badge-accent">{EXPORT_FORMATS.find((f) => f.id === exportFormat)?.label}</span>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">{error}</p>}

      <label className="block text-xs font-semibold text-slate-600">
        Target Split Plan
        <select className="input mt-1.5 text-xs font-semibold" value={splitPlanId} onChange={(e) => setSplitPlanId(e.target.value)} required>
          <option value="">Select a split plan…</option>
          {splitPlans.map((p) => (
            <option key={p.id} value={p.id}>
              📁 {p.name} (v{p.version})
            </option>
          ))}
        </select>
      </label>

      <div className="block text-xs font-semibold text-slate-600">
        Export Format
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setExportFormat(f.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                exportFormat === f.id ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <span className="block text-xs font-bold text-slate-900">{f.label}</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {exportFormat === "yolo" && (
        <label className="block text-xs font-semibold text-slate-600">
          Target Model Version
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select className="input w-auto text-xs font-semibold" value={yoloVariant} onChange={(e) => setYoloVariant(e.target.value)}>
              {YOLO_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v === "custom" ? "Custom / other…" : v.toUpperCase()}
                </option>
              ))}
            </select>
            {yoloVariant === "custom" && (
              <input
                className="input w-auto text-xs font-mono"
                value={customVariant}
                onChange={(e) => setCustomVariant(e.target.value)}
                placeholder="e.g. yolov9"
              />
            )}
          </div>
          <span className="mt-1 block text-[10px] font-normal text-slate-400">
            The YOLO dataset format (images/labels + data.yaml) is identical across model versions — this just tags the
            export's manifest so the intended training target stays traceable.
          </span>
        </label>
      )}

      <label className="block text-xs font-semibold text-slate-600">
        Semantic Release Tag (Optional)
        <input className="input mt-1.5 text-xs font-mono" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. yolo26-coco-v1.0-prod" />
      </label>

      <button type="submit" disabled={saving || !splitPlanId} className="btn btn-primary text-xs py-2 px-4 shadow-md shadow-indigo-200">
        {saving ? <Spinner size={16} /> : <Package size={16} weight="bold" />}
        <span>{saving ? "Packaging Export…" : "Export Versioned Dataset"}</span>
      </button>
    </form>
  );
}

function LineageView({ exportId }) {
  const [lineage, setLineage] = useState(null);
  useEffect(() => {
    Exports.lineage(exportId).then(setLineage);
  }, [exportId]);

  if (!lineage)
    return (
      <p className="flex items-center gap-2 text-xs text-slate-400 p-3">
        <Spinner size={13} /> Loading lineage manifest…
      </p>
    );

  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <TreeStructure size={16} className="text-indigo-600" />
        <span className="font-bold text-slate-900">Lineage Provenance Manifest</span>
      </div>
      <p className="text-slate-600">
        Split: <b className="text-slate-900">{lineage.split_plan?.name}</b> v{lineage.split_plan?.version} (Seed: {lineage.split_plan?.seed})
      </p>
      <div className="space-y-1.5">
        <p className="font-bold text-slate-700">Source Runs Ingested:</p>
        {lineage.source_runs.map((r) => (
          <div key={r.run_id} className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">{r.dataset.name}</span>
            <span className="text-slate-400 font-mono text-[11px]">Mapping v{r.mapping_table?.version} • Taxonomy v{r.taxonomy_version}</span>
          </div>
        ))}
      </div>
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
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Exports & Data Lineage</h2>
            <span className="badge badge-success">Immutable Manifest</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Generate versioned snapshots with training manifests (`data.yaml`) and full traceable lineage.
          </p>
        </div>
      </div>

      <CreateExportForm splitPlans={splitPlans} onCreated={load} />

      <h3 className="text-sm font-bold text-slate-900 pt-2">Exported Snapshots History</h3>
      <div className="space-y-3">
        {exports.map((e) => (
          <div key={e.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                {e.tag || `export v${e.version}`} <span className="text-xs font-mono text-slate-400">v{e.version}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="badge badge-neutral uppercase font-mono">
                  {EXPORT_FORMATS.find((f) => f.id === e.export_format)?.label || e.export_format}
                  {e.export_format === "yolo" && e.yolo_variant ? ` · ${e.yolo_variant}` : ""}
                </span>
                <StatusBadge status={e.status} />
              </div>
            </div>
            <p className="break-all font-mono text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">{e.output_path}</p>
            {e.status === "success" && (
              <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="btn btn-secondary text-xs py-1 px-3">
                {expanded === e.id ? "Hide Lineage" : "View Lineage Manifest"}
              </button>
            )}
            {expanded === e.id && <LineageView exportId={e.id} />}
          </div>
        ))}
        {exports.length === 0 && (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
            No exported snapshots created yet.
          </div>
        )}
      </div>
    </div>
  );
}
