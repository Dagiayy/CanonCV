import { useEffect, useState } from "react";

/**
 * useState backed by Web Storage, so in-progress work (current folder/image,
 * selected dataset, view preferences, …) survives at least a page refresh
 * within the same tab. storage="session" (default) clears when the tab
 * closes — right for "what was I working on"; storage="local" persists
 * indefinitely — right for lasting UI preferences like a view-mode toggle.
 */
export function usePersistentState(key, initialValue, { storage = "session" } = {}) {
  const backend = storage === "local" ? window.localStorage : window.sessionStorage;

  const [value, setValue] = useState(() => {
    try {
      const raw = backend.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (value === undefined || value === null) {
        backend.removeItem(key);
      } else {
        backend.setItem(key, JSON.stringify(value));
      }
    } catch {
      // storage unavailable (private browsing quota, etc.) — degrade to in-memory state only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
