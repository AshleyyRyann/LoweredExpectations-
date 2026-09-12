import fs from "fs";
import path from "path";
import multer from "multer";

export const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");
const AUDIO_DIR = path.join(UPLOADS_ROOT, "audio");
const PHOTOS_DIR = path.join(UPLOADS_ROOT, "photos");

for (const dir of [AUDIO_DIR, PHOTOS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function uniqueName(userId: string, originalName: string): string {
  const ext = path.extname(originalName) || "";
  return `${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

export const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
    filename: (req, file, cb) => {
      const userId = (req as any).userId ?? "anon";
      cb(null, uniqueName(userId, file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, plenty for a short bio clip
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
});

export const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
    filename: (req, file, cb) => {
      const userId = (req as any).userId ?? "anon";
      cb(null, uniqueName(userId, file.originalname));
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});
