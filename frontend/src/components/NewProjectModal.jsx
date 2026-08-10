import { useState } from "react";
import { useProject } from "../ProjectContext";
import Sheet from "./Sheet";

export default function NewProjectModal({ onClose }) {
  const { createProject } = useProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createProject(name.trim(), description.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <form onSubmit={submit}>
        <h3 className="mb-4 text-[17px] font-semibold tracking-tight">New Project</h3>
        <label className="mb-3 block text-sm font-medium text-ink-2">
          Name
          <input
            autoFocus
            className="input mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="mb-5 block text-sm font-medium text-ink-2">
          Description
          <textarea
            className="input mt-1.5"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary">
            {saving ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
