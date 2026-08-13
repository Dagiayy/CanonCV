import { useEffect, useState, useCallback, useMemo } from "react";
import ImageDetailModal from "./ImageDetailModal";
import { usePersistentState } from "../hooks/usePersistentState";
import { CaretLeft, CaretRight, GridFour, ImageBroken, ListBullets, SquaresFour } from "@phosphor-icons/react";

const PAGE_SIZES = [12, 24, 48, 96];

const VIEW_MODES = [
  { id: "small", label: "Compact grid", icon: GridFour, gridClass: "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8" },
  { id: "medium", label: "Grid", icon: SquaresFour, gridClass: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" },
  { id: "large", label: "Large grid", icon: SquaresFour, gridClass: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" },
  { id: "list", label: "List", icon: ListBullets, gridClass: "" },
];

function pageWindow(current, total, span = 5) {
  const half = Math.floor(span / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  const pages = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

/**
 * Two pagination modes:
 *  - "paged" (default when fetchCount is supplied): true Page X of Y navigation,
 *    with an adjustable page size — the right fit once a dataset can run into the
 *    thousands of images and "keep clicking Load more" stops being usable.
 *  - "infinite": legacy Load-more behavior, used automatically when no fetchCount
 *    prop is given (e.g. normalization-run output browsing, where a cheap total
 *    count endpoint doesn't exist).
 */
export default function ImageGallery({ fetchPage, fetchCount, resetKey, emptyMessage = "No images.", getEditHref, onDelete }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(1);
  // View format and page size are lasting preferences, not per-session work-in-
  // progress — kept in localStorage so they stick around across visits, not just
  // one tab session.
  const [pageSize, setPageSize] = usePersistentState("gallery.pageSize", 24, { storage: "local" });
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailIndex, setDetailIndex] = useState(null);
  const [viewMode, setViewMode] = usePersistentState("gallery.viewMode", "medium", { storage: "local" });

  const paged = !!fetchCount;
  const totalPages = paged && total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;

  const loadPaged = useCallback(
    async (targetPage, size) => {
      setLoading(true);
      setError("");
      try {
        const offset = (targetPage - 1) * size;
        const res = await fetchPage(offset, size);
        setItems(res.items);
        setHasMore(res.has_more);
      } catch (err) {
        setError(err?.response?.data?.detail?.toString() || err.message);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage]
  );

  const loadInfinite = useCallback(
    async (startOffset, replace, size) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchPage(startOffset, size ?? pageSize);
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasMore(res.has_more);
      } catch (err) {
        setError(err?.response?.data?.detail?.toString() || err.message);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, pageSize]
  );

  // Reset whenever the filter identity (resetKey) changes.
  useEffect(() => {
    setItems([]);
    setPage(1);
    setTotal(null);
    setHasMore(true);
    if (paged) {
      loadPaged(1, pageSize);
      fetchCount().then(setTotal).catch(() => setTotal(null));
    } else {
      loadInfinite(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const goToPage = (p) => {
    if (p < 1 || (totalPages && p > totalPages)) return;
    setPage(p);
    loadPaged(p, pageSize);
    window.scrollTo?.({ top: window.scrollY, behavior: "instant" });
  };

  const changePageSize = (size) => {
    setPageSize(size);
    setPage(1);
    if (paged) {
      loadPaged(1, size);
    } else {
      loadInfinite(0, true, size);
    }
  };

  const initialLoad = loading && items.length === 0;
  const activeView = useMemo(() => VIEW_MODES.find((v) => v.id === viewMode) || VIEW_MODES[1], [viewMode]);

  return (
    <div>
      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      {/* Toolbar: view format + page size */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="segmented">
          {VIEW_MODES.map((v) => (
            <button key={v.id} onClick={() => setViewMode(v.id)} className="segmented-item" data-active={viewMode === v.id} title={v.label}>
              <v.icon size={14} weight="bold" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <span className="font-medium">Per page</span>
          <select
            className="input w-auto py-1.5 text-xs font-semibold"
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-16 text-center">
          <ImageBroken size={28} className="mb-2 text-ink-3" />
          <p className="text-sm text-ink-2">{emptyMessage}</p>
        </div>
      )}

      {activeView.id === "list" ? (
        <div className="divide-y divide-border rounded-card border border-border bg-surface">
          {initialLoad &&
            Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton m-2 h-14 rounded-control" />)}
          {items.map((it, i) => (
            <button
              key={it.image_url + i}
              onClick={() => setDetailIndex(i)}
              className="stagger-item animate-fade-in-up flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              style={{ "--stagger-index": i % 12 }}
            >
              <img src={it.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-control object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{it.file || `image ${i + 1}`}</span>
              <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-ink-2">
                {it.boxes.length} box{it.boxes.length === 1 ? "" : "es"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className={`grid gap-3 ${activeView.gridClass}`}>
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
      )}

      {/* Pagination footer */}
      <div className="mt-5 flex flex-col items-center justify-center gap-2">
        {paged ? (
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading} className="btn btn-secondary !p-2">
              <CaretLeft size={14} weight="bold" />
            </button>
            {totalPages &&
              pageWindow(page, totalPages).map((p) => (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  disabled={loading}
                  className={`btn !px-3 !py-2 text-xs ${p === page ? "btn-primary" : "btn-secondary"}`}
                >
                  {p}
                </button>
              ))}
            <button onClick={() => goToPage(page + 1)} disabled={(totalPages && page >= totalPages) || loading} className="btn btn-secondary !p-2">
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        ) : (
          hasMore &&
          items.length > 0 && (
            <button onClick={() => loadInfinite(items.length, false)} disabled={loading} className="btn btn-secondary">
              {loading ? "Loading…" : "Load more"}
            </button>
          )
        )}
        {paged && total != null && (
          <p className="text-xs text-ink-3">
            Page {page} of {totalPages} · {total.toLocaleString()} image{total === 1 ? "" : "s"} total
          </p>
        )}
        {!paged && !hasMore && items.length > 0 && <p className="text-xs text-ink-3">End of results · {items.length} loaded</p>}
      </div>

      {detailIndex !== null && items[detailIndex] && (
        <ImageDetailModal
          item={items[detailIndex]}
          onClose={() => setDetailIndex(null)}
          onPrev={detailIndex > 0 ? () => setDetailIndex(detailIndex - 1) : null}
          onNext={detailIndex < items.length - 1 ? () => setDetailIndex(detailIndex + 1) : null}
          editHref={getEditHref ? getEditHref(items[detailIndex]) : undefined}
          onDelete={
            onDelete
              ? async () => {
                  await onDelete(items[detailIndex]);
                  setItems((prev) => prev.filter((_, idx) => idx !== detailIndex));
                  setDetailIndex(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
