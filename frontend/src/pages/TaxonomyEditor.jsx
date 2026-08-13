import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects } from "../api";
import Spinner from "../components/Spinner";
import { ClockCounterClockwise, FloppyDisk, Plus, Tag } from "@phosphor-icons/react";

function nextId(classes) {
  return classes.length ? Math.max(...classes.map((c) => c.id)) + 1 : 0;
}

export default function TaxonomyEditor() {
  const { projectId } = useProject();
  const [classes, setClasses] = useState([]);
  const [version, setVersion] = useState(null);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      const tax = await Projects.taxonomy(projectId);
      setClasses(tax.classes);
      setVersion(tax.version);
    } catch {
      setClasses([]);
      setVersion(null);
    }
    try {
      setHistory(await Projects.taxonomyHistory(projectId));
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const update = (idx, field, value) => {
    setClasses((cs) => cs.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const addClass = () => {
    setClasses((cs) => [
      ...cs,
      { id: nextId(cs), name: "", description: "", color_hex: "#6366f1", category: "primary", deprecated: false },
    ]);
  };

  const toggleDeprecated = (idx) => {
    setClasses((cs) => cs.map((c, i) => (i === idx ? { ...c, deprecated: !c.deprecated } : c)));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const tax = await Projects.saveTaxonomy(projectId, { classes, created_by_note: note });
      setVersion(tax.version);
      setNote("");
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail?.toString() || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Canonical Class Taxonomy</h2>
            <span className="badge badge-accent font-mono">
              {version ? `v${version}` : "v1.0"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Define target object classes. IDs are preserved permanently to prevent model training label drift.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addClass} className="btn btn-secondary text-xs">
            <Plus size={16} weight="bold" />
            <span>Add Class</span>
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary text-xs shadow-md shadow-indigo-200">
            {saving ? <Spinner size={16} /> : <FloppyDisk size={16} weight="bold" />}
            <span>{saving ? "Saving…" : "Save New Version"}</span>
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700">{error}</p>}

      {/* Version Note Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
        <input
          className="input text-xs max-w-lg"
          placeholder="Optional release note for this taxonomy version (e.g. Added vehicle sub-classes)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <span className="text-xs text-slate-400 font-medium">{classes.length} active classes defined</span>
      </div>

      {/* Classes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 w-16">ID</th>
              <th className="py-3 px-4">Class Name</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 w-20">Color</th>
              <th className="py-3 px-4 w-28">Category</th>
              <th className="py-3 px-4 w-24">Deprecated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <Tag size={28} className="mx-auto mb-2 text-slate-300" />
                  No canonical classes defined. Click "Add Class" to start building taxonomy.
                </td>
              </tr>
            ) : (
              classes.map((c, idx) => (
                <tr key={c.id} className={`hover:bg-slate-50/80 transition-colors ${c.deprecated ? "opacity-40 bg-slate-50/50" : ""}`}>
                  <td className="py-3 px-4 font-mono font-bold text-slate-500">#{c.id}</td>
                  <td className="py-3 px-4">
                    <input
                      className="input py-1.5 px-2.5 text-xs w-44 font-semibold"
                      value={c.name}
                      onChange={(e) => update(idx, "name", e.target.value)}
                      placeholder="e.g. car, pedestrian"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      className="input py-1.5 px-2.5 text-xs w-full"
                      value={c.description}
                      onChange={(e) => update(idx, "description", e.target.value)}
                      placeholder="Contextual rules for annotators..."
                    />
                  </td>
                  <td className="py-3 px-4">
                    <label
                      className="flex h-7 w-12 cursor-pointer items-center justify-center rounded-lg border border-slate-200 shadow-xs"
                      style={{ backgroundColor: c.color_hex }}
                    >
                      <input
                        type="color"
                        className="h-10 w-16 cursor-pointer opacity-0"
                        value={c.color_hex}
                        onChange={(e) => update(idx, "color_hex", e.target.value)}
                      />
                    </label>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      className="input py-1.5 px-2.5 text-xs w-24"
                      value={c.category}
                      onChange={(e) => update(idx, "category", e.target.value)}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                      checked={!!c.deprecated}
                      onChange={() => toggleDeprecated(idx)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* History Log */}
      {history.length > 1 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <ClockCounterClockwise size={16} className="text-slate-400" />
            Taxonomy Version History
          </h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 text-xs border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-indigo-600">v{h.version}</span>
                  <span className="text-slate-600 font-medium">• {h.classes.length} classes</span>
                  {h.created_by_note && <span className="text-slate-400 font-italic">({h.created_by_note})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {h.is_active && <span className="badge badge-success text-[10px]">Active</span>}
                  <span className="text-slate-400 text-[11px]">{new Date(h.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
