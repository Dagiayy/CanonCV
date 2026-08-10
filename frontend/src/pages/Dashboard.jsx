import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useProject } from "../ProjectContext";
import { Datasets, Projects } from "../api";
import StatusBadge from "../components/StatusBadge";
import Sheet from "../components/Sheet";
import { FolderOpen, Image as ImageIcon, Plus, Stack, Tag, UploadSimple, WarningCircle } from "@phosphor-icons/react";

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
    const root = (files[0].webkitRelativePath || files[0].name).split("/")[0];
    setPickedFiles(files);
    setFolderName(sanitizeFolderName(root));
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
    <form onSubmit={submit}>
      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

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
          className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border py-10 text-center hover:border-border-strong hover:bg-surface-2"
        >
          <UploadSimple size={24} className="text-ink-3" />
          <span className="text-sm font-medium text-ink">Choose a folder from your computer</span>
          <span className="text-xs text-ink-2">Opens your system's folder browser, same as any file upload</span>
        </button>
      ) : (
        <div className="mb-4 rounded-card border border-border bg-surface-2 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">{pickedFiles.length.toLocaleString()} files selected</span>
            <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-medium text-accent hover:underline">
              change
            </button>
          </div>
          <p className="text-xs text-ink-2">{(totalBytes / (1024 * 1024)).toFixed(1)} MB total</p>
        </div>
      )}

      {pickedFiles && (
        <>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Folder name, on the server
            <input className="input mt-1.5" value={folderName} onChange={(e) => setFolderName(sanitizeFolderName(e.target.value))} required />
          </label>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Display name, optional (defaults to folder name)
            <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder={folderName} />
          </label>
          <label className="mb-5 block text-sm font-medium text-ink-2">
            Note
            <input className="input mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      )}

      {uploading && (
        <div className="mb-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-1.5 rounded-full bg-accent transition-all duration-200"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-2">
            Uploading {progress.done.toLocaleString()} / {progress.total.toLocaleString()} files…
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-ghost">
          Cancel
        </button>
        <button type="submit" disabled={uploading || !pickedFiles || !folderName} className="btn btn-primary">
          {uploading ? "Uploading…" : "Upload and scan"}
        </button>
      </div>
    </form>
  );
}

function AddDatasetModal({ onClose, onAdded }) {
  const { projectId } = useProject();
  const [mode, setMode] = useState("upload"); // upload | folder | advanced
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
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-tight">Add dataset</h3>
        <div className="segmented">
          {[
            { id: "upload", label: "Upload" },
            { id: "folder", label: "On server" },
            { id: "advanced", label: "Custom path" },
          ].map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} className="segmented-item" data-active={mode === m.id}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "upload" && <UploadTab projectId={projectId} onAdded={onAdded} onClose={onClose} error={error} setError={setError} />}

      {mode !== "upload" && error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      {mode === "folder" && (
        <form onSubmit={submitFolder}>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Folder, from the raw datasets root
            {folders === null ? (
              <div className="skeleton mt-1.5 h-9" />
            ) : folders.length === 0 ? (
              <p className="mt-1.5 rounded-control bg-warning/10 px-2.5 py-2 text-xs text-warning">
                No folders found under the raw datasets root.
              </p>
            ) : (
              <select className="input mt-1.5" value={folderName} onChange={(e) => setFolderName(e.target.value)} required>
                <option value="" disabled>
                  Select a folder…
                </option>
                {folders.map((f) => (
                  <option key={f.folder_name} value={f.folder_name} disabled={f.already_registered}>
                    {f.folder_name}
                    {f.already_registered ? " (already registered)" : ""}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Display name, optional (defaults to folder name)
            <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder={folderName} />
          </label>
          <label className="mb-5 block text-sm font-medium text-ink-2">
            Note
            <input className="input mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving || !folderName} className="btn btn-primary">
              {saving ? "Scanning…" : "Add and scan"}
            </button>
          </div>
        </form>
      )}

      {mode === "advanced" && (
        <form onSubmit={submitAdvanced}>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Name
            <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="mb-3 block text-sm font-medium text-ink-2">
            Raw folder path, absolute, on the server's filesystem
            <input
              className="input mt-1.5 font-mono"
              value={rawPath}
              onChange={(e) => setRawPath(e.target.value)}
              required
              placeholder="D:\GREEN\AATB CV\normalization datases\my_dataset"
            />
          </label>
          <label className="mb-5 block text-sm font-medium text-ink-2">
            Note
            <input className="input mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Scanning…" : "Add and scan"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function statusChip(ds) {
  if (ds.scan_status === "error") return { status: "error", label: "Error" };
  if (ds.scan_status === "pending") return { status: "pending", label: "Unscanned" };
  if (ds._mapping === "ready") return { status: "ready", label: "Mapping ready" };
  if (ds._mapping === "draft") return { status: "draft", label: "Mapping in progress" };
  return { status: "scanned", label: "Mapping needed" };
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { projectId, project } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [stats, setStats] = useState({ totals: {} });
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) return <DashboardSkeleton />;

  const totalImages = datasets.reduce((a, d) => a + d.num_images, 0);
  const totalAnnotations = datasets.reduce((a, d) => a + d.num_annotations, 0);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard icon={Stack} label="Datasets" value={datasets.length} />
        <SummaryCard icon={ImageIcon} label="Total images" value={totalImages.toLocaleString()} />
        <SummaryCard icon={Tag} label="Total annotations" value={totalAnnotations.toLocaleString()} />
        <SummaryCard icon={FolderOpen} label="Canonical classes covered" value={Object.keys(stats.totals || {}).length} />
      </div>

      {Object.keys(stats.totals || {}).length > 0 && (
        <div className="card mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">
            Per-canonical-class instances · {stats.runs_included} successful run{stats.runs_included === 1 ? "" : "s"}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.totals).map(([name, count]) => (
              <span key={name} className={`badge ${count === 0 ? "bg-danger/10 text-danger" : "bg-black/[0.05] text-ink-2"}`}>
                {count === 0 && <WarningCircle size={11} weight="bold" />}
                {name}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-tight">{project.name}</h2>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">
          <Plus size={14} weight="bold" />
          Add dataset
        </button>
      </div>

      {datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-20 text-center">
          <Stack size={28} className="mb-3 text-ink-3" />
          <p className="mb-1 text-sm font-medium text-ink">No datasets yet</p>
          <p className="mb-4 text-xs text-ink-2">Add one from the raw datasets folder to start mapping labels.</p>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">
            <Plus size={14} weight="bold" />
            Add dataset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((d, i) => {
            const chip = statusChip(d);
            return (
              <Link
                to={`/datasets/${d.id}`}
                key={d.id}
                className="card-interactive stagger-item animate-fade-in-up block p-4"
                style={{ "--stagger-index": i }}
              >
                <div className="mb-2.5 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-tight text-ink">{d.name}</h3>
                  <StatusBadge status={chip.status}>{chip.label}</StatusBadge>
                </div>
                <span className="badge mb-3 bg-black/[0.05] text-ink-2">{d.source_format}</span>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                  <dt className="text-ink-2">Images</dt>
                  <dd className="text-right font-medium text-ink">{d.num_images.toLocaleString()}</dd>
                  <dt className="text-ink-2">Annotations</dt>
                  <dd className="text-right font-medium text-ink">{d.num_annotations.toLocaleString()}</dd>
                  <dt className="text-ink-2">Distinct labels</dt>
                  <dd className="text-right font-medium text-ink">{d.source_classes.length}</dd>
                </dl>
                {d.scan_status === "error" && <p className="mt-2.5 text-xs text-danger">{d.scan_error}</p>}
              </Link>
            );
          })}
        </div>
      )}

      {showAdd && <AddDatasetModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
        <Icon size={18} weight="bold" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs text-ink-2">{label}</div>
        <div className="text-xl font-semibold tracking-tight text-ink">{value}</div>
      </div>
    </div>
  );
}
