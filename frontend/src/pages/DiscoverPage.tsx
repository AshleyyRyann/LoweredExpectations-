import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { StiBadge } from "../components/StiBadge";
import type { PublicProfile } from "../types";

type Phase = "loading" | "empty" | "ready" | "matched";

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [candidate, setCandidate] = useState<PublicProfile | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [greetings, setGreetings] = useState<string[]>([]);
  const [showGreetings, setShowGreetings] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadNext = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setHasPlayed(false);
    setShowGreetings(false);
    setShowCustom(false);
    setCustomMessage("");
    try {
      const { candidate } = await api.get<{ candidate: PublicProfile | null }>("/discovery/next");
      if (!candidate) {
        setPhase("empty");
        setCandidate(null);
      } else {
        setCandidate(candidate);
        // No recorded bio yet: nothing to gate on, unlock the decision panel immediately.
        setHasPlayed(!candidate.bioAudioUrl);
        setPhase("ready");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your next match.");
      setPhase("empty");
    }
  }, []);

  useEffect(() => {
    loadNext();
    api
      .get<{ greetings: string[] }>("/discovery/greetings")
      .then((r) => setGreetings(r.greetings))
      .catch(() => {});
  }, [loadNext]);

  async function decide(action: "PASS" | "GREETING" | "MESSAGE", messageText?: string) {
    if (!candidate) return;
    setSubmitting(true);
    setError(null);
    try {
      const { matched, matchId } = await api.post<{ matched: boolean; matchId: string | null }>(
        "/discovery/interact",
        { toUserId: candidate.id, action, messageText }
      );
      if (matched && matchId) {
        setMatchedMatchId(matchId);
        setPhase("matched");
      } else {
        await loadNext();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <div className="loading-center">Finding someone for you…</div>;
  }

  if (phase === "matched") {
    return (
      <div className="page">
        <div className="card discover-card">
          <h1>It's a match! 🎉</h1>
          <p className="subtitle">You both said hello. Time to actually talk.</p>
          <button className="btn btn-primary btn-block" onClick={() => navigate(`/chat/${matchedMatchId}`)}>
            Start chatting
          </button>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={loadNext}>
            Keep discovering
          </button>
        </div>
      </div>
    );
  }

  if (phase === "empty" || !candidate) {
    return (
      <div className="page">
        <div className="card empty-state">
          <h2>That's everyone for now</h2>
          <p>No new people match your preferences right now. Check back soon, or widen your distance or age range in your profile.</p>
          <button className="btn btn-secondary" onClick={loadNext} style={{ marginTop: 12 }}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      <div className="card discover-card">
        <div className="candidate-name">
          {candidate.name}, {candidate.age}
        </div>
        <div className="candidate-meta">{candidate.locationCity ?? "Location not shared"}</div>

        <StiBadge status={candidate.stiStatus} />
        {candidate.stiStatus === "POSITIVE" && candidate.stiDetails && (
          <div className="info-box" style={{ textAlign: "left" }}>
            {candidate.stiDetails}
          </div>
        )}

        {candidate.interests.length > 0 && (
          <div className="interests-preview">
            {candidate.interests.map((i) => (
              <span key={i} className="tag">
                {i}
              </span>
            ))}
          </div>
        )}

        <div className="audio-player-shell">
          {candidate.bioAudioUrl ? (
            <>
              <audio
                ref={audioRef}
                controls
                src={candidate.bioAudioUrl}
                style={{ width: "100%" }}
                onPlay={() => setHasPlayed(true)}
              />
              {!hasPlayed && <div className="field-hint">Press play to hear {candidate.name}'s about-me.</div>}
            </>
          ) : (
            <div className="no-audio-note">{candidate.name} hasn't recorded an audio bio yet.</div>
          )}
        </div>

        {candidate.photos.length > 0 && (
          <div className="photo-grid">
            {candidate.photos.map((url) => (
              <div className="photo-thumb" key={url}>
                <img src={url} alt="" />
              </div>
            ))}
          </div>
        )}

        {hasPlayed && !showGreetings && !showCustom && (
          <div className="decision-row">
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => decide("PASS")} disabled={submitting}>
              Pass
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowGreetings(true)}>
              Say hello
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowCustom(true)}>
              Write them
            </button>
          </div>
        )}

        {showGreetings && (
          <div>
            <div className="greeting-list">
              {greetings.map((g) => (
                <button
                  key={g}
                  className="greeting-option"
                  disabled={submitting}
                  onClick={() => decide("GREETING", g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setShowGreetings(false)}>
              Back
            </button>
          </div>
        )}

        {showCustom && (
          <div style={{ marginTop: 16, textAlign: "left" }}>
            <textarea
              rows={3}
              placeholder={`Say something to ${candidate.name}…`}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
            />
            <div className="decision-row">
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCustom(false)}>
                Back
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submitting || customMessage.trim().length === 0}
                onClick={() => decide("MESSAGE", customMessage.trim())}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
