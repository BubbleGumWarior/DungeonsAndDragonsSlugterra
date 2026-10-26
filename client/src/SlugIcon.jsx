import slugIconUrl from "./assets/slug-icon.png";
import "./SlugIcon.css";

// The slug silhouette, drawn as a CSS mask over `currentColor` so it takes the
// colour of whatever it sits in (nav links, tabs, themes) like the Phosphor
// icons beside it. `size` is the icon's height in px.
export default function SlugIcon({ size = 17, className = "" }) {
  return (
    <span
      className={`slug-icon ${className}`}
      style={{ "--slug-icon-size": `${size}px`, "--slug-icon-url": `url(${slugIconUrl})` }}
      aria-hidden="true"
    />
  );
}
