import { useState } from "react";
import { useProject } from "../ProjectContext";
import NewProjectModal from "./NewProjectModal";
import {
  Bell,
  CalendarBlank,
  CaretDown,
  LockKey,
  MagnifyingGlass,
  Plus,
  Sliders,
  User,
} from "@phosphor-icons/react";

export default function Header({ onOpenUploadModal, searchQuery, setSearchQuery }) {
  const { projects, projectId, setProjectId, project } = useProject();
  const [showNewModal, setShowNewModal] = useState(false);

  return (
    <header className="glass-nav sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white/90">
      <div className="flex h-full items-center justify-between px-6">
        {/* Left Breadcrumbs & Greeting */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span>Dashboard</span>
            <span className="font-bold text-slate-300 font-mono text-[10px]">&gt;</span>
            <span className="text-slate-700 font-semibold">{project ? project.name : "Overview"}</span>
          </div>
          <h1 className="text-sm font-bold text-slate-900 tracking-tight">
            Welcome back, Vision Architect
          </h1>
        </div>

        {/* Middle Global Search (Matching Reference Search Bar with ⌘K Badge) */}
        <div className="hidden md:flex flex-1 max-w-sm mx-6">
          <div className="search-input-wrapper">
            <MagnifyingGlass size={15} className="absolute left-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search datasets, classes, tags..."
              value={searchQuery || ""}
              onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
            />
            <span className="absolute right-2.5 px-1.5 py-0.5 rounded-md bg-slate-200/70 text-[10px] font-mono font-bold text-slate-500">
              ⌘K
            </span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Project Dropdown Selector */}
          <div className="relative flex items-center">
            <select
              className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-7 text-xs font-semibold text-slate-800 hover:bg-slate-100 hover:border-slate-300 focus:outline-none cursor-pointer transition-colors"
              value={projectId || ""}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
            <CaretDown weight="bold" size={10} className="pointer-events-none absolute right-2.5 text-slate-500" />
          </div>

          {/* Date / Status Pill (Matching Reference Date Button) */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
            <CalendarBlank size={14} className="text-slate-400" />
            <span>Today, Aug 11</span>
          </div>

          {/* New Project Button */}
          <button
            onClick={() => setShowNewModal(true)}
            className="btn btn-secondary text-xs py-1.5 px-3 rounded-xl"
            title="Create new project"
          >
            <Plus weight="bold" size={14} />
            <span className="hidden sm:inline">New Project</span>
          </button>

          {/* Ingest Dataset Pitch-Black Button (Matching Reference Dark Button) */}
          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="btn btn-primary text-xs py-1.5 px-3.5 rounded-xl shadow-xs"
            >
              <Plus weight="bold" size={14} />
              <span>Ingest Dataset</span>
            </button>
          )}

          {/* Icons Bar (Matching Notification & Profile Icons in Reference Top Right) */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
            <button className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors">
              <Bell size={16} />
            </button>
            <button className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors">
              <LockKey size={16} />
            </button>
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center ml-1 shadow-xs">
              <User size={16} weight="bold" />
            </div>
          </div>
        </div>
      </div>

      {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} />}
    </header>
  );
}
