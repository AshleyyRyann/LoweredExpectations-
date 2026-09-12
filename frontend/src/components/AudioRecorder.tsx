import { useEffect, useRef, useState } from "react";

interface AudioRecorderProps {
  onRecorded: (blob: Blob) => void;
  existingAudioUrl?: string | null;
  maxSeconds?: number;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioRecorder({ onRecorded, existingAudioUrl, maxSeconds = 90 }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) {
            stopRecording();
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't access your microphone. Check your browser permissions and try again.");
    }
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  const playbackSrc = previewUrl ?? existingAudioUrl ?? null;

  return (
    <div className="recorder">
      {error && <div className="error-banner">{error}</div>}

      <button
        type="button"
        className={`record-btn${isRecording ? " recording" : ""}`}
        onClick={isRecording ? stopRecording : startRecording}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isRecording ? "■" : "●"}
      </button>

      <div className="record-timer">
        {isRecording ? `${formatTime(seconds)} / ${formatTime(maxSeconds)}` : "Tap to record your about-me"}
      </div>

      {playbackSrc && !isRecording && (
        <div style={{ marginTop: 16 }}>
          <audio controls src={playbackSrc} style={{ width: "100%" }} />
          <div className="field-hint">
            {previewUrl ? "New recording — save your profile to keep it." : "Your current bio."}
          </div>
        </div>
      )}
    </div>
  );
}
