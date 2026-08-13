import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CaretLeft, CaretRight, ImageBroken, PencilSimple, Trash, X } from "@phosphor-icons/react";

export default function ImageDetailModal({ item, onClose, onPrev, onNext, editHref, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm(`Remove "${item.file || "this image"}" from the working set?`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="animate-fade-scale-in fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm sm:p-6"
      style={{ animationDuration: "180ms" }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="animate-sheet-in flex max-h-full w-full max-w-5xl flex-col gap-3 overflow-hidden sm:flex-row sm:gap-4">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-card bg-black">
          {/* This inner wrapper is inline-block so it shrink-wraps to the
              image's actual rendered box (which is smaller than the outer
              container whenever the image is letterboxed by max-height).
              Box overlays are positioned as a % of this wrapper, not the
              outer container, so they stay pinned to the visible image. */}
          <div className="relative inline-block max-h-[70vh] sm:max-h-[80vh]">
            <img src={item.image_url} alt="" className="block max-h-[70vh] w-auto max-w-full sm:max-h-[80vh]" />
            {item.boxes.map((b, j) => {
              const [xc, yc, w, h] = b.bbox;
              const style = {
                left: `${(xc - w / 2) * 100}%`,
                top: `${(yc - h / 2) * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                borderColor: b.color,
              };
              return (
                <div key={j} style={style} className="absolute border-2">
                  <span
                    style={{ backgroundColor: b.color }}
                    className="absolute -top-4 left-0 whitespace-nowrap rounded-sm px-1 text-[10px] text-white"
                  >
                    {b.label}
                  </span>
                </div>
              );
            })}
            {item.boxes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                <ImageBroken size={24} className="mb-1" />
                <span className="text-xs">No annotations</span>
              </div>
            )}
          </div>
          {onPrev && (
            <button
              onClick={onPrev}
              className="btn absolute left-2 top-1/2 -translate-y-1/2 !rounded-full bg-black/45 p-2.5 text-white backdrop-blur-sm hover:bg-black/65"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="btn absolute right-2 top-1/2 -translate-y-1/2 !rounded-full bg-black/45 p-2.5 text-white backdrop-blur-sm hover:bg-black/65"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-card border border-border bg-surface sm:w-64">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
            <h4 className="text-sm font-semibold">
              {item.boxes.length} annotation{item.boxes.length === 1 ? "" : "s"}
            </h4>
            <button onClick={onClose} className="btn btn-ghost !p-1.5">
              <X size={15} weight="bold" />
            </button>
          </div>
          {item.file && <p className="break-all border-b border-border px-3.5 py-2 font-mono text-[10px] text-ink-3">{item.file}</p>}

          {(editHref || onDelete) && (
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
              {editHref && (
                <Link to={editHref} className="btn btn-secondary flex-1 !py-1.5 text-xs">
                  <PencilSimple size={13} weight="bold" />
                  Edit / Add Labels
                </Link>
              )}
              {onDelete && (
                <button onClick={handleDelete} disabled={deleting} className="btn btn-ghost !p-1.5 text-danger hover:bg-danger/10" title="Remove image">
                  <Trash size={14} weight="bold" />
                </button>
              )}
            </div>
          )}

          <ul className="max-h-[50vh] space-y-2 overflow-y-auto p-3 text-xs sm:max-h-[65vh]">
            {item.boxes.map((b, j) => (
              <li key={j} className="rounded-control border border-border p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                  <span className="font-medium text-ink">{b.label}</span>
                </div>
                <p className="font-mono text-ink-2">
                  x:{b.bbox[0].toFixed(3)} y:{b.bbox[1].toFixed(3)} w:{b.bbox[2].toFixed(3)} h:{b.bbox[3].toFixed(3)}
                </p>
              </li>
            ))}
            {item.boxes.length === 0 && <li className="text-ink-3">No annotations on this image.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
