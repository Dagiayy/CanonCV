import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { ProjectProvider, useProject } from "./ProjectContext";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
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
import { Aperture, Plus } from "@phosphor-icons/react";

function ShellSkeleton() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 skeleton h-80 rounded-2xl" />
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function Shell() {
  const { loading, project } = useProject();
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <div className="w-64 border-r border-slate-200 bg-white" />
        <div className="flex-1">
          <div className="h-16 border-b border-slate-200 bg-white" />
          <ShellSkeleton />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="animate-fade-scale-in max-w-md w-full rounded-2xl bg-white border border-slate-200 p-8 shadow-xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <Aperture weight="bold" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Welcome to CanonCV</h2>
          <p className="mb-6 text-sm text-slate-500 leading-relaxed">
            No dataset project initialized yet. Create your first project workspace to start ingesting, labeling, and normalizing computer vision datasets.
          </p>
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="btn btn-primary w-full py-2.5 rounded-xl font-semibold shadow-md"
          >
            <Plus weight="bold" size={18} />
            Create First Project
          </button>
          {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Fixed Left Sidebar */}
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main Content Stage Area */}
      <div
        className={`flex-1 transition-all duration-300 flex flex-col min-w-0 ${
          collapsed ? "ml-20" : "ml-64"
        }`}
      >
        <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

        <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto animate-fade-in-up">
          <Routes>
            <Route path="/" element={<Dashboard searchQuery={searchQuery} />} />
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
