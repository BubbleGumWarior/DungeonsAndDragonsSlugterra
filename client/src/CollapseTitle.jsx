import { CaretDownIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";

// Section heading doubling as a collapse toggle (same look as the slug
// templates header in SlugManagement).
export default function CollapseTitle({ title, count, open, onToggle }) {
  return (
    <button type="button" className="slug-management-collapse-toggle" onClick={onToggle} aria-expanded={open}>
      <CaretDownIcon weight="bold" className={`slug-management-collapse-caret ${open ? "slug-management-collapse-caret--open" : ""}`} />
      <h2>{title}</h2>
      <span className="slug-management-count">{count}</span>
    </button>
  );
}
