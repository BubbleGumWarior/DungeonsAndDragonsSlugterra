import { Router } from "express";
import { findImageByHash, decodeDataUri } from "../imageStore.js";

const router = Router();

// GET /api/img/<md5> -- the art behind a URL that imagifyPayload swapped in
// for an embedded image. Deliberately not behind requireAuth: an <img> tag
// can't send a bearer token, and the URL is the md5 of the image's own bytes,
// so it can't be guessed without already having the image. The content behind
// a hash never changes, hence a year-long immutable cache -- the browser (and
// any CDN in front) downloads each image once.
router.get("/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!/^[a-f0-9]{32}$/.test(hash)) return res.status(400).end();
  try {
    const dataUri = await findImageByHash(hash);
    const image = dataUri && decodeDataUri(dataUri);
    if (!image) return res.status(404).end();
    res.set({
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${hash}"`,
    });
    res.send(image.body);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

export default router;
