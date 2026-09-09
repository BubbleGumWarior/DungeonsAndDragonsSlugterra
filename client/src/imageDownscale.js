// Shared client-side image downscaler. Caps a picked image before it ever
// reaches the server, so a phone photo doesn't balloon a DB row (and every
// websocket broadcast of it). Used by the combat battle-map upload and the
// ship deck-plan upload -- both store the result as a data URL in a TEXT
// column (encounters.map_image / ships.image).
export const IMAGE_MAX_DIMENSION = 2200;
export const IMAGE_QUALITY = 0.85;

export function downscaleImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
