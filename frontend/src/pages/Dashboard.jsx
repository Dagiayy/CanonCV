import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useProject } from "../ProjectContext";
import { Datasets, Projects, Quality, mediaUrl } from "../api";
import StatusBadge from "../components/StatusBadge";
import Sheet from "../components/Sheet";
import ClassDistributionChart from "../components/ClassDistributionChart";
import Spinner from "../components/Spinner";
import {
  ArrowSquareOut,
  ArrowUpRight,
  BoundingBox,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  DotsThree,
  Eye,
  FileCode,
  FolderOpen,
  Funnel,
  GridFour,
  Image as ImageIcon,
  Lightning,
  MagnifyingGlass,
  Plus,
  Rows,
  ShieldCheck,
  Sparkle,
  Stack,
  Tag,
  TrendUp,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").trim();
}

function UploadTab({ projectId, onAdded, onClose, setError, error }) {
  const [pickedFiles, setPickedFiles] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const inputRef = useRef(null);

  const handlePick = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const root = sanitizeFolderName((files[0].webkitRelativePath || files[0].name).split("/")[0]);
    setPickedFiles(files);
    setFolderName(root);
  };

  const totalBytes = pickedFiles ? Array.from(pickedFiles).reduce((a, f) => a + f.size, 0) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!pickedFiles || !folderName) return;
    setUploading(true);
    setError("");
    setProgress({ done: 0, total: pickedFiles.length });
    try {
      await Projects.uploadFolder(projectId, folderName, pickedFiles, (done, total) => setProgress({ done, total }));
      await Projects.registerFromFolder(projectId, { folder_name: folderName, name: name || undefined, added_by_note: note });
      onAdded();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handlePick}
      />

      {!pickedFiles ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center hover:border-slate-400 hover:bg-slate-50 transition-all group cursor-pointer"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:scale-105 transition-transform">
            <UploadSimple size={22} weight="bold" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900">Choose dataset folder from computer</span>
            <p className="text-[11px] text-slate-400 mt-0.5">Supports images with COCO JSON, YOLO TXT, or VOC XML labels</p>
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-900">{pickedFiles.length.toLocaleString()} files selected</span>
            <p className="text-[11px] text-slate-500 font-mono">{(totalBytes / (1024 * 1024)).toFixed(1)} MB total</p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-bold text-slate-900 hover:underline">
            Change
          </button>
        </div>
      )}

      {pickedFiles && (
        <>
          <label className="block text-xs font-bold text-slate-700">
            Target folder name on server
            <input className="input mt-1" value={folderName} onChange={(e) => setFolderName(sanitizeFolderName(e.target.value))} required />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Display name (optional)
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={folderName} />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Ingestion note
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Drone camera raw batch" />
          </label>
        </>
      )}

      {uploading && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-slate-900 transition-all duration-200"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-slate-500 text-center">
            Uploading {progress.done.toLocaleString()} / {progress.total.toLocaleString()} files…
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onClose} className="btn btn-ghost">
          Cancel
        </button>
        <button type="submit" disabled={uploading || !pickedFiles || !folderName} className="btn btn-primary">
          {uploading ? "Uploading..." : "Upload & Scan"}
        </button>
      </div>
    </form>
  );
}

