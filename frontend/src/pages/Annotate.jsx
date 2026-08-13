import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProject } from "../ProjectContext";
import { Annotate, Projects, mediaUrl } from "../api";
import BoxCanvas from "../components/BoxCanvas";
import Spinner from "../components/Spinner";
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  Copy,
  Crop as CropIcon,
  FloppyDisk,
  MagicWand,
  PencilSimple,
  Sparkle,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";

function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").trim();
}

// Resume-where-you-left-off: last folder/image are cached per browser tab so a
// refresh (or navigating away and back) doesn't drop you back at square one.
// An explicit ?folder=/?file= deep link (e.g. from Browse Images' "Edit" button)
// always wins over whatever was cached.
function readSessionSafe(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSessionSafe(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable (private browsing quota, etc.) — silently skip caching
  }
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

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="relative">
      <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handlePick} />
      <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn btn-secondary text-xs">
        {uploading ? <Spinner size={15} /> : <UploadSimple size={15} weight="bold" />}
        {uploading ? `Uploading ${progress.done}/${progress.total}…` : "Import Folder"}
      </button>
      {uploading && progress.total > 0 && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-1.5 rounded-full bg-indigo-600 transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="absolute right-0 top-full z-10 mt-1 w-64 rounded-xl bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">{error}</p>}
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
    { id: "flip_h", label: "Flip Horizontal" },
    { id: "flip_v", label: "Flip Vertical" },
    { id: "rotate90", label: "Rotate 90°" },
    { id: "rotate180", label: "Rotate 180°" },
    { id: "rotate270", label: "Rotate 270°" },
    { id: "brightness_up", label: "Brighter" },
    { id: "brightness_down", label: "Darker" },
    { id: "contrast_up", label: "More Contrast" },
    { id: "contrast_down", label: "Less Contrast" },
  ];
  const toggle = (id) => setOps((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="mb-2 text-xs font-bold text-slate-800">Generate Augmented Variant</p>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {OPTIONS.map((o) => (
          <label key={o.id} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" checked={ops.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
        <button onClick={onClose} className="btn btn-ghost text-xs py-1">
          Cancel
        </button>
        <button onClick={() => onRun(ops)} disabled={ops.length === 0 || running} className="btn btn-primary text-xs py-1">
          {running && <Spinner size={13} />}
          {running ? "Generating…" : "Generate"}
        </button>
      </div>
    </div>
  );
}

export default function AnnotatePage() {
  const { projectId } = useProject();
  const [searchParams] = useSearchParams();
  // basename to auto-select once this folder's images load, from a ?file= deep link or the
  // last-viewed image cached for this folder (useRef's initial-value argument is only
  // consumed on the very first render, which is exactly what we want here)
  const pendingFileRef = useRef(
    searchParams.get("file") || readSessionSafe(`annotate.lastFile.${searchParams.get("folder") || readSessionSafe("annotate.lastFolder") || ""}`)
  );
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState(() => searchParams.get("folder") || readSessionSafe("annotate.lastFolder") || "");
  const [taxonomy, setTaxonomy] = useState(null);
  const [images, setImages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editBoxes, setEditBoxes] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState("boxes");
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

  // Auto-start on the first image (or the one requested via ?file=) as soon as a
  // folder's images are in — no more staring at a bare grid and having to click
  // before you can start labeling.
  useEffect(() => {
    if (images.length === 0 || selectedIdx !== null) return;
    const targetFile = pendingFileRef.current;
    pendingFileRef.current = null;
    let idx = 0;
    if (targetFile) {
      const found = images.findIndex((img) => img.filename.split("/").pop() === targetFile);
      if (found >= 0) idx = found;
    }
    selectImage(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

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

  useEffect(() => {
    if (folder) writeSessionSafe("annotate.lastFolder", folder);
  }, [folder]);
  useEffect(() => {
    if (folder && current) writeSessionSafe(`annotate.lastFile.${folder}`, current.filename);
  }, [folder, current]);

  const setBoxes = (next) => {
    setEditBoxes(next);
    setDirty(true);
  };

  const unresolvedCount = editBoxes.filter((b) => b.class_id == null).length;

  const save = async () => {
    if (!current || unresolvedCount > 0) return false;
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
      setNotice("Saved successfully!");
      setTimeout(() => setNotice(""), 1500);
      return true;
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goPrev = () => {
    if (selectedIdx != null && selectedIdx > 0) selectImage(selectedIdx - 1);
  };
  const goNext = () => {
    if (selectedIdx != null && selectedIdx < images.length - 1) selectImage(selectedIdx + 1);
  };
  const saveAndNext = async () => {
    const ok = dirty ? await save() : true;
    if (ok && selectedIdx != null && selectedIdx < images.length - 1) selectImage(selectedIdx + 1);
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
      setNotice("Image cropped successfully!");
      setTimeout(() => setNotice(""), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  const excludeCurrent = async () => {
    if (!current) return;
    if (!window.confirm(`Remove "${current.filename}" from working set?`)) return;
    await Annotate.exclude(projectId, folder, current.filename);
    setImages((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
    setEditBoxes([]);
  };

  const copyCurrent = async () => {
    if (!current) return;
    const target = window.prompt("Copy to folder (under raw datasets root)?", copyTargetRef.current || "");
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
      setNotice("Augmented copy added to dataset list!");
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
        `Added ${added.length} suggested box${added.length === 1 ? "" : "es"}${skipped ? `, skipped ${skipped} unmapped detection${skipped === 1 ? "" : "s"}` : ""} · review before saving`
      );
      setTimeout(() => setNotice(""), 4000);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setAutoLabeling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Annotation Studio</h2>
            <span className="badge badge-accent">YOLO26 Powered</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Draw, adjust, crop, and auto-label bounding box annotations directly into the canonical taxonomy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto text-xs py-2 font-semibold" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Select Raw Image Folder…</option>
            {folders.map((f) => (
              <option key={f.folder_name} value={f.folder_name}>
                📁 {f.folder_name} ({f.image_count} images)
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              Annotate.folders(projectId).then(setFolders);
              if (folder) loadImages(0, true);
            }}
            className="btn btn-secondary text-xs"
          >
            <ArrowsClockwise size={15} weight="bold" />
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <Sparkle size={32} className="text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-800">No Image Folder Selected</p>
          <p className="text-xs text-slate-400 mt-1">Select an existing folder above or import a new folder to start labeling.</p>
        </div>
      )}

      {folder && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            {error && <p className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">{error}</p>}
            {notice && <p className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-700">{notice}</p>}

            {!current && !loadingList && images.length > 0 && (
              <div className="flex h-[450px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                Select an image from the gallery grid below to start editing
              </div>
            )}

            {current && taxonomy && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                {/* Toolbar */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <button onClick={goPrev} disabled={selectedIdx === 0} className="btn btn-secondary !p-1.5" title="Previous image">
                      <CaretLeft size={14} weight="bold" />
                    </button>
                    <span className="font-mono text-xs font-bold text-slate-700 truncate">
                      {current.filename} <span className="text-slate-400 font-sans font-semibold">({selectedIdx + 1}/{images.length})</span>
                    </span>
                    <button onClick={goNext} disabled={selectedIdx === images.length - 1} className="btn btn-secondary !p-1.5" title="Next image">
                      <CaretRight size={14} weight="bold" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={runAutoLabel} disabled={autoLabeling} className="btn btn-primary text-xs py-1.5 px-3">
                      {autoLabeling ? <Spinner size={15} /> : <Sparkle size={15} weight="fill" />}
                      <span>{autoLabeling ? "Detecting..." : "Auto-Label (YOLO26)"}</span>
                    </button>
                    <button
                      onClick={() => {
                        setMode("boxes");
                        setCropRect(null);
                      }}
                      title="Click and drag on the image to draw a new box by hand"
                      className={`btn text-xs py-1.5 px-3 ${mode === "boxes" ? "btn-primary" : "btn-secondary"}`}
                    >
                      <PencilSimple size={15} weight="bold" />
                      <span>Manual Box</span>
                    </button>
                    <button
                      onClick={() => {
                        setMode(mode === "crop" ? "boxes" : "crop");
                        setCropRect(null);
                      }}
                      className={`btn text-xs py-1.5 px-3 ${mode === "crop" ? "btn-primary" : "btn-secondary"}`}
                    >
                      <CropIcon size={15} weight="bold" />
                      <span>Crop</span>
                    </button>
                    <button onClick={copyCurrent} className="btn btn-secondary text-xs py-1.5 px-3">
                      <Copy size={15} weight="bold" />
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowAugment((s) => !s)} className="btn btn-secondary text-xs py-1.5 px-3">
                        <MagicWand size={15} weight="bold" />
                        <span>Augment</span>
                      </button>
                      {showAugment && <AugmentPanel onRun={runAugment} onClose={() => setShowAugment(false)} running={augmenting} />}
                    </div>
                    <button onClick={excludeCurrent} className="btn btn-ghost text-xs py-1.5 px-2 text-rose-600 hover:bg-rose-50">
                      <Trash size={15} weight="bold" />
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

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {mode === "crop"
                      ? "Drag box to crop image bounds"
                      : "Manual Box mode: click and drag on an empty part of the image to draw a new box"}
                    {mode === "boxes" && unresolvedCount > 0 && (
                      <span className="ml-2 font-semibold text-amber-600">· {unresolvedCount} box(es) need taxonomy assignment</span>
                    )}
                  </p>
                  {mode === "crop" ? (
                    <button onClick={applyCrop} disabled={!cropRect || saving} className="btn btn-primary text-xs">
                      {saving && <Spinner size={14} />}
                      {saving ? "Cropping..." : "Apply Crop"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={save} disabled={!dirty || saving || unresolvedCount > 0} className="btn btn-secondary text-xs">
                        {saving ? <Spinner size={15} /> : <FloppyDisk size={15} weight="bold" />}
                        {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
                      </button>
                      <button
                        onClick={saveAndNext}
                        disabled={saving || unresolvedCount > 0 || selectedIdx === images.length - 1}
                        className="btn btn-primary text-xs"
                        title="Save this image's labels and move to the next one"
                      >
                        {saving ? <Spinner size={15} /> : <CaretRight size={15} weight="bold" />}
                        {saving ? "Saving..." : "Save & Next"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Images Grid Carousel */}
            <div className="mt-6">
              <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Folder Images ({images.length})</h3>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {images.map((img, i) => (
                  <button
                    key={img.filename + i}
                    onClick={() => selectImage(i)}
                    className={`relative aspect-square overflow-hidden rounded-xl border transition-all ${
                      selectedIdx === i ? "border-indigo-600 ring-2 ring-indigo-500/30 scale-95" : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <img src={mediaUrl(img.image_url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {img.boxes.length > 0 && (
                      <span className="absolute bottom-1 right-1 rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {img.boxes.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button onClick={() => loadImages(images.length, false)} disabled={loadingList} className="btn btn-secondary text-xs">
                    {loadingList ? "Loading..." : "Load More Images"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Taxonomy Side Legend */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs h-fit space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Taxonomy Classes</h3>
            <div className="space-y-2">
              {(taxonomy?.classes || [])
                .filter((c) => !c.deprecated)
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <span className="h-3 w-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: c.color_hex }} />
                    <span className="font-bold text-slate-800">#{c.id}</span>
                    <span className="text-slate-600 font-medium truncate">{c.name}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
