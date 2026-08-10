import { useEffect, useState, useCallback } from "react";
import ImageDetailModal from "./ImageDetailModal";
import { ImageBroken } from "@phosphor-icons/react";

const PAGE_SIZE = 24;

export default function ImageGallery({ fetchPage, resetKey, emptyMessage = "No images." }) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailIndex, setDetailIndex] = useState(null);

  const loadPage = useCallback(
    async (startOffset, replace) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchPage(startOffset, PAGE_SIZE);
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasMore(res.has_more);
        setOffset(startOffset + res.items.length);
      } catch (err) {
        setError(err?.response?.data?.detail?.toString() || err.message);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const initialLoad = loading && items.length === 0;

  return (
    <div>
      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-16 text-center">
          <ImageBroken size={28} className="mb-2 text-ink-3" />
          <p className="text-sm text-ink-2">{emptyMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {initialLoad &&
          Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square" />)}

        {items.map((it, i) => (
          <button
            key={it.image_url + i}
            onClick={() => setDetailIndex(i)}
            className="stagger-item animate-fade-in-up group relative overflow-hidden rounded-card border border-border bg-surface-2 text-left transition-all duration-200"
            style={{ "--stagger-index": i % 12, transitionTimingFunction: "var(--ease-spring)" }}
          >
            {/* No object-fit: box overlays below are positioned as a % of this
                element's own rendered box, so it must size to the image's
                natural aspect ratio exactly, or the boxes drift off the
                actual (cropped/letterboxed) visible image region. */}
            <img src={it.image_url} alt="" loading="lazy" className="block w-full transition-transform duration-300 group-hover:scale-[1.04]" style={{ transitionTimingFunction: "var(--ease-spring)" }} />
            {it.boxes.map((b, j) => {
              const [xc, yc, w, h] = b.bbox;
              const style = {
                left: `${(xc - w / 2) * 100}%`,
                top: `${(yc - h / 2) * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                borderColor: b.color,
              };
              return <div key={j} style={style} className="absolute border-2" />;
            })}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <span className="absolute bottom-1.5 left-1.5 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
              {it.boxes.length} box{it.boxes.length === 1 ? "" : "es"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        {hasMore && items.length > 0 && (
          <button onClick={() => loadPage(offset, false)} disabled={loading} className="btn btn-secondary">
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
        {!hasMore && items.length > 0 && <p className="text-xs text-ink-3">End of results · {items.length} loaded</p>}
      </div>

      {detailIndex !== null && items[detailIndex] && (
        <ImageDetailModal
          item={items[detailIndex]}
          onClose={() => setDetailIndex(null)}
          onPrev={detailIndex > 0 ? () => setDetailIndex(detailIndex - 1) : null}
          onNext={detailIndex < items.length - 1 ? () => setDetailIndex(detailIndex + 1) : null}
        />
      )}
    </div>
  );
}