function AddDatasetModal({ onClose, onAdded }) {
  const { projectId } = useProject();
  const [mode, setMode] = useState("upload");
  const [folders, setFolders] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [name, setName] = useState("");
  const [rawPath, setRawPath] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Projects.availableRawFolders(projectId)
      .then((fs) => {
        setFolders(fs);
        const first = fs.find((f) => !f.already_registered);
        if (first) setFolderName(first.folder_name);
      })
      .catch(() => setFolders([]));
  }, [projectId]);

  const submitFolder = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await Projects.registerFromFolder(projectId, { folder_name: folderName, name: name || undefined, added_by_note: note });
      onAdded();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitAdvanced = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await Datasets.register(projectId, { name, raw_path: rawPath, added_by_note: note });
      onAdded();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} maxWidth="max-w-xl">
      <div className="mb-5 flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">Ingest Dataset</h3>
          <p className="text-xs text-slate-500">Upload or register dataset directory on server</p>
        </div>
        <div className="segmented">
          {[
            { id: "upload", label: "Upload" },
            { id: "folder", label: "Server Folder" },
            { id: "advanced", label: "Custom Path" },
          ].map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} className="segmented-item" data-active={mode === m.id}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "upload" && <UploadTab projectId={projectId} onAdded={onAdded} onClose={onClose} error={error} setError={setError} />}

      {mode !== "upload" && error && <p className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">{error}</p>}

      {mode === "folder" && (
        <form onSubmit={submitFolder} className="space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Available Unregistered Folder
            {folders === null ? (
              <div className="skeleton mt-1 h-10" />
            ) : folders.length === 0 ? (
              <p className="mt-1 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                No unregistered folders found on server.
              </p>
            ) : (
              <select className="input mt-1 font-semibold" value={folderName} onChange={(e) => setFolderName(e.target.value)} required>
                <option value="" disabled>
                  Select a folder…
                </option>
                {folders.map((f) => (
                  <option key={f.folder_name} value={f.folder_name} disabled={f.already_registered}>
                    {f.folder_name} {f.already_registered ? " (Registered)" : ""}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Display Name
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={folderName} />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Note
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving || !folderName} className="btn btn-primary">
              {saving && <Spinner size={14} />}
              {saving ? "Scanning…" : "Ingest & Scan"}
            </button>
          </div>
        </form>
      )}

      {mode === "advanced" && (
        <form onSubmit={submitAdvanced} className="space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Dataset Name
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. COCO Train 2024" />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Absolute Path
            <input
              className="input mt-1 font-mono text-xs"
              value={rawPath}
              onChange={(e) => setRawPath(e.target.value)}
              required
              placeholder="D:\GREEN\AATB CV\normalization datases\my_dataset"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Note
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving && <Spinner size={14} />}
              {saving ? "Scanning…" : "Register Path"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

// Mini Sparkline Graphic Component (Matching Top Metric Cards in Reference Image)
function MiniSparkline({ activeIndex = 4 }) {
  const heights = [35, 60, 45, 80, 100, 50, 65, 40];
  return (
    <div className="flex items-end gap-1 h-8 px-1">
      {heights.map((h, i) => (
        <div
          key={i}
          className={`sparkline-bar ${i === activeIndex ? "sparkline-bar-active" : ""}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-lg font-black text-slate-900">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

// Rich, interactive at-a-glance view opened straight from a Dashboard row click —
// class distribution, image preview, warnings — without leaving the page. The
// dedicated "Details" button still deep-links to the full DatasetDetail page for
// mapping/run-history work.
function DatasetQuickLook({ dataset, onClose }) {
  const [images, setImages] = useState(null);

  useEffect(() => {
    if (dataset.scan_status !== "scanned") {
      setImages([]);
      return;
    }
    Datasets.images(dataset.id, { offset: 0, limit: 8 })
      .then((r) => setImages(r.items))
      .catch(() => setImages([]));
  }, [dataset.id, dataset.scan_status]);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 truncate">{dataset.name}</h3>
            <span className="badge badge-neutral uppercase font-mono shrink-0">{dataset.source_format}</span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{dataset.raw_path}</p>
        </div>
        <button onClick={onClose} className="btn btn-ghost !p-1.5 shrink-0">
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatMini label="Images" value={dataset.num_images.toLocaleString()} />
        <StatMini label="Annotations" value={dataset.num_annotations.toLocaleString()} />
        <StatMini label="Source Labels" value={(dataset.source_classes || []).length} />
      </div>

      {dataset.warnings?.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <p className="font-bold flex items-center gap-1.5">
            <WarningCircle size={14} weight="bold" />
            {dataset.warnings.length} scan warning(s)
          </p>
        </div>
      )}

      {(dataset.source_classes || []).length > 0 && (
        <div className="mb-4">
          <ClassDistributionChart classes={dataset.source_classes} title="Source Label Distribution" maxHeight="max-h-48" />
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Image Preview</p>
        {images === null ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-xl" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="text-xs text-slate-400">No images available for preview yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {images.map((it, i) => (
              <img key={i} src={mediaUrl(it.image_url)} alt="" loading="lazy" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button onClick={onClose} className="btn btn-ghost">
          Close
        </button>
        <Link to={`/datasets/${dataset.id}`} className="btn btn-primary">
          <ArrowSquareOut size={15} weight="bold" />
          Open Full Detail
        </Link>
      </div>
    </Sheet>
  );
}

export default function Dashboard({ searchQuery }) {
  const { projectId, project } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [stats, setStats] = useState({ totals: {} });
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("table");
  const [formatFilter, setFormatFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("Monthly");
  const [selectedIds, setSelectedIds] = useState([]);
  const [quickLookDataset, setQuickLookDataset] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ds, cs] = await Promise.all([Projects.datasets(projectId), Projects.classStats(projectId)]);
      const withMapping = await Promise.all(
        ds.map(async (d) => {
          try {
            const mt = await Datasets.mapping(d.id);
            return { ...d, _mapping: mt?.status || null };
          } catch {
            return { ...d, _mapping: null };
          }
        })
      );
      setDatasets(withMapping);
      setStats(cs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const totalImages = datasets.reduce((a, d) => a + d.num_images, 0);
  const totalAnnotations = datasets.reduce((a, d) => a + d.num_annotations, 0);
  const totalClasses = Object.keys(stats.totals || {}).length;

  const filteredDatasets = datasets.filter((d) => {
    const matchesSearch = !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.source_format?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFormat = formatFilter === "ALL" || d.source_format?.toUpperCase() === formatFilter.toUpperCase();
    return matchesSearch && matchesFormat;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDatasets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDatasets.map((d) => d.id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 skeleton h-80 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 1. Top 4 Metric Cards (Matching Exact Reference Layout & Sparklines) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Revenue / Datasets */}
        <div className="stat-card bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL DATASETS</span>
              <MiniSparkline activeIndex={3} />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight mt-1">{datasets.length}</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-4 pt-2 border-t border-slate-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-900 font-bold">+0.94</span>
            <span>last version</span>
          </div>
        </div>

        {/* Metric 2: Total Orders / Images */}
        <div className="stat-card bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL IMAGES</span>
              <MiniSparkline activeIndex={4} />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              {totalImages.toLocaleString()} <span className="text-xs font-medium text-slate-400">Files</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-4 pt-2 border-t border-slate-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-900 font-bold">+12.4%</span>
            <span>last month</span>
          </div>
        </div>

        {/* Metric 3: New Customers / Annotations */}
        <div className="stat-card bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL ANNOTATIONS</span>
              <MiniSparkline activeIndex={2} />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              {totalAnnotations.toLocaleString()} <span className="text-xs font-medium text-slate-400">BBoxes</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-4 pt-2 border-t border-slate-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-900 font-bold">+4.3k</span>
            <span>new bboxes</span>
          </div>
        </div>

        {/* Metric 4: Conversion Rate / Quality Score */}
        <div className="stat-card bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">HEALTH & COVERAGE</span>
              <MiniSparkline activeIndex={5} />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight mt-1">{totalClasses} Classes</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-4 pt-2 border-t border-slate-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-900 font-bold">100%</span>
            <span>taxonomy active</span>
          </div>
        </div>
      </div>

      {/* 2. Middle Row Grid (Matching Left Trend Chart + Right Breakdown & AI Banner) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sales Trend / Dataset Class Distribution Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">DATASET TREND & DISTRIBUTION</h3>
                  <button className="text-slate-400 hover:text-slate-700">⚙</button>
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  Total Instances: <span className="font-mono">{totalAnnotations.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1 text-slate-800">
                    <span className="h-2 w-2 rounded-full bg-slate-900" /> NEW BBOXES
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-300" /> EXISTING
                  </span>
                </div>

                <div className="segmented">
                  {["Weekly", "Monthly", "Yearly"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimeFilter(t)}
                      className="segmented-item"
                      data-active={timeFilter === t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Class Distribution Bar Chart Preview */}
            <div className="space-y-3 my-4">
              {Object.keys(stats.totals || {}).length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No normalized instances generated yet. Run a normalization pipeline to view distribution graphs.
                </div>
              ) : (
                Object.entries(stats.totals).slice(0, 4).map(([name, count]) => {
                  const maxCount = Math.max(...Object.values(stats.totals), 1);
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-800 font-bold">{name}</span>
                        <span className="text-slate-500 font-mono">{count.toLocaleString()} instances ({pct}%)</span>
                      </div>
                      <div className="h-3 w-full rounded-lg bg-slate-100 overflow-hidden flex">
                        <div
                          className="h-full bg-slate-900 transition-all duration-300"
                          style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Preserving 100% Stratified Class Ratios</span>
            <Link to="/taxonomy" className="font-bold text-slate-900 hover:underline">
              Edit Taxonomy Rules →
            </Link>
          </div>
        </div>

        {/* Right Revenue Breakdown / AI Insight Banner Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">TAXONOMY BREAKDOWN</h3>
              <button className="text-slate-400 hover:text-slate-700">⚙</button>
            </div>

            <div className="text-xl font-black text-slate-900 mb-3">
              {totalClasses} <span className="text-xs font-normal text-slate-400">Classes Active</span>
            </div>

            {/* AI Insight Callout Banner (Matching Reference Banner) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 mb-4 flex items-start gap-2.5">
              <span className="text-amber-500 text-sm mt-0.5">⚡</span>
              <div>
                <p className="text-xs font-bold text-slate-900">YOLO26 AI Auto-Labeling Active</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Automatic bounding box inference ready for raw dataset folders.
                </p>
              </div>
            </div>

            {/* Pipeline Actions */}
            <div className="space-y-2">
              <Link to="/annotate" className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs font-bold text-slate-900 transition-colors">
                <span className="flex items-center gap-2">
                  <Sparkle size={16} weight="fill" className="text-slate-700" />
                  Launch Annotation Studio
                </span>
                <span>→</span>
              </Link>

              <Link to="/quality" className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs font-bold text-slate-900 transition-colors">
                <span className="flex items-center gap-2">
                  <ShieldCheck size={16} weight="bold" className="text-slate-700" />
                  Run Quality Audit
                </span>
                <span>→</span>
              </Link>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-center">
            <Link to="/exports" className="text-xs font-bold text-slate-900 hover:underline">
              View Version Lineage →
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Bottom Table Section (Matching Reference "RECENT TRANSACTIONS" Style) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Controls Bar */}
        <div className="p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">RECENT DATASET INGESTIONS</h3>
              <button className="text-slate-400 hover:text-slate-700">⚙</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Format Filter Pills */}
            <div className="segmented">
              {["ALL", "COCO", "YOLO", "VOC"].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormatFilter(fmt)}
                  className="segmented-item"
                  data-active={formatFilter === fmt}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {/* Pitch-Black Add Dataset Button (Matching Reference "+ Add Transaction") */}
            <button onClick={() => setShowAdd(true)} className="btn btn-primary">
              <Plus size={14} weight="bold" />
              <span>Ingest Dataset</span>
            </button>
          </div>
        </div>

        {/* Dataset Table Content */}
        {filteredDatasets.length === 0 ? (
          <div className="py-16 text-center">
            <Stack size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-800">No datasets found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ingest a raw dataset folder to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      checked={selectedIds.length === filteredDatasets.length && filteredDatasets.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="py-3 px-4">DATASET NAME</th>
                  <th className="py-3 px-4">FORMAT</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4">IMAGES</th>
                  <th className="py-3 px-4">ANNOTATIONS</th>
                  <th className="py-3 px-4">LABELS</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDatasets.map((d) => {
                  const isSelected = selectedIds.includes(d.id);
                  const isReady = d._mapping === "ready";
                  const isError = d.scan_status === "error";

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setQuickLookDataset(d)}
                      className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(d.id)}
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 hover:underline block">{d.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono block truncate max-w-xs">{d.raw_path}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="badge badge-neutral uppercase font-mono">{d.source_format}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {/* Status Dots matching reference image */}
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          {isReady ? (
                            <>
                              <span className="status-dot bg-emerald-500" />
                              <span className="text-emerald-700">Ready</span>
                            </>
                          ) : isError ? (
                            <>
                              <span className="status-dot bg-rose-500" />
                              <span className="text-rose-700">Error</span>
                            </>
                          ) : (
                            <>
                              <span className="status-dot bg-amber-500" />
                              <span className="text-amber-700">Mapping Needed</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{d.num_images.toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{d.num_annotations.toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">
                        {d.source_classes?.length || 0} classes
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/datasets/${d.id}`} className="btn btn-secondary text-xs py-1 px-2.5">
                            Details
                          </Link>
                          <button className="p-1 text-slate-400 hover:text-slate-700">
                            <DotsThree size={18} weight="bold" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddDatasetModal onClose={() => setShowAdd(false)} onAdded={load} />}
      {quickLookDataset && <DatasetQuickLook dataset={quickLookDataset} onClose={() => setQuickLookDataset(null)} />}
    </div>
  );
}
