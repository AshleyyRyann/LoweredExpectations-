import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { serializeSelf } from "../lib/serialize";
import { audioUpload, photoUpload } from "../lib/upload";
import { parseJsonArray } from "../lib/utils";

export const profileRouter = Router();
profileRouter.use(requireAuth);

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  locationLat: z.number().min(-90).max(90).nullable().optional(),
  locationLng: z.number().min(-180).max(180).nullable().optional(),
  locationCity: z.string().max(100).nullable().optional(),
  interests: z.array(z.string().min(1).max(30)).max(20).optional(),
  preferredGenders: z.array(z.enum(["WOMAN", "MAN", "NONBINARY", "OTHER"])).optional(),
  minAgePreference: z.number().int().min(18).max(99).optional(),
  maxAgePreference: z.number().int().min(18).max(99).optional(),
  maxDistanceKm: z.number().int().min(1).max(20000).optional(),
  stiStatus: z.enum(["UNDISCLOSED", "NEGATIVE", "POSITIVE"]).optional(),
  stiDetails: z.string().max(500).nullable().optional(),
  stiDisclosureVisible: z.boolean().optional(),
  stiPreference: z.enum(["NO_PREFERENCE", "PREFER_NEGATIVE_ONLY"]).optional(),
});

profileRouter.get("/me", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: serializeSelf(user) });
});

profileRouter.put("/me", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const data = parsed.data;

  if (
    data.minAgePreference != null &&
    data.maxAgePreference != null &&
    data.minAgePreference > data.maxAgePreference
  ) {
    return res.status(400).json({ error: "minAgePreference cannot exceed maxAgePreference" });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
      ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
      ...(data.locationCity !== undefined && { locationCity: data.locationCity }),
      ...(data.interests !== undefined && { interests: JSON.stringify(data.interests) }),
      ...(data.preferredGenders !== undefined && {
        preferredGenders: JSON.stringify(data.preferredGenders),
      }),
      ...(data.minAgePreference !== undefined && { minAgePreference: data.minAgePreference }),
      ...(data.maxAgePreference !== undefined && { maxAgePreference: data.maxAgePreference }),
      ...(data.maxDistanceKm !== undefined && { maxDistanceKm: data.maxDistanceKm }),
      ...(data.stiStatus !== undefined && { stiStatus: data.stiStatus }),
      ...(data.stiDetails !== undefined && { stiDetails: data.stiDetails }),
      ...(data.stiDisclosureVisible !== undefined && {
        stiDisclosureVisible: data.stiDisclosureVisible,
      }),
      ...(data.stiPreference !== undefined && { stiPreference: data.stiPreference }),
    },
  });

  res.json({ user: serializeSelf(user) });
});

profileRouter.post(
  "/me/audio-bio",
  audioUpload.single("audio"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });
    const bioAudioUrl = `/uploads/audio/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { bioAudioUrl },
    });
    res.json({ user: serializeSelf(user) });
  }
);

profileRouter.post(
  "/me/photos",
  photoUpload.array("photos", 6),
  async (req: AuthedRequest, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "No photos uploaded" });

    const existing = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const currentPhotos = parseJsonArray(existing.photos);
    const newUrls = files.map((f) => `/uploads/photos/${f.filename}`);
    const merged = [...currentPhotos, ...newUrls].slice(0, 6);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { photos: JSON.stringify(merged) },
    });
    res.json({ user: serializeSelf(user) });
  }
);

profileRouter.delete("/me/photos/:index", async (req: AuthedRequest, res) => {
  const index = Number(req.params.index);
  const existing = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const photos = parseJsonArray(existing.photos);
  if (!Number.isInteger(index) || index < 0 || index >= photos.length) {
    return res.status(400).json({ error: "Invalid photo index" });
  }
  photos.splice(index, 1);

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { photos: JSON.stringify(photos) },
  });
  res.json({ user: serializeSelf(user) });
});
