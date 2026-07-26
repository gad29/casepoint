'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Called with the recorded clip once the user confirms. */
  onRecorded: (blob: Blob, durationSec: number) => void;
  disabled?: boolean;
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Microphone recorder for chat voice notes (MediaRecorder + preview before sending). */
export function VoiceRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; duration: number } | null>(null);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (preview) URL.revokeObjectURL(preview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('הדפדפן אינו תומך בהקלטה');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setPreview({ url, blob, duration: seconds });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('אין הרשאה לשימוש במיקרופון');
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function cancel() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setRecording(false);
    setSeconds(0);
  }

  function send() {
    if (!preview) return;
    onRecorded(preview.blob, preview.duration || seconds);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSeconds(0);
  }

  if (preview) {
    return (
      <div className="voice-preview">
        <audio controls src={preview.url} style={{ height: 32 }} />
        <span className="muted" style={{ fontSize: 12 }}>{formatDuration(preview.duration || seconds)}</span>
        <button type="button" className="doc-action-btn approve" onClick={send}>שלח הקלטה</button>
        <button type="button" className="doc-action-btn reject" onClick={cancel}>בטל</button>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="voice-preview">
        <span className="rec-dot" />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatDuration(seconds)}</span>
        <button type="button" className="doc-action-btn approve" onClick={stop}>⏹ סיים</button>
        <button type="button" className="doc-action-btn reject" onClick={cancel}>בטל</button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="composer-btn"
        onClick={start}
        disabled={disabled}
        title="הקלטת הודעה קולית"
        aria-label="הקלטת הודעה קולית"
      >
        🎤
      </button>
      {error && <span className="form-error" style={{ fontSize: 12, margin: 0 }}>{error}</span>}
    </>
  );
}
