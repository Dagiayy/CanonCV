import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useProject } from "../ProjectContext";
import {
  Aperture,
  BoundingBox,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  DotsThreeVertical,
  Export,
  Folders,
  Lightning,
  Question,
  Scissors,
  ShieldCheck,
  SquaresFour,
  Tag,
  User,
} from "@phosphor-icons/react";

const NAV_SECTIONS = [
  {
    title: "Main Menu",
    items: [
      { to: "/", end: true, label: "Dashboard", icon: SquaresFour },
      { to: "/taxonomy", label: "Taxonomy Studio", icon: Tag },
      { to: "/annotate", label: "Annotation Studio", icon: BoundingBox },
    ],
  },
  {
    title: "AI & Pipeline",
    items: [
      { to: "/quality", label: "Quality Audit", icon: ShieldCheck },
      { to: "/run", label: "Normalize Engine", icon: Lightning },
      { to: "/splits", label: "Dataset Splits", icon: Scissors },
    ],
  },
  {
    title: "Audit & Lineage",
    items: [
      { to: "/review-queue", label: "Review Queue", icon: CheckCircle, badge: "Pending" },
      { to: "/exports", label: "Exports & Versioning", icon: Export },
      { to: "/history", label: "History Logs", icon: ClockCounterClockwise },
    ],
  },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const { project } = useProject();

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-[#F4F4F6] border-r border-slate-200/80 transition-all duration-300 flex flex-col justify-between select-none ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Top Section */}
      <div>
        {/* Workspace Card Header (Matching Reference Top Left) */}
        <div className="p-3.5 border-b border-slate-200/60">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/90 shadow-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white font-black text-sm">
                <Aperture weight="bold" size={20} />
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Universal Engine</span>
                  <span className="text-xs font-bold text-slate-900 truncate mt-0.5">{project ? project.name : "CanonCV Studio"}</span>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Collapse sidebar"
              >
                <CaretLeft size={14} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Categorized Navigation */}
        <nav className="px-3 py-4 space-y-5 overflow-y-auto max-h-[calc(100vh-170px)]">
          {NAV_SECTIONS.map((section, sIdx) => (
            <div key={sIdx}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                          isActive
                            ? "bg-slate-900 text-white font-bold shadow-xs"
                            : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                        } ${collapsed ? "justify-center px-0" : ""}`
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={18}
                            weight={isActive ? "fill" : "regular"}
                            className={`${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-700"}`}
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {!collapsed && item.badge && (
                            <span
                              className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700 border border-amber-200/60"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom User Profile Floating Card (Matching Reference Bottom Left) */}
      <div className="p-3 border-t border-slate-200/60">
        {!collapsed ? (
          <div className="p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                <User size={16} weight="bold" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">Lead Architect</p>
                <p className="text-[10px] text-slate-400 truncate">Vision Studio Operator</p>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-700 p-1">
              <DotsThreeVertical size={16} weight="bold" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center py-1 text-slate-400">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <User size={16} weight="bold" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
