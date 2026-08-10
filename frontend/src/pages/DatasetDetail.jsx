import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Datasets, Projects, mediaUrl } from "../api";
import { useProject } from "../ProjectContext";
import MappingBuilder from "../components/MappingBuilder";
import SampleViewerModal from "../components/SampleViewerModal";
import StatusBadge from "../components/StatusBadge";
import ImageGallery from "../components/ImageGallery";
import NormalizedOutputGallery from "../components/NormalizedOutputGallery";
import { colorForLabel } from "../utils/color";
import { ArrowLeft, ArrowsClockwise, Eye, WarningCircle } from "@phosphor-icons/react";

const TABS = ["overview", "browse images", "mapping", "run history"];

function OverviewTab({ dataset, onNotesSaved }) {
  const [license, setLicense] = useState(dataset.license_note);
  const [collection, setCollection] = useState(dataset.collection_note);
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
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-4 text-sm">
          <h3 className="mb-2.5 font-semibold text-ink">Metadata</h3>
          <dl className="space-y-1.5">
            <Row k="Format" v={dataset.source_format} />
            <Row k="Raw path" v={<span className="break-all font-mono text-xs">{dataset.raw_path}</span>} />
            <Row k="Images" v={dataset.num_images.toLocaleString()} />
            <Row k="Annotations" v={dataset.num_annotations.toLocaleString()} />
            <Row k="Avg resolution" v={`${Math.round(dataset.image_stats?.avg_width || 0)}×${Math.round(dataset.image_stats?.avg_height || 0)}`} />
            <Row k="Formats found" v={(dataset.image_stats?.formats_found || []).join(", ")} />
          </dl>
          {dataset.warnings?.length > 0 && (
            <details className="mt-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-warning">
                <WarningCircle size={13} weight="bold" />
                {dataset.warnings.length} scan warning{dataset.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-control bg-surface-2 p-2.5 text-xs text-ink-2">
                {dataset.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="card p-4 text-sm">
          <h3 className="mb-2.5 font-semibold text-ink">License and collection notes</h3>
          <label className="mb-2.5 block text-xs font-medium text-ink-2">
            License
            <textarea className="input mt-1 py-1.5 text-sm" rows={2} value={license} onChange={(e) => setLicense(e.target.value)} />
          </label>
          <label className="mb-3 block text-xs font-medium text-ink-2">
            Collection conditions
            <textarea className="input mt-1 py-1.5 text-sm" rows={2} value={collection} onChange={(e) => setCollection(e.target.value)} />
          </label>
          <button onClick={saveNotes} disabled={saving} className="btn btn-secondary !py-1.5 text-xs">
            {saving ? "Saving…" : "Save notes"}
          </button>
        </div>
      </div>

      <h3 className="mb-2.5 text-sm font-semibold text-ink">Source labels · {dataset.source_classes.length}</h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5">Label</th>
              <th className="px-3.5 py-2.5">Instances</th>
              <th className="px-3.5 py-2.5">Samples</th>
            </tr>
          </thead>
          <tbody>
            {dataset.source_classes.map((lc) => (
              <tr key={lc.label} className="border-t border-border transition-colors hover:bg-surface-2/60">
                <td className="px-3.5 py-2.5 font-mono text-xs">{lc.label}</td>
                <td className="px-3.5 py-2.5 text-ink-2">{lc.count.toLocaleString()}</td>
                <td className="px-3.5 py-2.5">
                  <button onClick={() => setSampleLabel(lc.label)} className="btn btn-ghost !px-2 !py-1 text-xs">
                    <Eye size={13} />
                    View
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
    <div className="flex justify-between gap-4">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}

function BrowseImagesTab({ dataset }) {
  const [label, setLabel] = useState("");
  const [split, setSplit] = useState("");
  const splits = Object.keys(dataset.image_stats?.splits || {});

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

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto py-1.5 text-sm" value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All labels</option>
          {dataset.source_classes.map((lc) => (
            <option key={lc.label} value={lc.label}>
              {lc.label} ({lc.count})
            </option>
          ))}
        </select>
        {splits.length > 0 && (
          <select className="input w-auto py-1.5 text-sm" value={split} onChange={(e) => setSplit(e.target.value)}>
            <option value="">All splits</option>
            {splits.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
      <ImageGallery fetchPage={fetchPage} resetKey={`${label}|${split}`} emptyMessage="No images match this filter." />
    </div>
  );
}

function RunHistoryTab({ dataset }) {
  const [runs, setRuns] = useState([]);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    Datasets.runHistory(dataset.id).then(setRuns);
  }, [dataset.id]);
  if (runs.length === 0) return <p className="text-sm text-ink-2">No normalization runs yet for this dataset.</p>;
  return (
    <div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5">Started</th>
              <th className="px-3.5 py-2.5">Status</th>
              <th className="px-3.5 py-2.5">Images written</th>
              <th className="px-3.5 py-2.5">Dropped</th>
              <th className="px-3.5 py-2.5">Output path</th>
              <th className="px-3.5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2/60">
                <td className="px-3.5 py-2.5">{new Date(r.started_at).toLocaleString()}</td>
                <td className="px-3.5 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3.5 py-2.5">{r.stats?.images_written ?? "-"}</td>
                <td className="px-3.5 py-2.5">{r.stats?.dropped_label_count ?? "-"}</td>
                <td className="px-3.5 py-2.5 max-w-xs truncate font-mono text-xs text-ink-2">{r.output_path}</td>
                <td className="px-3.5 py-2.5">
                  {r.status === "success" && (
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="btn btn-ghost !px-2 !py-1 text-xs">
                      {expanded === r.id ? "Hide" : "Browse output"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expanded && (
        <div className="animate-fade-in-up mt-4">
          <h4 className="mb-2.5 text-sm font-semibold text-ink">Normalized output · canonical classes</h4>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, projectId]);

  if (!dataset) {
    return (
      <div>
        <div className="skeleton mb-4 h-4 w-24" />
        <div className="skeleton mb-6 h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
        </div>
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
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={14} weight="bold" />
        Dashboard
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">{dataset.name}</h2>
        <button onClick={rescan} disabled={rescanning} className="btn btn-secondary">
          <ArrowsClockwise size={14} weight="bold" className={rescanning ? "spinner" : ""} />
          {rescanning ? "Rescanning…" : "Rescan"}
        </button>
      </div>

      <div className="segmented mb-5 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="segmented-item capitalize" data-active={tab === t}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab dataset={dataset} onNotesSaved={load} />}
      {tab === "browse images" && <BrowseImagesTab dataset={dataset} />}
      {tab === "mapping" &&
        (taxonomy ? (
          <MappingBuilder dataset={dataset} taxonomy={taxonomy} onSaved={load} />
        ) : (
          <p className="rounded-control bg-warning/10 p-3 text-sm text-warning">
            Define a taxonomy for this project first, on the Taxonomy tab.
          </p>
        ))}
      {tab === "run history" && <RunHistoryTab dataset={dataset} />}
    </div>
  );
}
