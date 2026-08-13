import { useState } from "react";
import { ArrowsClockwiseIcon, CircleDashedIcon } from "@phosphor-icons/react";
import "./SlugImage.css";

export default function SlugImage({ protoformImage, velocityImage, size = "md", onFaceChange }) {
  const [flipped, setFlipped] = useState(false);
  const hasBothForms = Boolean(protoformImage && velocityImage);

  function toggleFlip(e) {
    e.stopPropagation();
    const next = !flipped;
    setFlipped(next);
    onFaceChange?.(next ? "velocity" : "protoform");
  }

  return (
    <div className={`slug-image slug-image--${size} ${flipped ? "slug-image--flipped" : ""}`}>
      <div className={`slug-image-flipper ${flipped ? "slug-image-flipper--flipped" : ""}`}>
        <div className="slug-image-face slug-image-face--front">
          {protoformImage ? (
            <img src={protoformImage} alt="Protoform" />
          ) : (
            <CircleDashedIcon weight="duotone" />
          )}
        </div>
        <div className="slug-image-face slug-image-face--back">
          {velocityImage ? (
            <img src={velocityImage} alt="Velocity form" />
          ) : (
            <CircleDashedIcon weight="duotone" />
          )}
        </div>
      </div>

      {hasBothForms && (
        <button type="button" className="slug-image-flip-btn" onClick={toggleFlip} aria-label="Flip slug form">
          <ArrowsClockwiseIcon weight="bold" />
        </button>
      )}
    </div>
  );
}
