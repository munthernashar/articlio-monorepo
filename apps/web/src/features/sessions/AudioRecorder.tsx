import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Trash2, Upload } from 'lucide-react';
import { SESSION_PROCESSING_LIMITS } from '@/lib/config';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';

type RecorderState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'paused'
  | 'ready_to_upload'
  | 'uploading'
  | 'error';

type AudioRecorderProps = {
  disabled?: boolean;
  onRecorded: (payload: { blob: Blob; durationSeconds: number }) => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  onStateChange?: (state: RecorderState) => void;
  compact?: boolean;
  variant?: 'default' | 'coach';
  showStatusLabel?: boolean;
  /** Fällt auf SESSION_PROCESSING_LIMITS.recommendedMinAudioSeconds zurück, wenn nicht gesetzt. */
  recommendedMinAudioSeconds?: number;
  /** Fällt auf SESSION_PROCESSING_LIMITS.softMaxAudioSeconds zurück, wenn nicht gesetzt. */
  softMaxAudioSeconds?: number;
  /** Fällt auf SESSION_PROCESSING_LIMITS.hardMaxAudioSeconds zurück, wenn nicht gesetzt. */
  hardMaxAudioSeconds?: number;
  /**
   * Feuert, sobald der Audiopegel für sustainedSilenceMs ununterbrochen unter der
   * Stille-Schwelle bleibt (nutzt dieselbe RMS-Messung wie die Pegelanzeige, siehe
   * startLevelMeter). Re-arm passiert automatisch, sobald der Pegel wieder über die
   * Schwelle steigt, sodass mehrere Sprechpausen pro Aufnahme jeweils einmal feuern.
   * Feuert über die gesamte Aufnahme hinweg unbegrenzt oft (kein Abbruch nach N
   * Malen) -- ein Aufrufer mit einer endlichen Anzahl an Anschlussfragen (z.B.
   * SessionRecordingPanel) erreicht irgendwann das Ende seiner eigenen Liste und
   * hat für weitere Aufrufe nichts Neues zu zeigen; siehe autoPauseAfterSilenceCount
   * für das dafür vorgesehene Verhalten, statt einfach nichts mehr zu tun.
   */
  onSustainedSilence?: () => void;
  /** Default 4000ms (nutzerfeedback: 2000ms unterbricht normale Sprechpausen/Nachdenkzeit). */
  sustainedSilenceMs?: number;
  /**
   * Nach dieser Anzahl an onSustainedSilence-Ereignissen pausiert die Aufnahme
   * automatisch selbst (wie pauseRecording, inkl. onAutoPaused-Callback) --
   * best practice bei IVR/Voice-Agent-Systemen ist ein bis zwei erneute
   * Nachfragen bei Stille, danach ein echter Fallback-Zustand statt endloser
   * Wiederholung. Undefined = kein Auto-Pause (Default, unverändertes Verhalten
   * für andere Verbraucher wie den Coach-Recorder).
   */
  autoPauseAfterSilenceCount?: number;
  /** Feuert genau einmal, wenn autoPauseAfterSilenceCount die Aufnahme pausiert hat. */
  onAutoPaused?: () => void;
};

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function AudioRecorder({
  disabled = false,
  onRecorded,
  onStart,
  onStop,
  onStateChange,
  compact = false,
  variant = 'default',
  showStatusLabel = true,
  recommendedMinAudioSeconds = SESSION_PROCESSING_LIMITS.recommendedMinAudioSeconds,
  softMaxAudioSeconds = SESSION_PROCESSING_LIMITS.softMaxAudioSeconds,
  hardMaxAudioSeconds = SESSION_PROCESSING_LIMITS.hardMaxAudioSeconds,
  onSustainedSilence,
  sustainedSilenceMs = 4000,
  autoPauseAfterSilenceCount,
  onAutoPaused,
}: AudioRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const segmentStartedAtRef = useRef<number | null>(null);
  const accumulatedDurationMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const discardRequestedRef = useRef(false);
  const uploadRequestedRef = useRef(false);
  const softLimitHintShownRef = useRef(false);
  const belowRecommendedMinHintActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelAnimationFrameRef = useRef<number | null>(null);
  const levelMeterRef = useRef<HTMLDivElement | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const silenceFiredRef = useRef(false);
  // Zählt onSustainedSilence-Ereignisse über die GESAMTE Aufnahme (nicht pro
  // Sprechpause zurückgesetzt) -- Grundlage für autoPauseAfterSilenceCount.
  const silenceEventCountRef = useRef(0);
  // Ref-Spiegel statt direkter Closure-Erfassung: startLevelMeter wird einmal pro
  // Aufnahme aufgerufen, onSustainedSilence/sustainedSilenceMs müssen aber den
  // jeweils aktuellen Prop-Wert lesen, auch wenn der Elternkomponenten-Handler
  // sich zwischen Renders ändert (gleiches Muster wie in TutorWorkspace.tsx).
  const onSustainedSilenceRef = useRef(onSustainedSilence);
  const sustainedSilenceMsRef = useRef(sustainedSilenceMs);
  const autoPauseAfterSilenceCountRef = useRef(autoPauseAfterSilenceCount);
  const onAutoPausedRef = useRef(onAutoPaused);
  useEffect(() => {
    onSustainedSilenceRef.current = onSustainedSilence;
    sustainedSilenceMsRef.current = sustainedSilenceMs;
    autoPauseAfterSilenceCountRef.current = autoPauseAfterSilenceCount;
    onAutoPausedRef.current = onAutoPaused;
  }, [onSustainedSilence, sustainedSilenceMs, autoPauseAfterSilenceCount, onAutoPaused]);

  const [state, setState] = useState<RecorderState>('idle');
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{ blob: Blob; durationSeconds: number } | null>(null);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const stopLevelMeter = useCallback(() => {
    if (levelAnimationFrameRef.current !== null) {
      cancelAnimationFrame(levelAnimationFrameRef.current);
      levelAnimationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    if (levelMeterRef.current) {
      levelMeterRef.current.style.transform = 'scaleX(0)';
    }
    silenceStartedAtRef.current = null;
    silenceFiredRef.current = false;
  }, []);

  // Web-Audio-Pegelanzeige: die einzige bisherige Rückmeldung, dass das Mikrofon
  // wirklich hört, war ein Textlabel und ein tickender Zähler -- ein stummgeschaltetes
  // Mikro oder ein falsches Eingabegerät erzeugte dadurch eine scheinbar valide
  // Aufnahme, die erst nach Upload + Transkription auffiel (Launch-Readiness-Audit
  // Zwölfter Nachtrag, UI/UX-Befund). Schreibt direkt per Ref auf den DOM statt über
  // React-State, damit die ~60x/Sekunde-Updates keine Re-Renders der ganzen
  // Komponente auslösen.
  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (const sample of dataArray) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        // Normale Sprachlautstärke schlägt im Zeitbereich nur schwach aus --
        // Faktor 4 macht den Balken bei normaler Sprechlautstärke gut sichtbar.
        const level = Math.min(1, rms * 4);
        if (levelMeterRef.current) {
          levelMeterRef.current.style.transform = `scaleX(${level})`;
        }

        // Dieselbe RMS-Messung treibt auch die Stillephasen-Erkennung für
        // onSustainedSilence: unter der Schwelle bleibt (Sprechpause), oben drüber
        // gilt wieder als "spricht" und arm die Erkennung neu.
        const SILENCE_LEVEL_THRESHOLD = 0.04;
        if (stateRef.current === 'recording' && level < SILENCE_LEVEL_THRESHOLD) {
          if (silenceStartedAtRef.current === null) {
            silenceStartedAtRef.current = performance.now();
          } else if (
            !silenceFiredRef.current
            && performance.now() - silenceStartedAtRef.current >= sustainedSilenceMsRef.current
          ) {
            silenceFiredRef.current = true;
            silenceEventCountRef.current += 1;
            onSustainedSilenceRef.current?.();

            const autoPauseLimit = autoPauseAfterSilenceCountRef.current;
            if (autoPauseLimit !== undefined && silenceEventCountRef.current >= autoPauseLimit) {
              // Gleiche Grundoperationen wie pauseRecording (Dauer-Buchhaltung +
              // MediaRecorder.pause()) -- direkt hier statt über die pauseRecording-
              // Closure, da die zum Zeitpunkt der Definition dieses Ticks noch nicht
              // existiert (wird weiter unten in der Datei deklariert).
              const segmentStartedAt = segmentStartedAtRef.current;
              if (segmentStartedAt) {
                accumulatedDurationMsRef.current += Date.now() - segmentStartedAt;
                segmentStartedAtRef.current = null;
              }
              recorderRef.current?.pause();
              onAutoPausedRef.current?.();
            }
          }
        } else {
          silenceStartedAtRef.current = null;
          silenceFiredRef.current = false;
        }

        levelAnimationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      // Pegelanzeige ist ein Komfort-Feature, kein Aufnahme-Blocker -- bei fehlender
      // AudioContext-Unterstützung (sehr alte Browser) einfach ohne Meter weitermachen.
      console.error('[AudioRecorder] Pegelanzeige konnte nicht gestartet werden', error);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    segmentStartedAtRef.current = null;
    accumulatedDurationMsRef.current = 0;
    stopLevelMeter();
  }, [stopLevelMeter]);

  useEffect(() => cleanup, [cleanup]);

  const validateRecordingForUpload = useCallback((recording: { blob: Blob; durationSeconds: number }) => {
    if (recording.blob.size > SESSION_PROCESSING_LIMITS.maxFileSizeBytes) {
      setErrorMessage('Die Audio-Datei ist technisch zu groß. Bitte kürzer aufnehmen.');
      setState('ready_to_upload');
      return false;
    }

    if (recording.durationSeconds < SESSION_PROCESSING_LIMITS.minAudioSeconds) {
      setErrorMessage('Die Aufnahme ist noch zu kurz. Sprich bitte noch etwas länger und speichere dann erneut.');
      setState('ready_to_upload');
      return false;
    }

    return true;
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || state === 'recording' || state === 'paused') return;
    try {
      setErrorMessage(null);
      setHintMessage(null);
      softLimitHintShownRef.current = false;
      belowRecommendedMinHintActiveRef.current = false;
      setState('requesting_permission');
      setDurationSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'video/mp4'];
      const supportedMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = mediaRecorder;
      chunksRef.current = [];
      segmentStartedAtRef.current = Date.now();
      accumulatedDurationMsRef.current = 0;
      silenceEventCountRef.current = 0;
      startLevelMeter(stream);

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorder.onpause = () => setState('paused');
      mediaRecorder.onresume = () => setState('recording');
      mediaRecorder.onerror = (event: ErrorEvent) => {
        console.error('[AudioRecorder] MediaRecorder-Fehler', event.error);
        discardRequestedRef.current = false;
        uploadRequestedRef.current = false;
        cleanup();
        setPendingRecording(null);
        setDurationSeconds(0);
        setState('error');
        setErrorMessage('Die Aufnahme wurde unerwartet unterbrochen. Bitte versuche es erneut.');
      };
      mediaRecorder.onstop = async () => {
        await onStop?.();
        if (discardRequestedRef.current) {
          discardRequestedRef.current = false;
          cleanup();
          setPendingRecording(null);
          setDurationSeconds(0);
          setErrorMessage(null);
          setHintMessage(null);
          setState('idle');
          return;
        }
        const segmentStartedAt = segmentStartedAtRef.current;
        const activeSegmentMs = segmentStartedAt ? Date.now() - segmentStartedAt : 0;
        const measuredDuration = Math.max(0, Math.round((accumulatedDurationMsRef.current + activeSegmentMs) / 1000));
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        cleanup();
        setState('idle');
        if (blob.size === 0) {
          setErrorMessage('Keine Audiodaten erfasst. Bitte erneut aufnehmen.');
          setState('error');
          return;
        }
        const recordingPayload = { blob, durationSeconds: measuredDuration };
        if (uploadRequestedRef.current) {
          uploadRequestedRef.current = false;
          try {
            setErrorMessage(null);
            if (!validateRecordingForUpload(recordingPayload)) {
              setPendingRecording(recordingPayload);
              setDurationSeconds(measuredDuration);
              return;
            }
            setState('uploading');
            await onRecorded(recordingPayload);
            setPendingRecording(null);
            setDurationSeconds(0);
            setState('idle');
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Aufnahme konnte nicht verarbeitet werden.');
            setPendingRecording(recordingPayload);
            setDurationSeconds(measuredDuration);
            setState('ready_to_upload');
          }
          return;
        }

        setPendingRecording(recordingPayload);
        setDurationSeconds(measuredDuration);
        setState('ready_to_upload');
      };

      mediaRecorder.start();
      await onStart?.();
      setState('recording');
      timerRef.current = window.setInterval(() => {
        const segmentStartedAt = segmentStartedAtRef.current;
        const activeSegmentMs = segmentStartedAt ? Date.now() - segmentStartedAt : 0;
        const totalMs = accumulatedDurationMsRef.current + activeSegmentMs;
        const nextDurationSeconds = Math.max(0, Math.round(totalMs / 1000));
        setDurationSeconds(nextDurationSeconds);

        // Live-Hinweis fürs Free-Tier (und generell): ermutigt zum Weitersprechen, solange
        // noch nicht genug Material für ein verlässliches Feedback da ist -- reversibel statt
        // "einmalig" wie softLimitHintShownRef, da der Zustand mit der Zeit von selbst wieder
        // verschwindet (siehe process-session/index.ts, INSUFFICIENT_DATA_MIN_WORD_COUNT für
        // denselben Gedanken serverseitig).
        if (nextDurationSeconds < recommendedMinAudioSeconds) {
          if (!belowRecommendedMinHintActiveRef.current) {
            belowRecommendedMinHintActiveRef.current = true;
            setHintMessage('Sprich noch etwas länger, damit wir dir ein gutes Feedback geben können.');
          }
        } else if (belowRecommendedMinHintActiveRef.current) {
          belowRecommendedMinHintActiveRef.current = false;
          setHintMessage(null);
        }

        if (nextDurationSeconds >= softMaxAudioSeconds && !softLimitHintShownRef.current) {
          softLimitHintShownRef.current = true;
          setHintMessage('Du hast bereits genug Material aufgenommen. Du kannst jetzt gern abschließen.');
        }

        if (nextDurationSeconds >= hardMaxAudioSeconds && recorderRef.current?.state !== 'inactive') {
          setHintMessage('Die maximale Aufnahmedauer ist erreicht. Die Aufnahme wurde beendet.');
          recorderRef.current?.stop();
        }
      }, 250);
    } catch (error) {
      cleanup();
      setState('error');
      const domErrorName = error instanceof DOMException ? error.name : null;
      setErrorMessage(
        domErrorName === 'NotAllowedError'
          ? 'Mikrofonzugriff verweigert. Bitte Rechte im Browser erlauben.'
          : domErrorName === 'NotFoundError'
            ? 'Kein Mikrofon gefunden. Bitte ein Mikrofon anschließen und erneut versuchen.'
            : domErrorName === 'NotReadableError'
              ? 'Auf das Mikrofon kann nicht zugegriffen werden. Möglicherweise wird es von einer anderen App verwendet.'
              : error instanceof Error
                ? error.message
                : 'Mikrofon konnte nicht gestartet werden.',
      );
    }
  }, [cleanup, disabled, hardMaxAudioSeconds, onRecorded, onStart, onStop, recommendedMinAudioSeconds, softMaxAudioSeconds, startLevelMeter, state, validateRecordingForUpload]);

  const pauseRecording = useCallback(() => {
    if (state !== 'recording') return;
    const segmentStartedAt = segmentStartedAtRef.current;
    if (segmentStartedAt) {
      accumulatedDurationMsRef.current += Date.now() - segmentStartedAt;
      segmentStartedAtRef.current = null;
    }
    recorderRef.current?.pause();
  }, [state]);

  const resumeRecording = useCallback(() => {
    if (state !== 'paused') return;
    segmentStartedAtRef.current = Date.now();
    recorderRef.current?.resume();
  }, [state]);

  const discardRecording = useCallback(() => {
    if (state === 'recording' || state === 'paused') {
      discardRequestedRef.current = true;
      if (state === 'recording') {
        const segmentStartedAt = segmentStartedAtRef.current;
        if (segmentStartedAt) {
          accumulatedDurationMsRef.current += Date.now() - segmentStartedAt;
          segmentStartedAtRef.current = null;
        }
      }
      recorderRef.current?.stop();
      return;
    }
    cleanup();
    setPendingRecording(null);
    setDurationSeconds(0);
    setErrorMessage(null);
    setHintMessage(null);
    setState('idle');
  }, [cleanup, state]);

  const uploadRecording = useCallback(async () => {
    if (disabled) return;
    if ((state === 'recording' || state === 'paused') && recorderRef.current) {
      uploadRequestedRef.current = true;
      if (state === 'recording') {
        const segmentStartedAt = segmentStartedAtRef.current;
        if (segmentStartedAt) {
          accumulatedDurationMsRef.current += Date.now() - segmentStartedAt;
          segmentStartedAtRef.current = null;
        }
      }
      recorderRef.current.stop();
      return;
    }
    if (!pendingRecording) return;

    if (!validateRecordingForUpload(pendingRecording)) return;

    try {
      setErrorMessage(null);
      setState('uploading');
      await onRecorded(pendingRecording);
      setPendingRecording(null);
      setDurationSeconds(0);
      setState('idle');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Aufnahme konnte nicht verarbeitet werden.');
      setState('ready_to_upload');
    }
  }, [disabled, onRecorded, pendingRecording, state, validateRecordingForUpload]);

  const stateLabel = useMemo(() => {
    if (variant === 'coach') {
      if (state === 'requesting_permission') return 'Mikrofon wird vorbereitet …';
      if (state === 'recording') return 'Ich höre zu …';
      if (state === 'ready_to_upload') return 'Antwort bereit';
      if (state === 'uploading') return 'Coach hört sich deine Antwort an …';
      if (state === 'error') return 'Das hat leider nicht geklappt.';
      return 'Bereit';
    }
    if (state === 'requesting_permission') return 'Mikrofon wird vorbereitet …';
    if (state === 'recording') return 'Aufnahme läuft …';
    if (state === 'ready_to_upload') return 'Aufnahme bereit';
    if (state === 'uploading') return 'Antwort wird übernommen …';
    if (state === 'error') return 'Fehler';
    return 'Bereit';
  }, [state, variant]);

  const primaryAction = useMemo(() => {
    if (variant === 'coach') {
      if (state === 'recording') return { label: 'Fertig', action: uploadRecording, disabled };
      if (state === 'ready_to_upload') return { label: 'Antwort abgeben', action: uploadRecording, disabled: disabled || !pendingRecording };
      return {
        label: 'Antwort aufnehmen',
        action: startRecording,
        disabled: disabled || state === 'requesting_permission' || state === 'uploading',
      };
    }

    return {
      label: 'Start',
      action: startRecording,
      disabled: disabled || state === 'requesting_permission' || state === 'uploading' || state === 'recording' || state === 'paused',
    };
  }, [variant, state, disabled, pendingRecording, uploadRecording, startRecording]);

  const content = (
    <>
      {!compact ? <h3>{variant === 'coach' ? 'Antwortbereich' : 'Audioaufnahme'}</h3> : null}
      {showStatusLabel ? (
        <p role="status" aria-live="polite">
          <strong>{stateLabel}</strong>
        </p>
      ) : null}
      <p className={variant === 'coach' ? 'recorder-duration recorder-duration--coach' : 'recorder-duration'}>Dauer: <strong>{formatDuration(durationSeconds)}</strong></p>
      {state === 'recording' || state === 'paused' ? (
        <div className="recorder-level-meter" aria-hidden="true">
          <div ref={levelMeterRef} className="recorder-level-meter-fill" />
        </div>
      ) : null}
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {hintMessage ? <p aria-live="polite">{hintMessage}</p> : null}
      <div className={variant === 'coach' ? 'recorder-toolbar recorder-toolbar--coach' : 'recorder-toolbar'} role="toolbar" aria-label={variant === 'coach' ? 'Antwort aufnehmen' : 'Audioaufnahme steuern'}>
        <button type="button" className="recorder-action recorder-action--primary" onClick={primaryAction.action} disabled={primaryAction.disabled} title={primaryAction.label}>
          <span>{primaryAction.label}</span>
        </button>
        {variant === 'coach' ? (
          <>
            {state === 'ready_to_upload' ? (
              <button type="button" className="recorder-action" onClick={discardRecording} disabled={disabled || !pendingRecording} title="Neu aufnehmen">
                <span>Neu aufnehmen</span>
              </button>
            ) : null}
            {state === 'paused' ? (
              <button type="button" className="recorder-action recorder-action--warn" onClick={resumeRecording} disabled={disabled || state !== 'paused'} title="Weiter">
                <span>Weiter</span>
              </button>
            ) : null}
          </>
        ) : (
          <>
            {state === 'recording' ? (
              <button type="button" className="recorder-action recorder-action--warn" onClick={pauseRecording} disabled={disabled} title="Aufnahme pausieren">
                <Pause aria-hidden="true" size={ICON_SIZE_SM} className="recorder-action-icon" />
                <span>Pause</span>
              </button>
            ) : null}
            {state === 'paused' ? (
              <button type="button" className="recorder-action recorder-action--warn" onClick={resumeRecording} disabled={disabled} title="Aufnahme fortsetzen">
                <Play aria-hidden="true" size={ICON_SIZE_SM} className="recorder-action-icon" />
                <span>Weiter</span>
              </button>
            ) : null}
            <button type="button" className="recorder-action recorder-action--danger" onClick={discardRecording} disabled={disabled || state === 'requesting_permission' || state === 'uploading' || (state === 'idle' && !pendingRecording)} title="Aufnahme löschen">
              <Trash2 aria-hidden="true" size={ICON_SIZE_SM} className="recorder-action-icon" />
              <span>Abbrechen</span>
            </button>
            {(state === 'ready_to_upload' || state === 'paused') ? (
              <button type="button" className="recorder-action recorder-action--success" onClick={uploadRecording} disabled={disabled || (state === 'ready_to_upload' && !pendingRecording)} title="Beenden & speichern">
                <Upload aria-hidden="true" size={ICON_SIZE_SM} className="recorder-action-icon" />
                <span>Beenden & speichern</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );

  return compact ? <div>{content}</div> : <article className="card recorder-card">{content}</article>;
}
