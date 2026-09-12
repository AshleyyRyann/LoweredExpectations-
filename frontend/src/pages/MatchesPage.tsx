import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { MatchSummary } from "../types";

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ matches: MatchSummary[] }>("/matches")
      .then((r) => setMatches(r.matches))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load matches."));
  }, []);

  return (
    <div className="page">
      <h1>Your matches</h1>
      {error && <div className="error-banner">{error}</div>}
      {matches === null && !error && <div className="loading-center">Loading…</div>}
      {matches?.length === 0 && (
        <div className="card empty-state">
          <h3>No matches yet</h3>
          <p>Head to Discover and say hello to someone — matches show up here once it's mutual.</p>
        </div>
      )}
      {matches?.map((m) => (
        <Link key={m.matchId} to={`/chat/${m.matchId}`} className="match-list-item">
          <div className="avatar-circle">
            {m.user.photos[0] ? <img src={m.user.photos[0]} alt="" /> : m.user.name[0]?.toUpperCase()}
          </div>
          <div>
            <div className="match-name">
              {m.user.name}, {m.user.age}
            </div>
            <div className="match-sub">{m.user.locationCity ?? "Say hi!"}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
