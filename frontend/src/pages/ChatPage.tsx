import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { ChatMessageDto, MatchSummary } from "../types";

const POLL_INTERVAL_MS = 3000;

export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get<{ matches: MatchSummary[] }>("/matches")
      .then((r) => setMatch(r.matches.find((m) => m.matchId === matchId) ?? null));
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    async function poll() {
      try {
        const { messages } = await api.get<{ messages: ChatMessageDto[] }>(
          `/matches/${matchId}/messages`
        );
        if (!cancelled) setMessages(messages);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load messages.");
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!matchId || !text.trim()) return;
    setSending(true);
    setError(null);
    const body = text.trim();
    setText("");
    try {
      const { message } = await api.post<{ message: ChatMessageDto }>(`/matches/${matchId}/messages`, {
        text: body,
      });
      setMessages((prev) => [...prev, message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that message.");
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-header">
        <Link to="/matches" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
          ←
        </Link>
        <div className="avatar-circle">
          {match?.user.photos[0] ? <img src={match.user.photos[0]} alt="" /> : match?.user.name[0]?.toUpperCase()}
        </div>
        <div>
          <div className="match-name">{match?.user.name ?? "Chat"}</div>
          <div className="match-sub">{match?.user.locationCity}</div>
        </div>
      </div>

      <div className="chat-messages">
        {error && <div className="error-banner">{error}</div>}
        {messages.length === 0 && !error && (
          <div className="empty-state">Say hi — you both already liked each other's bio.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.mine ? "mine" : "theirs"}`}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-composer" onSubmit={handleSend}>
        <input
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sending}
        />
        <button className="btn btn-primary" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
