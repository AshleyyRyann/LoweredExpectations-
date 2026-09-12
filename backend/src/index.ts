import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { discoveryRouter } from "./routes/discovery";
import { matchesRouter } from "./routes/matches";
import { UPLOADS_ROOT } from "./lib/upload";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_ROOT));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/discovery", discoveryRouter);
app.use("/api/matches", matchesRouter);

// Central error handler — catches multer errors (bad file type, too large)
// and anything else that bubbles up without a response already sent.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err?.message ?? "Internal server error";
  res.status(err?.status ?? 400).json({ error: message });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`LoweredExpectations API listening on http://localhost:${PORT}`);
});
