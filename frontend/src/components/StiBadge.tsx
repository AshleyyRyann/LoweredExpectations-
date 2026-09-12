import type { StiStatus } from "../types";

const LABELS: Record<StiStatus, string> = {
  NEGATIVE: "STI status: negative",
  POSITIVE: "STI status: positive (disclosed)",
  UNDISCLOSED: "STI status not shared",
};

export function StiBadge({ status }: { status: StiStatus }) {
  const cls = status === "NEGATIVE" ? "negative" : status === "POSITIVE" ? "positive" : "undisclosed";
  return <span className={`sti-badge ${cls}`}>{LABELS[status]}</span>;
}
