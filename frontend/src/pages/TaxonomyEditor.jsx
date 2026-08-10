import { useEffect, useState } from "react";
import { useProject } from "../ProjectContext";
import { Projects } from "../api";
import { FloppyDisk, Plus } from "@phosphor-icons/react";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const update = (idx, field, value) => {
    setClasses((cs) => cs.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const addClass = () => {
    setClasses((cs) => [
      ...cs,
      { id: nextId(cs), name: "", description: "", color_hex: "#64748b", category: "primary", deprecated: false },
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
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Canonical class taxonomy</h2>
          <p className="text-xs text-ink-2">
            {version ? `Active version v${version}` : "No taxonomy defined yet"} · IDs are never renumbered, mark a class
            deprecated instead of deleting it
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addClass} className="btn btn-secondary">
            <Plus size={14} weight="bold" />
            Add class
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            <FloppyDisk size={14} weight="bold" />
            {saving ? "Saving…" : "Save as new version"}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-control bg-danger/10 p-2.5 text-sm text-danger">{error}</p>}

      <div className="mb-4">
        <input
          className="input max-w-md"
          placeholder="Note for this taxonomy version, optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3.5 py-2.5">ID</th>
              <th className="px-3.5 py-2.5">Name</th>
              <th className="px-3.5 py-2.5">Description</th>
              <th className="px-3.5 py-2.5">Color</th>
              <th className="px-3.5 py-2.5">Category</th>
              <th className="px-3.5 py-2.5">Deprecated</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c, idx) => (
              <tr key={c.id} className={`border-t border-border transition-opacity ${c.deprecated ? "opacity-45" : ""}`}>
                <td className="px-3.5 py-2 font-mono text-xs text-ink-2">{c.id}</td>
                <td className="px-3.5 py-2">
                  <input className="input w-32 py-1.5 text-xs" value={c.name} onChange={(e) => update(idx, "name", e.target.value)} />
                </td>
                <td className="px-3.5 py-2">
                  <input
                    className="input w-full min-w-[16rem] py-1.5 text-xs"
                    value={c.description}
                    onChange={(e) => update(idx, "description", e.target.value)}
                  />
                </td>
                <td className="px-3.5 py-2">
                  <label
                    className="flex h-7 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-[8px] border border-border"
                    style={{ backgroundColor: c.color_hex }}
                  >
                    <input
                      type="color"
                      className="h-10 w-14 -translate-x-0.5 cursor-pointer opacity-0"
                      value={c.color_hex}
                      onChange={(e) => update(idx, "color_hex", e.target.value)}
                    />
                  </label>
                </td>
                <td className="px-3.5 py-2">
                  <input
                    className="input w-24 py-1.5 text-xs"
                    value={c.category}
                    onChange={(e) => update(idx, "category", e.target.value)}
                  />
                </td>
                <td className="px-3.5 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={!!c.deprecated}
                    onChange={() => toggleDeprecated(idx)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {history.length > 1 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Version history</h3>
          <ul className="space-y-1 text-xs text-ink-2">
            {history.map((h) => (
              <li key={h.id}>
                v{h.version} · {new Date(h.created_at).toLocaleString()} · {h.classes.length} classes {h.is_active ? "(active)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
