import { useEffect, useState } from "react";
import { Datasets, mediaUrl } from "../api";
import Sheet from "./Sheet";
import { X } from "@phosphor-icons/react";

export default function SampleViewerModal({ datasetId, label, onClose }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Datasets.samples(datasetId, { label, limit: 6 })
      .then(setSamples)
      .catch((err) => setError(err?.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [datasetId, label]);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-tight">
          Sample images{label ? <span className="text-ink-2"> · {label}</span> : ""}
        </h3>
        <button onClick={onClose} className="btn btn-ghost !p-1.5">
          <X size={16} weight="bold" />
        </button>
      </div>

      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      )}

      {!loading && samples.length === 0 && <p className="text-sm text-ink-2">No samples found.</p>}

      <div className="max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {samples.map((s, i) => (
            <div
              key={i}
              className="stagger-item animate-fade-in-up relative overflow-hidden rounded-card border border-border bg-surface-2"
              style={{ "--stagger-index": i }}
            >
              <img src={mediaUrl(s.image_url)} alt="" className="block w-full" />
              {s.boxes.map((b, j) => {
                const [xc, yc, w, h] = b.bbox;
                const style = {
                  left: `${(xc - w / 2) * 100}%`,
                  top: `${(yc - h / 2) * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                };
                const highlight = !label || b.label === label;
                return (
                  <div
                    key={j}
                    style={style}
                    className={`absolute border-2 ${highlight ? "border-danger" : "border-ink-3/60"}`}
                    title={b.label}
                  >
                    <span
                      className={`absolute -top-4 left-0 whitespace-nowrap rounded-sm px-1 text-[10px] text-white ${
                        highlight ? "bg-danger" : "bg-ink-3/80"
                      }`}
                    >
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
