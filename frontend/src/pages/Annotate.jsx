import { useEffect, useRef, useState } from "react";
import { useProject } from "../ProjectContext";
import { Annotate, Projects, mediaUrl } from "../api";
import BoxCanvas from "../components/BoxCanvas";
import {
  ArrowsClockwise,
  Copy,
  Crop as CropIcon,
  FloppyDisk,
  MagicWand,
  Sparkle,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";

function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").trim();
}

function ImportFolderButton({ projectId, onImported }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  const handlePick = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const root = sanitizeFolderName((files[0].webkitRelativePath || files[0].name).split("/")[0]);
    setUploading(true);
    setError("");
    setProgress({ done: 0, total: files.length });
    try {
      await Projects.uploadFolder(projectId, root, files, (done, total) => setProgress({ done, total }));
      onImported(root);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="relative">
      <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handlePick} />
      <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn btn-secondary">
        <UploadSimple size={14} weight="bold" />
        {uploading ? `Uploading ${progress.done}/${progress.total}…` : "Import folder"}
      </button>
      {error && <p className="absolute right-0 top-full z-10 mt-1 w-64 rounded-control bg-danger/10 p-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

const PAGE_SIZE = 60;
let nextLocalId = 1;

function withLocalIds(boxes) {
  return boxes.map((b) => ({ ...b, _localId: nextLocalId++ }));
}

function AugmentPanel({ onRun, onClose, running }) {
  const [ops, setOps] = useState([]);
  const OPTIONS = [
    { id: "flip_h", label: "Flip horizontal" },
    { id: "flip_v", label: "Flip vertical" },
    { id: "rotate90", label: "Rotate 90°" },
    { id: "rotate180", label: "Rotate 180°" },
    { id: "rotate270", label: "Rotate 270°" },
    { id: "brightness_up", label: "Brighter" },
    { id: "brightness_down", label: "Darker" },
    { id: "contrast_up", label: "More contrast" },
    { id: "contrast_down", label: "Less contrast" },
  ];
  const toggle = (id) => setOps((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-card border border-border bg-surface p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-ink">Generate augmented copy</p>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {OPTIONS.map((o) => (
          <label key={o.id} className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={ops.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost !py-1 text-xs">
          Cancel
        </button>
        <button onClick={() => onRun(ops)} disabled={ops.length === 0 || running} className="btn btn-primary !py-1 text-xs">
          {running ? "Generating…" : "Generate"}
        </button>
      </div>
    </div>
  );
}

export default function AnnotatePage() {
  const { projectId } = useProject();
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState("");
  const [taxonomy, setTaxonomy] = useState(null);
  const [images, setImages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editBoxes, setEditBoxes] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState("boxes"); // boxes | crop
  const [cropRect, setCropRect] = useState(null);
  const [saving, setSaving] = useState(false);
  const [autoLabeling, setAutoLabeling] = useState(false);
  const [showAugment, setShowAugment] = useState(false);
  const [augmenting, setAugmenting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cacheBust, setCacheBust] = useState(0);
  const copyTargetRef = useRef(null);

  useEffect(() => {
    if (!projectId) return;
    Annotate.folders(projectId).then(setFolders);
    Projects.taxonomy(projectId).then(setTaxonomy).catch(() => setTaxonomy(null));
  }, [projectId]);

  const loadImages = async (startOffset, replace) => {
    if (!folder) return;
    setLoadingList(true);
    try {
      const res = await Annotate.images(projectId, folder, { offset: startOffset, limit: PAGE_SIZE });
      setImages((prev) => (replace ? res.items : [...prev, ...res.items]));
      setHasMore(res.has_more);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    setImages([]);
    setSelectedIdx(null);
    setEditBoxes([]);
    setDirty(false);
    if (folder) loadImages(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const selectImage = (idx) => {
    if (dirty && !window.confirm("Discard unsaved changes to this image?")) return;
    setSelectedIdx(idx);
    setEditBoxes(withLocalIds(images[idx].boxes));
    setDirty(false);
    setMode("boxes");
    setCropRect(null);
    setError("");
  };

  const current = selectedIdx != null ? images[selectedIdx] : null;

  const setBoxes = (next) => {
    setEditBoxes(next);
    setDirty(true);
  };

  const unresolvedCount = editBoxes.filter((b) => b.class_id == null).length;

  const save = async () => {
    if (!current || unresolvedCount > 0) return;
    setSaving(true);
    setError("");
    try {
      await Annotate.save(
        projectId,
        folder,
        current.filename,
        editBoxes.map((b) => ({ class_id: b.class_id, bbox: b.bbox }))
      );
      setImages((prev) => prev.map((it, i) => (i === selectedIdx ? { ...it, boxes: editBoxes } : it)));
      setDirty(false);
      setNotice("Saved");
      setTimeout(() => setNotice(""), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  const applyCrop = async () => {
    if (!current || !cropRect) return;
    setSaving(true);
    setError("");
    try {
      await Annotate.crop(projectId, folder, current.filename, {
        x1: cropRect.x,
        y1: cropRect.y,
        x2: cropRect.x + cropRect.w,
        y2: cropRect.y + cropRect.h,
      });
      const res = await Annotate.images(projectId, folder, { offset: 0, limit: images.length });
      setImages(res.items);
      setEditBoxes(withLocalIds(res.items[selectedIdx].boxes));
      setDirty(false);
      setMode("boxes");
      setCropRect(null);
      setCacheBust((c) => c + 1);
      setNotice("Cropped");
      setTimeout(() => setNotice(""), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  const excludeCurrent = async () => {
    if (!current) return;
    if (!window.confirm(`Remove "${current.filename}" from the working set? It moves to _excluded, not permanently deleted.`)) return;
    await Annotate.exclude(projectId, folder, current.filename);
    setImages((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
    setEditBoxes([]);
  };

  const copyCurrent = async () => {
    if (!current) return;
    const target = window.prompt("Copy to which folder (under the raw datasets root)?", copyTargetRef.current || "");
    if (!target) return;
    copyTargetRef.current = target;
    await Annotate.copy(projectId, folder, current.filename, target);
    setNotice(`Copied to "${target}"`);
    setTimeout(() => setNotice(""), 2000);
  };

  const runAugment = async (ops) => {
    if (!current) return;
    setAugmenting(true);
    setError("");
    try {
      const res = await Annotate.augment(projectId, folder, current.filename, ops);
      setImages((prev) => [...prev, { filename: res.filename, boxes: res.boxes, image_url: res.image_url }]);
      setShowAugment(false);
      setNotice("Augmented copy added to the list");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setAugmenting(false);
    }
  };

  const runAutoLabel = async () => {
    if (!current) return;
    setAutoLabeling(true);
    setError("");
    try {
      const res = await Annotate.autoLabel(projectId, folder, current.filename);
      const usable = res.boxes.filter((b) => b.class_id != null);
      const skipped = res.boxes.length - usable.length;
      const added = withLocalIds(usable.map((b) => ({ class_id: b.class_id, label: b.label, color_hex: b.color_hex, bbox: b.bbox, suggested: true })));
      setBoxes([...editBoxes, ...added]);
      setNotice(
        `Added ${added.length} suggested box${added.length === 1 ? "" : "es"}${skipped ? `, skipped ${skipped} unmapped detection${skipped === 1 ? "" : "s"} (draw manually)` : ""} · review before saving`
      );
      setTimeout(() => setNotice(""), 4000);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setAutoLabeling(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Annotate</h2>
          <p className="text-xs text-ink-2">Independent from dataset normalization · label straight into the canonical taxonomy</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1.5 text-sm" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Select a folder…</option>
            {folders.map((f) => (
              <option key={f.folder_name} value={f.folder_name}>
                {f.folder_name} ({f.image_count}
                {f.image_count_capped ? "+" : ""})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              Annotate.folders(projectId).then(setFolders);
              if (folder) loadImages(0, true);
            }}
            className="btn btn-secondary"
          >
            <ArrowsClockwise size={14} weight="bold" />
            Refresh
          </button>
          <ImportFolderButton
            projectId={projectId}
            onImported={(newFolder) => {
              Annotate.folders(projectId).then(setFolders);
              setFolder(newFolder);
            }}
          />
        </div>
      </div>

      {!folder && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-20 text-center">
          <p className="text-sm text-ink-2">Pick a folder with raw images to start annotating.</p>
        </div>
      )}

      {folder && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}
            {notice && <p className="mb-3 rounded-control bg-success/10 p-2.5 text-sm text-success">{notice}</p>}

            {!current && !loadingList && images.length > 0 && (
              <div className="flex h-96 items-center justify-center rounded-card border border-dashed border-border text-sm text-ink-2">
                Select an image below to start
              </div>
            )}
            {!loadingList && images.length === 0 && (
              <div className="flex h-96 items-center justify-center rounded-card border border-dashed border-border text-sm text-ink-2">
                No images in this folder.
              </div>
            )}

            {current && taxonomy && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-ink-2">{current.filename}</span>
                  <div className="relative flex items-center gap-1.5">
                    <button onClick={runAutoLabel} disabled={autoLabeling} className="btn btn-secondary !py-1.5 text-xs">
                      <Sparkle size={13} weight="bold" />
                      {autoLabeling ? "Detecting…" : "Auto-label with YOLO26"}
                    </button>
                    <button
                      onClick={() => {
                        setMode(mode === "crop" ? "boxes" : "crop");
                        setCropRect(null);
                      }}
                      className="btn btn-secondary !py-1.5 text-xs"
                      data-active={mode === "crop"}
                      style={mode === "crop" ? { backgroundColor: "var(--color-accent)", color: "white", borderColor: "var(--color-accent)" } : {}}
                    >
                      <CropIcon size={13} weight="bold" />
                      Crop
                    </button>
                    <button onClick={copyCurrent} className="btn btn-secondary !py-1.5 text-xs">
                      <Copy size={13} weight="bold" />
                      Copy to…
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowAugment((s) => !s)} className="btn btn-secondary !py-1.5 text-xs">
                        <MagicWand size={13} weight="bold" />
                        Augment
                      </button>
                      {showAugment && <AugmentPanel onRun={runAugment} onClose={() => setShowAugment(false)} running={augmenting} />}
                    </div>
                    <button onClick={excludeCurrent} className="btn btn-secondary !py-1.5 text-xs text-danger">
                      <Trash size={13} weight="bold" />
                      Exclude
                    </button>
                  </div>
                </div>

                <BoxCanvas
                  key={`${current.filename}-${cacheBust}`}
                  imageUrl={`${mediaUrl(current.image_url)}${cacheBust ? `&t=${cacheBust}` : ""}`}
                  boxes={editBoxes}
                  onBoxesChange={setBoxes}
                  taxonomyClasses={taxonomy.classes}
                  mode={mode}
                  cropRect={cropRect}
                  onCropRectChange={setCropRect}
                />

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-ink-2">
                    {mode === "crop"
                      ? "Drag to select the region to keep, then apply."
                      : unresolvedCount > 0
                        ? `${unresolvedCount} box${unresolvedCount === 1 ? "" : "es"} carried over from the original labels need a class before you can save — click each dashed gray box and pick one.`
                        : "Drag on empty space to draw a box · click a box to edit or delete it"}
                  </p>
                  {mode === "crop" ? (
                    <button onClick={applyCrop} disabled={!cropRect || saving} className="btn btn-primary">
                      {saving ? "Cropping…" : "Apply crop"}
                    </button>
                  ) : (
                    <button onClick={save} disabled={!dirty || saving || unresolvedCount > 0} className="btn btn-primary">
                      <FloppyDisk size={14} weight="bold" />
                      {saving ? "Saving…" : unresolvedCount > 0 ? `${unresolvedCount} unresolved` : dirty ? "Save changes" : "Saved"}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {images.map((img, i) => (
                <button
                  key={img.filename + i}
                  onClick={() => selectImage(i)}
                  className={`relative aspect-square overflow-hidden rounded-control border transition-all ${
                    selectedIdx === i ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-border-strong"
                  }`}
                >
                  <img src={mediaUrl(img.image_url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {img.boxes.length > 0 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1 text-[9px] text-white">{img.boxes.length}</span>
                  )}
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="mt-3 flex justify-center">
                <button onClick={() => loadImages(images.length, false)} disabled={loadingList} className="btn btn-secondary">
                  {loadingList ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>

          <div className="card h-fit p-4 text-xs">
            <h3 className="mb-2 font-semibold text-ink">Legend</h3>
            <ul className="space-y-1.5">
              {(taxonomy?.classes || [])
                .filter((c) => !c.deprecated)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color_hex }} />
                    <span className="text-ink-2">
                      {c.id}: {c.name}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-ink-3">
              Dashed boxes are AI-suggested (YOLO26) and unconfirmed. Edit or delete them, then save to confirm.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
