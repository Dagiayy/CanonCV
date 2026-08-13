import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects, Quality } from "../api";
import ClassDistributionChart from "../components/ClassDistributionChart";
import { usePersistentState } from "../hooks/usePersistentState";
import { ArrowsClockwise, Copy, ImageBroken, ListChecks, ShieldCheck, WarningCircle } from "@phosphor-icons/react";

function ClassBalanceCard() {
  const { projectId } = useProject();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (projectId) Quality.classBalance(projectId).then(setData);
  }, [projectId]);

  if (!data) return <div className="skeleton h-36 rounded-2xl" />;

  const rows = Object.entries(data.classes).sort((a, b) => b[1].instances - a[1].instances);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Project-Wide Class Balance (Instances vs Images)</h3>
        <span className="badge badge-accent">Distribution Health</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Post-normalization canonical class counts across every successful run in this project — the numbers a training
        job will actually see.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-4">Canonical Class</th>
              <th className="py-2.5 px-4">Instance Count</th>
              <th className="py-2.5 px-4">Image Count</th>
              <th className="py-2.5 px-4">Avg Boxes / Image</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {rows.map(([name, c]) => {
              const avg = c.images > 0 ? (c.instances / c.images).toFixed(1) : "0";
              return (
                <tr key={name} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{name}</td>
                  <td className={`py-2.5 px-4 font-bold ${c.instances === 0 ? "text-rose-600" : "text-slate-900"}`}>{c.instances.toLocaleString()}</td>
                  <td className={`py-2.5 px-4 ${c.images === 0 ? "text-rose-600" : "text-slate-700"}`}>{c.images.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-slate-500">{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HealthScoreCard({ health, numImages, numAnnotations }) {
  const gradeColor = { A: "#10b981", B: "#0ea5e9", C: "#f59e0b", D: "#f97316", F: "#ef4444" }[health.grade] || "#64748b";
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradeColor} ${health.score * 3.6}deg, #f1f5f9 0deg)` }}>
          <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-black text-slate-900">{health.score}</span>
            <span className="text-[10px] font-bold text-slate-400">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-slate-900">Dataset Health Score</h3>
            <span className="badge" style={{ backgroundColor: `${gradeColor}1a`, color: gradeColor, border: `1px solid ${gradeColor}40` }}>
              Grade {health.grade}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            {numImages.toLocaleString()} images · {numAnnotations.toLocaleString()} annotations scanned for duplicates, bounding-box
            integrity, statistical outliers, image quality, and source-label balance.
          </p>
          {health.breakdown.length === 0 ? (
            <p className="text-xs font-semibold text-emerald-700">No significant issues detected — clean bill of health.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {health.breakdown.map((b) => (
                <span key={b.category} className="badge badge-warning" title={b.detail}>
                  −{b.penalty} {b.category.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ icon: Icon, title, children }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icon size={18} className="text-indigo-600" weight="bold" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function QualityPage() {
  const { projectId } = useProject();
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = usePersistentState(`quality.datasetId.${projectId}`, "");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (projectId) Projects.datasets(projectId).then(setDatasets);
  }, [projectId]);

  const runAudit = async (id) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const data = await Quality.summary(id);
      setSummary(data);
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (datasetId) runAudit(datasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Quality Audit & Sanity Checks</h2>
            <span className="badge badge-success">Automated Integrity</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Select a dataset to instantly run a full audit: duplicates, bounding-box integrity, statistical outliers,
            image quality, and CV training-set class balance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input text-xs py-2 w-56 font-semibold" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">Select Target Dataset…</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                📁 {d.name}
              </option>
            ))}
          </select>
          {datasetId && (
            <button onClick={() => runAudit(datasetId)} disabled={loading} className="btn btn-secondary text-xs">
              <ArrowsClockwise size={15} weight="bold" className={loading ? "animate-spin" : ""} />
              {loading ? "Auditing…" : "Re-run Audit"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700">{error}</p>}

      {!datasetId && (
        <>
          <ClassBalanceCard />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <ShieldCheck size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-800">Select Dataset for Full Quality Audit</p>
            <p className="text-xs text-slate-400 mt-1">Pick a target dataset from the dropdown above — the full audit runs automatically.</p>
          </div>
        </>
      )}

      {datasetId && loading && !summary && (
        <div className="space-y-5">
          <div className="skeleton h-32 rounded-2xl" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {datasetId && summary && (
        <div className="space-y-5 animate-fade-in-up">
          <HealthScoreCard health={summary.health} numImages={summary.num_images} numAnnotations={summary.num_annotations} />

          <ClassDistributionChart
            classes={summary.class_balance.classes}
            title={`Source Label Balance — CV Training Readiness (${summary.class_balance.classes.length} labels)`}
            subtitle={`Labels under ${summary.class_balance.rarity_threshold} instances (~5% of the dominant label, "${summary.class_balance.classes[0]?.label ?? "-"}") are flagged rare and should be prioritized for collection or oversampling before training.`}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ResultPanel icon={Copy} title="Near-Duplicate Image Scan">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <p className="font-bold text-slate-800">{summary.duplicates.images_scanned} images scanned</p>
                <p className="text-slate-600">{summary.duplicates.exact_duplicate_group_count} exact duplicate group(s) identified</p>
                <p className="text-slate-600">
                  {summary.duplicates.near_dup_scan_skipped
                    ? "Pairwise near-duplicate comparison skipped (dataset exceeds size limit)"
                    : `${summary.duplicates.near_duplicate_pairs.length} near-duplicate pair(s) flagged`}
                </p>
              </div>
            </ResultPanel>

            <ResultPanel icon={ListChecks} title="Bounding Box Sanity Audit">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <p className="font-bold text-slate-800">{summary.validation.images_checked} images, {summary.validation.annotations_checked} annotations audited</p>
                <p className="text-slate-600">{summary.validation.bbox_warnings.length} coordinate out-of-bounds or zero-area warnings</p>
                <p className="text-slate-600">{summary.validation.orphan_image_count} unannotated orphan images</p>
              </div>
            </ResultPanel>

            <ResultPanel icon={WarningCircle} title="Aspect Ratio & Size Outliers">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <p className="font-bold text-slate-800">{summary.outliers.boxes_checked} boxes checked</p>
                <p className="text-slate-600">{summary.outliers.flagged_total} flagged statistical outliers</p>
                {summary.outliers.aspect_ratio_stats?.p95 && <p className="text-slate-600">Aspect ratio 95th percentile: {summary.outliers.aspect_ratio_stats.p95.toFixed(2)}</p>}
              </div>
            </ResultPanel>

            <ResultPanel icon={ImageBroken} title="Image Quality & Blur Analysis">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <p className="font-bold text-slate-800">
                  {summary.image_quality.images_scanned} images scanned{summary.image_quality.sampled ? ` (sampled from ${summary.image_quality.images_total})` : ""}
                </p>
                <p className="text-slate-600">{summary.image_quality.flagged_total} flagged for severe blur or exposure anomalies</p>
              </div>
            </ResultPanel>
          </div>

          <ClassBalanceCard />
        </div>
      )}
    </div>
  );
}
