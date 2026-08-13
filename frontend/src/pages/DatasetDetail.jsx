import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Datasets, Projects, mediaUrl } from "../api";
import { useProject } from "../ProjectContext";
import MappingBuilder from "../components/MappingBuilder";
import SampleViewerModal from "../components/SampleViewerModal";
import StatusBadge from "../components/StatusBadge";
import ImageGallery from "../components/ImageGallery";
import NormalizedOutputGallery from "../components/NormalizedOutputGallery";
import ClassDistributionChart from "../components/ClassDistributionChart";
import Spinner from "../components/Spinner";
import { colorForLabel } from "../utils/color";
import { ArrowLeft, ArrowsClockwise, Eye, FolderOpen, PencilSimple, WarningCircle } from "@phosphor-icons/react";

const TABS = ["overview", "browse images", "mapping", "run history"];

function OverviewTab({ dataset, onNotesSaved }) {
  const [license, setLicense] = useState(dataset.license_note || "");
  const [collection, setCollection] = useState(dataset.collection_note || "");
  const [sampleLabel, setSampleLabel] = useState(undefined);
  const [saving, setSaving] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    try {
      await Datasets.updateNotes(dataset.id, { license_note: license, collection_note: collection });
      onNotesSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Dataset Metadata & Ingestion Info</h3>
          <dl className="space-y-2 text-xs">
            <Row k="Source Format" v={<span className="badge badge-neutral uppercase font-mono">{dataset.source_format}</span>} />
            <Row k="Raw Filesystem Path" v={<span className="break-all font-mono text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100">{dataset.raw_path}</span>} />
            <Row k="Images Count" v={<span className="font-bold text-slate-900">{dataset.num_images.toLocaleString()}</span>} />
            <Row k="Annotations Count" v={<span className="font-bold text-slate-900">{dataset.num_annotations.toLocaleString()}</span>} />
            <Row k="Avg Resolution" v={`${Math.round(dataset.image_stats?.avg_width || 0)} × ${Math.round(dataset.image_stats?.avg_height || 0)}`} />
            <Row k="Formats Detected" v={(dataset.image_stats?.formats_found || []).join(", ") || "Images"} />
          </dl>
          {dataset.warnings?.length > 0 && (
            <details className="mt-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-700">
                <WarningCircle size={14} weight="bold" />
                {dataset.warnings.length} Scan Warning(s)
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                {dataset.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">License & Collection Notes</h3>
          <label className="block text-xs font-semibold text-slate-600">
            License & Attribution
            <textarea className="input mt-1.5 py-2 text-xs" rows={2} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. MIT / CC BY 4.0" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Collection Conditions & Notes
            <textarea className="input mt-1.5 py-2 text-xs" rows={2} value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="e.g. Daylight camera drone captures..." />
          </label>
          <button onClick={saveNotes} disabled={saving} className="btn btn-secondary text-xs py-1.5 px-3">
            {saving && <Spinner size={14} />}
            {saving ? "Saving…" : "Save Metadata Notes"}
          </button>
        </div>
      </div>

      <ClassDistributionChart
        classes={dataset.source_classes}
        title={`Source Label Distribution (${dataset.source_classes.length} labels)`}
        subtitle="Raw label instance counts as scanned from this dataset, before any taxonomy mapping. Labels below ~5% of the dominant label are flagged as under-represented — worth planning oversampling or targeted collection for."
      />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Source Labels Discovered ({dataset.source_classes.length})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Raw Source Label</th>
              <th className="py-3 px-4">Instance Count</th>
              <th className="py-3 px-4 text-right">Sample Viewer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {dataset.source_classes.map((lc) => (
              <tr key={lc.label} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-slate-900">{lc.label}</td>
                <td className="py-3 px-4 font-semibold">{lc.count.toLocaleString()}</td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => setSampleLabel(lc.label)} className="btn btn-secondary text-xs py-1 px-3">
                    <Eye size={14} />
                    <span>View Samples</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sampleLabel !== undefined && (
        <SampleViewerModal datasetId={dataset.id} label={sampleLabel} onClose={() => setSampleLabel(undefined)} />
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <dt className="text-slate-500 font-medium">{k}</dt>
      <dd className="text-right text-slate-900 font-semibold">{v}</dd>
    </div>
  );
}

function BrowseImagesTab({ dataset }) {
  const [label, setLabel] = useState("");
  const [split, setSplit] = useState("");
  const splits = Object.keys(dataset.image_stats?.splits || {});

  // Best-effort mapping back to an Annotation Studio folder: datasets registered
  // through the normal "server folder" / upload flow store raw_path as exactly
  // that top-level folder name (see routers/datasets.py register_dataset_from_folder),
  // which is also what Annotate Studio lists as a selectable folder — so the first
  // path segment is the right folder to deep-link into for editing.
  const annotateFolder = dataset.raw_path.split(/[/\\]/)[0];

  const fetchPage = async (offset, limit) => {
    const res = await Datasets.images(dataset.id, {
      label: label || undefined,
      split: split || undefined,
      offset,
      limit,
    });
    return {
      has_more: res.has_more,
      items: res.items.map((it) => ({
        image_url: mediaUrl(it.image_url),
        file: it.image_path.split(/[/\\]/).pop(),
        boxes: it.boxes.map((b) => ({ label: b.label, bbox: b.bbox, color: colorForLabel(b.label) })),
      })),
    };
  };

  const fetchCount = () => Datasets.imagesCount(dataset.id, { label: label || undefined, split: split || undefined }).then((r) => r.total);

  const getEditHref = (item) => `/annotate?folder=${encodeURIComponent(annotateFolder)}&file=${encodeURIComponent(item.file)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto text-xs py-2 font-semibold" value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All Source Labels</option>
          {dataset.source_classes.map((lc) => (
            <option key={lc.label} value={lc.label}>
              {lc.label} ({lc.count})
            </option>
          ))}
        </select>
        {splits.length > 0 && (
          <select className="input w-auto text-xs py-2 font-semibold" value={split} onChange={(e) => setSplit(e.target.value)}>
            <option value="">All Dataset Splits</option>
            {splits.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <PencilSimple size={13} weight="bold" />
          Click any image, then "Edit / Add Labels" to open it in the Annotation Studio
        </span>
      </div>
      <ImageGallery
        fetchPage={fetchPage}
        fetchCount={fetchCount}
        resetKey={`${label}|${split}`}
        emptyMessage="No images match this filter."
        getEditHref={getEditHref}
      />
    </div>
  );
}

function RunHistoryTab({ dataset }) {
  const [runs, setRuns] = useState([]);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    Datasets.runHistory(dataset.id).then(setRuns);
  }, [dataset.id]);
  if (runs.length === 0) return <p className="text-xs text-slate-400 p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">No normalization runs executed for this dataset yet.</p>;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Started</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Images Written</th>
              <th className="py-3 px-4">Dropped</th>
              <th className="py-3 px-4">Output Path</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-medium">{new Date(r.started_at).toLocaleString()}</td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-3.5 px-4 font-semibold">{r.stats?.images_written ?? "-"}</td>
                <td className="py-3.5 px-4 font-semibold">{r.stats?.dropped_label_count ?? "-"}</td>
                <td className="py-3.5 px-4 max-w-xs truncate font-mono text-[11px] text-slate-500">{r.output_path}</td>
                <td className="py-3.5 px-4 text-right">
                  {r.status === "success" && (
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="btn btn-secondary text-xs py-1 px-3">
                      {expanded === r.id ? "Hide Output" : "Browse Output"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expanded && (
        <div className="animate-fade-in-up">
          <h4 className="mb-3 text-xs font-bold text-slate-800">Normalized Output Images</h4>
          <NormalizedOutputGallery run={runs.find((r) => r.id === expanded)} />
        </div>
      )}
    </div>
  );
}

export default function DatasetDetail() {
  const { datasetId } = useParams();
  const { projectId } = useProject();
  const [dataset, setDataset] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [tab, setTab] = useState("overview");
  const [rescanning, setRescanning] = useState(false);

  const load = async () => {
    setDataset(await Datasets.get(datasetId));
  };

  useEffect(() => {
    load();
    Projects.taxonomy(projectId).then(setTaxonomy).catch(() => setTaxonomy(null));
  }, [datasetId, projectId]);

  if (!dataset) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const rescan = async () => {
    setRescanning(true);
    try {
      await Datasets.rescan(dataset.id);
      await load();
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
          <ArrowLeft size={14} weight="bold" />
          Back to Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{dataset.name}</h2>
              <span className="badge badge-neutral uppercase font-mono">{dataset.source_format}</span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">{dataset.raw_path}</p>
          </div>
          <button onClick={rescan} disabled={rescanning} className="btn btn-secondary text-xs">
            <ArrowsClockwise size={15} weight="bold" className={rescanning ? "animate-spin" : ""} />
            <span>{rescanning ? "Rescanning..." : "Rescan Dataset"}</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className="segmented-item capitalize" data-active={tab === t}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewTab dataset={dataset} onNotesSaved={load} />}
      {tab === "browse images" && <BrowseImagesTab dataset={dataset} />}
      {tab === "mapping" &&
        (taxonomy ? (
          <MappingBuilder dataset={dataset} taxonomy={taxonomy} onSaved={load} />
        ) : (
          <p className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs font-semibold text-amber-800">
            Define a taxonomy for this project first on the Taxonomy Studio tab.
          </p>
        ))}
      {tab === "run history" && <RunHistoryTab dataset={dataset} />}
    </div>
  );
}
