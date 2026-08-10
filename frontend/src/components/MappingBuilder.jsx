import { useEffect, useState } from "react";
import { Datasets } from "../api";
import SampleViewerModal from "./SampleViewerModal";
import StatusBadge from "./StatusBadge";
import { Eye } from "@phosphor-icons/react";

const ACTIONS = [
  { value: "map", label: "Map to class" },
  { value: "drop", label: "Drop" },
  { value: "review", label: "Send to review" },
];

const ACTION_DOT = { map: "bg-success", drop: "bg-danger", review: "bg-warning", "": "bg-ink-3" };

export default function MappingBuilder({ dataset, taxonomy, onSaved }) {
  const [entries, setEntries] = useState({}); // label -> {action, target_class_id}
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(null);
  const [version, setVersion] = useState(null);
  const [sampleLabel, setSampleLabel] = useState(undefined); // undefined = closed
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const mt = await Datasets.mapping(dataset.id).catch(() => null);
    const base = {};
    for (const lc of dataset.source_classes) {
      base[lc.label] = { action: "", target_class_id: null };
    }
    if (mt) {
      for (const e of mt.entries) {
        base[e.source_label] = { action: e.action, target_class_id: e.target_class_id };
      }
      setNotes(mt.notes || "");
      setStatus(mt.status);
      setVersion(mt.version);
    } else {
      setNotes("");
      setStatus(null);
      setVersion(null);
    }
    setEntries(base);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id]);

  const setEntry = (label, patch) => {
    setEntries((es) => ({ ...es, [label]: { ...es[label], ...patch } }));
  };

  const unmappedCount = Object.values(entries).filter((e) => !e.action).length;

  const buildEntries = () =>
    Object.entries(entries)
      .filter(([, e]) => e.action)
      .map(([source_label, e]) => ({
        source_label,
        action: e.action,
        target_class_id: e.action === "map" || e.action === "review" ? e.target_class_id : null,
      }));

  const save = async (markReady) => {
    setSaving(true);
    setError("");
    try {
      const mt = await Datasets.saveMapping(dataset.id, {
        entries: buildEntries(),
        notes,
        mark_ready: markReady,
      });
      setStatus(mt.status);
      setVersion(mt.version);
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink-2">
          {version ? (
            <>
              <span>Mapping table v{version}</span>
              <StatusBadge status={status} />
            </>
          ) : (
            "No mapping table yet · this creates v1"
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => save(false)} disabled={saving} className="btn btn-secondary">
            Save draft
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || unmappedCount > 0}
            title={unmappedCount > 0 ? `${unmappedCount} label(s) still unmapped` : ""}
            className="btn btn-primary"
          >
            Mark as ready{unmappedCount > 0 ? ` · ${unmappedCount} unmapped` : ""}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5">Source label</th>
              <th className="px-3.5 py-2.5">Count</th>
              <th className="px-3.5 py-2.5">Action</th>
              <th className="px-3.5 py-2.5">Target class</th>
              <th className="px-3.5 py-2.5">Samples</th>
            </tr>
          </thead>
          <tbody>
            {dataset.source_classes.map((lc) => {
              const e = entries[lc.label] || { action: "", target_class_id: null };
              return (
                <tr key={lc.label} className="border-t border-border transition-colors hover:bg-surface-2/60">
                  <td className="px-3.5 py-2.5">
                    <span className="flex items-center gap-2 font-mono text-xs">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACTION_DOT[e.action] || ACTION_DOT[""]}`} />
                      {lc.label}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-2">{lc.count.toLocaleString()}</td>
                  <td className="px-3.5 py-2.5">
                    <select
                      className="input py-1.5 text-xs"
                      value={e.action}
                      onChange={(ev) => setEntry(lc.label, { action: ev.target.value })}
                    >
                      <option value="">Choose…</option>
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {(e.action === "map" || e.action === "review") && (
                      <select
                        className="input py-1.5 text-xs"
                        value={e.target_class_id ?? ""}
                        onChange={(ev) => setEntry(lc.label, { target_class_id: Number(ev.target.value) })}
                      >
                        <option value="">{e.action === "review" ? "No hint" : "Select…"}</option>
                        {taxonomy.classes
                          .filter((c) => !c.deprecated)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.id}: {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <button onClick={() => setSampleLabel(lc.label)} className="btn btn-ghost !px-2 !py-1 text-xs">
                      <Eye size={13} />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="mt-4 block text-sm font-medium text-ink-2">
        Notes (rationale for ambiguous decisions)
        <textarea className="input mt-1.5" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {sampleLabel !== undefined && (
        <SampleViewerModal datasetId={dataset.id} label={sampleLabel} onClose={() => setSampleLabel(undefined)} />
      )}
    </div>
  );
}
