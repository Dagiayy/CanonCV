import { NavLink, Route, Routes } from "react-router-dom";
import { ProjectProvider, useProject } from "./ProjectContext";
import Dashboard from "./pages/Dashboard";
import TaxonomyEditor from "./pages/TaxonomyEditor";
import DatasetDetail from "./pages/DatasetDetail";
import RunNormalize from "./pages/RunNormalize";
import History from "./pages/History";
import ReviewQueuePage from "./pages/ReviewQueue";
import AnnotatePage from "./pages/Annotate";
import QualityPage from "./pages/Quality";
import SplitsPage from "./pages/Splits";
import ExportsPage from "./pages/Exports";
import NewProjectModal from "./components/NewProjectModal";
import { useState } from "react";
import { CaretDown, Plus, SquaresFour } from "@phosphor-icons/react";

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard" },
  { to: "/taxonomy", label: "Taxonomy" },
  { to: "/annotate", label: "Annotate" },
  { to: "/quality", label: "Quality" },
  { to: "/run", label: "Run" },
  { to: "/splits", label: "Splits" },
  { to: "/exports", label: "Export" },
  { to: "/history", label: "History" },
  { to: "/review-queue", label: "Review" },
];

function ProjectSwitcher() {
  const { projects, projectId, setProjectId } = useProject();
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          className="input appearance-none rounded-full py-1.5 pl-3.5 pr-8 text-sm font-medium"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <CaretDown weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" size={12} />
      </div>
      <button onClick={() => setShowNew(true)} className="btn btn-secondary rounded-full">
        <Plus weight="bold" size={14} />
        New Project
      </button>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function TopNav() {
  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent text-white">
              <SquaresFour weight="fill" size={16} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Dataset Normalization</span>
          </div>
          <nav className="segmented">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {({ isActive }) => (
                  <span className="segmented-item" data-active={isActive}>
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <ProjectSwitcher />
      </div>
    </header>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    </div>
  );
}

function Shell() {
  const { loading, project } = useProject();
  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="glass-nav sticky top-0 z-40 h-16" />
        <ShellSkeleton />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-fade-scale-in text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent/10 text-accent">
            <SquaresFour weight="fill" size={22} />
          </span>
          <p className="mb-4 text-[15px] text-ink-2">No project yet. Create one to get started.</p>
          <ProjectSwitcher />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/taxonomy" element={<TaxonomyEditor />} />
          <Route path="/annotate" element={<AnnotatePage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/datasets/:datasetId" element={<DatasetDetail />} />
          <Route path="/run" element={<RunNormalize />} />
          <Route path="/splits" element={<SplitsPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/review-queue" element={<ReviewQueuePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}
