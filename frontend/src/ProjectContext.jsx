import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Projects } from "./api";

const Ctx = createContext(null);

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem("aatb.projectId") || "");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await Projects.list();
    setProjects(list);
    if (!projectId && list.length > 0) {
      setProjectId(list[0].id);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectId) localStorage.setItem("aatb.projectId", projectId);
  }, [projectId]);

  const createProject = async (name, description) => {
    const p = await Projects.create({ name, description });
    await refresh();
    setProjectId(p.id);
    return p;
  };

  const project = projects.find((p) => p.id === projectId) || null;

  return (
    <Ctx.Provider value={{ projects, project, projectId, setProjectId, loading, refresh, createProject }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
