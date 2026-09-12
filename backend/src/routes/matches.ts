import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { serializePublic } from "../lib/serialize";

export const matchesRouter = Router();
matchesRouter.use(requireAuth);

async function assertParticipant(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;
  if (match.userAId !== userId && match.userBId !== userId) return null;
  return match;
}

matchesRouter.get("/", async (req: AuthedRequest, res) => {
  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: req.userId }, { userBId: req.userId }] },
    include: { userA: true, userB: true },
    orderBy: { createdAt: "desc" },
  });

  const result = matches.map((m) => {
    const other = m.userAId === req.userId ? m.userB : m.userA;
    return { matchId: m.id, createdAt: m.createdAt, user: serializePublic(other) };
  });

  res.json({ matches: result });
});

matchesRouter.get("/:matchId/messages", async (req: AuthedRequest, res) => {
  const match = await assertParticipant(req.params.matchId, req.userId!);
  if (!match) return res.status(404).json({ error: "Match not found" });

  const messages = await prisma.chatMessage.findMany({
    where: { matchId: match.id },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      createdAt: m.createdAt,
      mine: m.senderId === req.userId,
    })),
  });
});

const sendMessageSchema = z.object({ text: z.string().min(1).max(2000) });

matchesRouter.post("/:matchId/messages", async (req: AuthedRequest, res) => {
  const match = await assertParticipant(req.params.matchId, req.userId!);
  if (!match) return res.status(404).json({ error: "Match not found" });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const message = await prisma.chatMessage.create({
    data: { matchId: match.id, senderId: req.userId!, text: parsed.data.text },
  });

  res.status(201).json({
    message: {
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      createdAt: message.createdAt,
      mine: true,
    },
  });
});
