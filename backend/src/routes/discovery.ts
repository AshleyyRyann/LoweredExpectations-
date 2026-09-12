import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { findNextCandidate, findPendingInboundCandidate } from "../lib/matching";
import { serializePublic } from "../lib/serialize";
import { PREDETERMINED_GREETINGS } from "../lib/greetings";

export const discoveryRouter = Router();
discoveryRouter.use(requireAuth);

// Returns the next candidate to hear the audio bio of. Both people go
// through the same experience independently: each sees the other's bio
// and decides pass / greeting / message on their own turn.
discoveryRouter.get("/next", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const candidate = (await findPendingInboundCandidate(user)) ?? (await findNextCandidate(user));
  if (!candidate) return res.json({ candidate: null });

  res.json({ candidate: serializePublic(candidate) });
});

const interactSchema = z.object({
  toUserId: z.string().min(1),
  action: z.enum(["PASS", "GREETING", "MESSAGE"]),
  messageText: z.string().min(1).max(1000).optional(),
});

discoveryRouter.post("/interact", async (req: AuthedRequest, res) => {
  const parsed = interactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { toUserId, action, messageText } = parsed.data;

  if (toUserId === req.userId) {
    return res.status(400).json({ error: "Cannot interact with yourself" });
  }
  const target = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!target) return res.status(404).json({ error: "Target user not found" });

  if (action === "GREETING") {
    if (!messageText || !PREDETERMINED_GREETINGS.includes(messageText)) {
      return res.status(400).json({ error: "Invalid predetermined greeting" });
    }
  }
  if (action === "MESSAGE" && !messageText) {
    return res.status(400).json({ error: "messageText is required for a custom message" });
  }

  const existing = await prisma.interaction.findUnique({
    where: { fromUserId_toUserId: { fromUserId: req.userId!, toUserId } },
  });
  if (existing) {
    return res.status(409).json({ error: "You already made a decision on this person" });
  }

  await prisma.interaction.create({
    data: {
      fromUserId: req.userId!,
      toUserId,
      action,
      messageText: action === "PASS" ? null : messageText,
    },
  });

  let matched = false;
  let matchId: string | null = null;

  if (action !== "PASS") {
    const reciprocal = await prisma.interaction.findUnique({
      where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: req.userId! } },
    });
    if (reciprocal && reciprocal.action !== "PASS") {
      // Order the pair deterministically so the unique constraint holds
      // regardless of who completed the match.
      const [userAId, userBId] = [req.userId!, toUserId].sort();
      const match = await prisma.match.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        update: {},
        create: { userAId, userBId },
      });
      matched = true;
      matchId = match.id;
    }
  }

  res.json({ matched, matchId });
});

discoveryRouter.get("/greetings", (_req, res) => {
  res.json({ greetings: PREDETERMINED_GREETINGS });
});
