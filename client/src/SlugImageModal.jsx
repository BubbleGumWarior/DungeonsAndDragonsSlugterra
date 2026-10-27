import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react";
import "./SlugImageModal.css";

// Full-size art viewer opened from a SlugCard's image. When the slug has both
// forms a small switch lets you compare them without closing.
export default function SlugImageModal({ slug, initialForm = "protoform", onClose }) {
  const forms = [
    { key: "protoform", label: "Protoform", image: slug.protoformImage },
    { key: "velocity", label: "Velocity", image: slug.velocityImage },
  ].filter((f) => f.image);
  const [form, setForm] = useState(forms.some((f) => f.key === initialForm) ? initialForm : forms[0]?.key);
  const closeRef = useRef(null);
  const current = forms.find((f) => f.key === form);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (!current) return null;

  return createPortal(
    // Stop clicks reaching the card underneath (React bubbles through portals).
    <div
      className="slug-image-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${slug.name} artwork`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="slug-image-modal" onClick={(e) => e.stopPropagation()}>
        <div className="slug-image-modal-bar">
          <h2 className="slug-image-modal-title">{slug.name}</h2>
          {forms.length > 1 && (
            <div className="slug-image-modal-tabs" role="tablist">
              {forms.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={f.key === form}
                  className={`slug-image-modal-tab ${f.key === form ? "slug-image-modal-tab--active" : ""}`}
                  onClick={() => setForm(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <button ref={closeRef} type="button" className="slug-image-modal-close" onClick={onClose} aria-label="Close">
            <XIcon weight="bold" />
          </button>
        </div>
        <div className="slug-image-modal-stage">
          <img key={current.key} src={current.image} alt={`${slug.name} — ${current.label}`} />
        </div>
      </div>
    </div>,
    document.body
  );
}
