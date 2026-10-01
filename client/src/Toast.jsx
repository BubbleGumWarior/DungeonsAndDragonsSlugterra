import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import "./Toast.css";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// A small stack of dismissible toasts, top-right. push() takes
//   { title, body, tone: "info"|"success"|"warn", icon, actions: [{label, onClick, primary}], duration }
// and returns an id. `duration` of 0 keeps it up until dismissed or answered.
// Clicking an action runs it and then dismisses the toast.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { tone: "info", ...toast, id }]);
      const duration = toast.duration ?? 8000;
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role="status">
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <XIcon weight="bold" />
            </button>
            {t.icon && <div className="toast-icon">{t.icon}</div>}
            <div className="toast-main">
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.body && <div className="toast-body">{t.body}</div>}
              {t.actions?.length > 0 && (
                <div className="toast-actions">
                  {t.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={`toast-action ${a.primary ? "toast-action--primary" : ""}`}
                      onClick={() => {
                        a.onClick?.();
                        dismiss(t.id);
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
