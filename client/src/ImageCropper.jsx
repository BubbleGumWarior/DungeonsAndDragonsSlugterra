import { useRef, useState } from "react";
import { ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import "./ImageCropper.css";

const VIEWPORT_SIZE = 220;
const OUTPUT_SIZE = 480;

export default function ImageCropper({ value, onChange }) {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef(null);
  const wasDragging = useRef(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        setImage(img);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        commitCrop(img, 1, { x: 0, y: 0 });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function baseScale(img) {
    return Math.max(VIEWPORT_SIZE / img.width, VIEWPORT_SIZE / img.height);
  }

  function clampOffset(img, nextZoom, nextOffset) {
    const scale = baseScale(img) * nextZoom;
    const displayW = img.width * scale;
    const displayH = img.height * scale;
    const maxX = Math.max(0, (displayW - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (displayH - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    };
  }

  function handlePointerDown(e) {
    if (!image) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, offset };
    wasDragging.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragState.current || !image) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const next = {
      x: dragState.current.offset.x + dx,
      y: dragState.current.offset.y + dy,
    };
    wasDragging.current = true;
    setOffset(clampOffset(image, zoom, next));
  }

  function handlePointerUp() {
    dragState.current = null;
    if (wasDragging.current && image) {
      commitCrop(image, zoom, offset);
    }
    wasDragging.current = false;
  }

  function handleZoomChange(e) {
    const nextZoom = Number(e.target.value);
    setZoom(nextZoom);
    if (image) {
      const nextOffset = clampOffset(image, nextZoom, offset);
      setOffset(nextOffset);
      commitCrop(image, nextZoom, nextOffset);
    }
  }

  function cropToDataUrl(img, cropZoom, cropOffset) {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");

    const scale = baseScale(img) * cropZoom;
    const displayW = img.width * scale;
    const displayH = img.height * scale;
    const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;

    const drawW = displayW * outputScale;
    const drawH = displayH * outputScale;
    const drawX = OUTPUT_SIZE / 2 - drawW / 2 + cropOffset.x * outputScale;
    const drawY = OUTPUT_SIZE / 2 - drawH / 2 + cropOffset.y * outputScale;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function commitCrop(img, cropZoom, cropOffset) {
    onChange(cropToDataUrl(img, cropZoom, cropOffset));
  }

  function confirmCrop() {
    if (!image) return;
    commitCrop(image, zoom, offset);
    // Done adjusting -- drop back to the compact result view. Without this,
    // `image` stays set and (now that the crop viewport is shown whenever
    // `image` is set, rather than whenever `value` isn't) the interactive
    // cropper would just stay open forever, live-committing on every zoom/
    // drag but never actually finishing.
    setImage(null);
  }

  function reset() {
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="cropper">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="cropper-file-input"
      />

      {image ? (
        // Actively cropping a just-picked file -- checked before `value` on
        // purpose: handleFile commits an initial (uncropped) preview to
        // `value` the moment a file loads, so gating on `value` alone would
        // skip straight past this interactive step every time.
        <>
          <div
            className="cropper-viewport"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="cropper-image"
              style={{
                width: image.width * baseScale(image) * zoom,
                height: image.height * baseScale(image) * zoom,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
            <div className="cropper-ring" />
          </div>

          <div className="cropper-controls">
            <label className="cropper-zoom-label">
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={handleZoomChange}
              />
            </label>
            <div className="cropper-actions">
              <button type="button" className="cropper-secondary" onClick={() => fileInputRef.current?.click()}>
                <UploadSimpleIcon weight="bold" />
                Choose Different Photo
              </button>
              <button type="button" className="cropper-confirm" onClick={confirmCrop}>
                Use This Photo
              </button>
            </div>
          </div>
        </>
      ) : value ? (
        <div className="cropper-result">
          <img src={value} alt="Character portrait" className="cropper-result-img" />
          <button type="button" className="cropper-change" onClick={reset}>
            Change Photo
          </button>
        </div>
      ) : (
        <div className="cropper-viewport" style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}>
          <button type="button" className="cropper-empty" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon weight="duotone" />
            <span>Upload a photo</span>
          </button>
          <div className="cropper-ring" />
        </div>
      )}
    </div>
  );
}
