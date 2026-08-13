import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, MagnifyingGlassMinus, MagnifyingGlassPlus, Trash } from "@phosphor-icons/react";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

const HANDLES = ["nw", "ne", "sw", "se"];
let nextLocalId = 1;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function rectFromPoints(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

function rectToBBox(rect) {
  return [rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h];
}

function bboxToRect(bbox) {
  const [xc, yc, w, h] = bbox;
  return { x: xc - w / 2, y: yc - h / 2, w, h };
}

/**
 * Interactive bounding-box editor over an image, in normalized [0,1] coordinates.
 * mode="boxes": draw new boxes (mousedown-drag on empty space), select/move/resize/
 *   delete existing ones. mode="crop": draw a single crop rectangle instead.
 */
export default function BoxCanvas({
  imageUrl,
  boxes,
  onBoxesChange,
  taxonomyClasses,
  mode = "boxes",
  cropRect,
  onCropRectChange,
  minBoxSize = 0.006,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const pendingBoxRef = useRef(null);
  const editBarRef = useRef(null);
  const [drawRect, setDrawRect] = useState(null); // in-progress draw, screen-space normalized
  const [pendingBox, setPendingBox] = useState(null); // finished draw awaiting class pick, boxes mode
  const [selectedId, setSelectedId] = useState(null);
  const dragRef = useRef(null); // { type: 'move'|'resize'|'draw'|'crop', ... }

  // Zoom: 1 = "fit" sizing (CSS max-h/max-w, the default). >1 switches to an
  // explicit pixel width (a multiple of the fit-width measured on image load)
  // so the user can zoom in to place boxes precisely; the outer wrapper then
  // scrolls to pan. Box overlays stay aligned at any zoom because they're
  // percentage-positioned relative to this same container, and toNorm reads
  // the container's actual (zoomed) getBoundingClientRect — no separate
  // coordinate transform needed.
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(null);

  const handleImgLoad = () => {
    if (imgRef.current) setFitWidth(imgRef.current.getBoundingClientRect().width);
  };
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // Keep the class-picker popup and the selected-box edit toolbar visible when
  // they'd otherwise land outside the current scroll viewport (e.g. a box
  // drawn near the bottom edge while zoomed in).
  useEffect(() => {
    if (pendingBox) pendingBoxRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pendingBox]);
  useEffect(() => {
    if (selectedId != null) editBarRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  const toNorm = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = toNorm(e.clientX, e.clientY);

      if (drag.type === "draw" || drag.type === "crop") {
        setDrawRect(rectFromPoints(drag.start.x, drag.start.y, p.x, p.y));
        return;
      }
      if (drag.type === "move") {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        let nx = drag.origRect.x + dx;
        let ny = drag.origRect.y + dy;
        nx = Math.min(Math.max(nx, 0), 1 - drag.origRect.w);
        ny = Math.min(Math.max(ny, 0), 1 - drag.origRect.h);
        updateBoxRect(drag.boxId, { ...drag.origRect, x: nx, y: ny });
        return;
      }
      if (drag.type === "resize") {
        let { x, y, w, h } = drag.origRect;
        const x2 = x + w;
        const y2 = y + h;
        if (drag.handle.includes("w")) {
          x = Math.min(p.x, x2 - minBoxSize);
        }
        if (drag.handle.includes("e")) {
          w = Math.max(p.x - x, minBoxSize);
        }
        if (drag.handle.includes("n")) {
          y = Math.min(p.y, y2 - minBoxSize);
        }
        if (drag.handle.includes("s")) {
          h = Math.max(p.y - y, minBoxSize);
        }
        if (drag.handle.includes("w")) w = x2 - x;
        if (drag.handle.includes("n")) h = y2 - y;
        updateBoxRect(drag.boxId, { x: clamp01(x), y: clamp01(y), w, h });
      }
    };

    const onUp = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.type === "draw") {
        const p = toNorm(e.clientX, e.clientY);
        const rect = rectFromPoints(drag.start.x, drag.start.y, p.x, p.y);
        setDrawRect(null);
        if (rect.w > minBoxSize && rect.h > minBoxSize) {
          setPendingBox(rect);
        }
      } else if (drag.type === "crop") {
        const p = toNorm(e.clientX, e.clientY);
        const rect = rectFromPoints(drag.start.x, drag.start.y, p.x, p.y);
        setDrawRect(null);
        if (rect.w > minBoxSize && rect.h > minBoxSize) {
          onCropRectChange?.(rect);
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toNorm, boxes]);

  const updateBoxRect = (id, rect) => {
    onBoxesChange(boxes.map((b) => (b._localId === id ? { ...b, bbox: rectToBBox(rect) } : b)));
  };

  const startDraw = (e) => {
    if (e.target !== containerRef.current && !e.target.dataset.canvasBg) return;
    setSelectedId(null);
    const p = toNorm(e.clientX, e.clientY);
    dragRef.current = { type: mode === "crop" ? "crop" : "draw", start: p };
  };

  const startMove = (e, box) => {
    e.stopPropagation();
    setSelectedId(box._localId);
    const p = toNorm(e.clientX, e.clientY);
    dragRef.current = { type: "move", boxId: box._localId, start: p, origRect: bboxToRect(box.bbox) };
  };

  const startResize = (e, box, handle) => {
    e.stopPropagation();
    setSelectedId(box._localId);
    dragRef.current = { type: "resize", boxId: box._localId, handle, origRect: bboxToRect(box.bbox) };
  };

  const deleteBox = (id) => {
    onBoxesChange(boxes.filter((b) => b._localId !== id));
    setSelectedId(null);
  };

  const setBoxClass = (id, cls) => {
    onBoxesChange(
      boxes.map((b) =>
        b._localId === id ? { ...b, class_id: cls.id, label: cls.name, color_hex: cls.color_hex, suggested: false, needs_review: false } : b
      )
    );
  };

  const commitPendingBox = (cls) => {
    const newBox = {
      _localId: nextLocalId++,
      class_id: cls.id,
      label: cls.name,
      color_hex: cls.color_hex,
      bbox: rectToBBox(pendingBox),
    };
    onBoxesChange([...boxes, newBox]);
    setPendingBox(null);
    setSelectedId(newBox._localId);
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId != null && document.activeElement === document.body) {
        deleteBox(selectedId);
      }
      if (e.key === "Escape") {
        setPendingBox(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, boxes]);

  const activeClasses = (taxonomyClasses || []).filter((c) => !c.deprecated);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-1 text-[11px] font-semibold text-slate-400">Zoom to draw precisely</span>
        <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} className="btn btn-secondary !p-1.5" title="Zoom out">
          <MagnifyingGlassMinus size={14} weight="bold" />
        </button>
        <span className="w-11 text-center font-mono text-xs font-bold text-slate-600">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} className="btn btn-secondary !p-1.5" title="Zoom in">
          <MagnifyingGlassPlus size={14} weight="bold" />
        </button>
        <button type="button" onClick={zoomReset} disabled={zoom === 1} className="btn btn-secondary !p-1.5" title="Reset zoom">
          <ArrowCounterClockwise size={14} weight="bold" />
        </button>
      </div>

      <div className="w-full overflow-auto rounded-card bg-black text-center" style={{ maxHeight: "70vh" }}>
        <div
          ref={containerRef}
          data-canvas-bg
          onMouseDown={startDraw}
          className="relative inline-block select-none"
          style={{ cursor: mode === "crop" ? "crosshair" : "default" }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            data-canvas-bg
            draggable={false}
            onLoad={handleImgLoad}
            className="pointer-events-none block rounded-card"
            style={
              zoom === 1 || !fitWidth
                ? { maxHeight: "70vh", width: "auto", maxWidth: "100%" }
                : { width: `${fitWidth * zoom}px`, height: "auto", maxWidth: "none", maxHeight: "none" }
            }
          />

      {mode === "boxes" &&
        boxes.map((b) => {
          const rect = bboxToRect(b.bbox);
          const style = { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` };
          const selected = selectedId === b._localId;
          return (
            <div
              key={b._localId}
              style={{ ...style, borderColor: b.color_hex }}
              className={`absolute border-2 ${b.suggested || b.needs_review ? "border-dashed" : ""} ${selected ? "z-10 ring-2 ring-white/70" : ""}`}
              onMouseDown={(e) => startMove(e, b)}
            >
              <span
                style={{ backgroundColor: b.color_hex }}
                className="pointer-events-none absolute -top-5 left-0 flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-white"
              >
                {b.suggested && "AI · "}
                {b.needs_review && "Unmapped · "}
                {b.label}
              </span>
              {selected && (
                <>
                  {HANDLES.map((h) => (
                    <div
                      key={h}
                      onMouseDown={(e) => startResize(e, b, h)}
                      className="absolute h-2.5 w-2.5 rounded-full border border-white bg-accent"
                      style={{
                        cursor: `${h}-resize`,
                        top: h.includes("n") ? -5 : undefined,
                        bottom: h.includes("s") ? -5 : undefined,
                        left: h.includes("w") ? -5 : undefined,
                        right: h.includes("e") ? -5 : undefined,
                      }}
                    />
                  ))}
                  <div ref={editBarRef} className="absolute -bottom-9 left-0 flex items-center gap-1 rounded-control border border-border bg-surface p-1 shadow-lg">
                    <select
                      value={b.class_id ?? ""}
                      onChange={(e) => {
                        const cls = activeClasses.find((c) => c.id === Number(e.target.value));
                        if (cls) setBoxClass(b._localId, cls);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="rounded-[8px] border border-border bg-surface px-1.5 py-1 text-xs"
                    >
                      {b.class_id == null && (
                        <option value="" disabled>
                          {b.label ? `Was "${b.label}" — pick a class` : "Pick a class"}
                        </option>
                      )}
                      {activeClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id}: {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        deleteBox(b._localId);
                      }}
                      className="btn btn-ghost !p-1.5 text-danger"
                    >
                      <Trash size={13} weight="bold" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

      {mode === "crop" &&
        boxes.map((b) => {
          const rect = bboxToRect(b.bbox);
          const style = { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` };
          return <div key={b._localId} style={{ ...style, borderColor: b.color_hex }} className="pointer-events-none absolute border border-dashed opacity-40" />;
        })}

      {mode === "crop" && cropRect && !drawRect && (
        <div
          className="absolute border-2 border-accent bg-accent/10"
          style={{ left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%` }}
        />
      )}

      {drawRect && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10"
          style={{ left: `${drawRect.x * 100}%`, top: `${drawRect.y * 100}%`, width: `${drawRect.w * 100}%`, height: `${drawRect.h * 100}%` }}
        />
      )}

      {pendingBox && (
        <div
          ref={pendingBoxRef}
          className="absolute z-20 flex items-center gap-1 rounded-control border border-border bg-surface p-1 shadow-lg"
          style={{ left: `${pendingBox.x * 100}%`, top: `${(pendingBox.y + pendingBox.h) * 100}%` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => {
              const cls = activeClasses.find((c) => c.id === Number(e.target.value));
              if (cls) commitPendingBox(cls);
            }}
            className="rounded-[8px] border border-border bg-surface px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              Label as…
            </option>
            {activeClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}: {c.name}
              </option>
            ))}
          </select>
          <button onClick={() => setPendingBox(null)} className="btn btn-ghost !p-1.5 text-danger">
            <Trash size={13} weight="bold" />
          </button>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
