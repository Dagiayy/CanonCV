import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects, Quality } from "../api";
import { Copy, ImageBroken, ListChecks, Sparkle, WarningCircle } from "@phosphor-icons/react";

function ClassBalanceCard() {
  const { projectId } = useProject();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (projectId) Quality.classBalance(projectId).then(setData);
  }, [projectId]);

  if (!data) return <div className="skeleton h-32" />;

  const rows = Object.entries(data.classes).sort((a, b) => b[1].instances - a[1].instances);

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Class balance · instances vs. images (project-wide)</h3>
      <p className="mb-3 text-xs text-ink-2">
        Instance count and image count are different metrics: 100 instances could be 100 images with one box each, or 2
        images with 50 boxes each.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="py-1.5 pr-4">Class</th>
              <th className="py-1.5 pr-4">Instances</th>
              <th className="py-1.5 pr-4">Images</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, c]) => (
              <tr key={name} className="border-t border-border">
                <td className="py-1.5 pr-4 font-mono text-xs">{name}</td>
                <td className={`py-1.5 pr-4 ${c.instances === 0 ? "text-danger" : "text-ink"}`}>{c.instances}</td>
                <td className={`py-1.5 pr-4 ${c.images === 0 ? "text-danger" : "text-ink"}`}>{c.images}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckPanel({ icon: Icon, title, onRun, running, children }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon size={16} weight="bold" />
          {title}
        </h3>
        <button onClick={onRun} disabled={running} className="btn btn-secondary !py-1.5 text-xs">
          {running ? "Running…" : "Run check"}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function QualityPage() {
  const { projectId } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState("");
  const [running, setRunning] = useState("");
  const [results, setResults] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (projectId) Projects.datasets(projectId).then(setDatasets);
  }, [projectId]);

  const run = async (key, fn) => {
    setRunning(key);
    setError("");
    try {
      const data = await fn();
      setResults((r) => ({ ...r, [key]: data }));
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setRunning("");
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">Data quality</h2>
        <p className="text-xs text-ink-2">Duplicate detection, annotation validation, outliers, and image quality scoring</p>
      </div>

      <div className="mb-5">
        <ClassBalanceCard />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <select className="input w-auto py-1.5 text-sm" value={datasetId} onChange={(e) => { setDatasetId(e.target.value); setResults({}); }}>
          <option value="">Select a dataset…</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      {datasetId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CheckPanel icon={Copy} title="Duplicates" onRun={() => run("dup", () => Quality.duplicates(datasetId))} running={running === "dup"}>
            {results.dup && (
              <div className="text-xs text-ink-2">
                <p>{results.dup.images_scanned} images scanned</p>
                <p>{results.dup.exact_duplicate_group_count} exact-duplicate group(s)</p>
                <p>
                  {results.dup.near_dup_scan_skipped
                    ? "Near-duplicate scan skipped (dataset too large for pairwise comparison)"
                    : `${results.dup.near_duplicate_pairs.length} near-duplicate pair(s)`}
                </p>
              </div>
            )}
          </CheckPanel>

          <CheckPanel icon={ListChecks} title="Annotation validation" onRun={() => run("val", () => Quality.validation(datasetId))} running={running === "val"}>
            {results.val && (
              <div className="text-xs text-ink-2">
                <p>{results.val.images_checked} images, {results.val.annotations_checked} annotations checked</p>
                <p>{results.val.bbox_warnings.length} bbox warning(s)</p>
                <p>{results.val.orphan_image_count} image(s) with zero annotations</p>
              </div>
            )}
          </CheckPanel>

          <CheckPanel icon={WarningCircle} title="Bbox outliers" onRun={() => run("out", () => Quality.outliers(datasetId))} running={running === "out"}>
            {results.out && (
              <div className="text-xs text-ink-2">
                <p>{results.out.boxes_checked} boxes checked, {results.out.flagged_total} flagged</p>
                {results.out.aspect_ratio_stats?.p95 && <p>Aspect ratio p95: {results.out.aspect_ratio_stats.p95.toFixed(2)}</p>}
              </div>
            )}
          </CheckPanel>

          <CheckPanel icon={ImageBroken} title="Image quality" onRun={() => run("qual", () => Quality.imageQuality(datasetId, { sample_size: 300 }))} running={running === "qual"}>
            {results.qual && (
              <div className="text-xs text-ink-2">
                <p>
                  {results.qual.images_scanned} scanned{results.qual.sampled ? ` (sampled from ${results.qual.images_total})` : ""}
                </p>
                <p>{results.qual.flagged_total} flagged (blur / exposure / contrast)</p>
              </div>
            )}
          </CheckPanel>
        </div>
      )}

      {!datasetId && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-16 text-center">
          <Sparkle size={26} className="mb-2 text-ink-3" />
          <p className="text-sm text-ink-2">Select a dataset to run quality checks.</p>
        </div>
      )}
    </div>
  );
}
