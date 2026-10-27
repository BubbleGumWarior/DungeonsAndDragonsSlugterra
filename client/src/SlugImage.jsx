import { CircleDashedIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react";
import "./SlugImage.css";

// One form's art. Clicking it opens the full-size viewer (SlugImageModal); it
// never flips the card -- that's the card's own job.
export default function SlugImage({ image, form = "protoform", size = "md", onOpen }) {
  const label = form === "velocity" ? "Velocity form" : "Protoform";
  const className = `slug-image slug-image--${size} slug-image--${form}`;

  if (!image) {
    return (
      <div className={className}>
        <CircleDashedIcon weight="duotone" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${className} slug-image--zoomable`}
      aria-label={`View ${label} image full size`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
    >
      <img src={image} alt={label} loading="lazy" decoding="async" />
      <span className="slug-image-zoom" aria-hidden="true">
        <MagnifyingGlassPlusIcon weight="bold" />
      </span>
    </button>
  );
}
