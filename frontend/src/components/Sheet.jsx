import { useEffect } from "react";

export default function Sheet({ onClose, maxWidth = "max-w-md", children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px] animate-fade-scale-in"
      style={{ animationDuration: "180ms" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`animate-sheet-in w-full ${maxWidth} rounded-sheet border border-border bg-surface p-5 shadow-2xl`}
      >
        {children}
      </div>
    </div>
  );
}
