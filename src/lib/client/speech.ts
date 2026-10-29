"use client";

/**
 * On-device speech + acoustics (PRD 6.2, 7.2).
 *
 *   · SpeechRecognition (Web Speech API) gives the transcript on-device.
 *   · An AnalyserNode on the mic stream gives the raw numbers the acoustic
 *     mapper needs; nothing is uploaded except the feature vector.
 *   · SpeechSynthesis speaks the plain-language reply in the chosen language.
 */

type SR = any;

function getRecognitionCtor(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return !!getRecognitionCtor();
}

export type ListenHandle = {
  stop: () => void;
  abort: () => void;
  state: () => "listening" | "stopped";
};

export type ListenOptions = {
  locale: string;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onLevel?: (level: number) => void;
  /**
   * Raw time-domain frames for on-device acoustic analysis. The buffer is a
   * fresh copy on every tick, so callers may keep it.
   */
  onFrames?: (frame: Float32Array, sampleRate: number) => void;
};

/** Start dictation + level metering. Returns a handle the callers can stop. */
export async function startListening(opts: ListenOptions): Promise<ListenHandle> {
  const Ctor = getRecognitionCtor();
  const rec: SR = Ctor ? new Ctor() : null;
  let stopped = false;
  let levelTimer: number | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;

  if (rec) {
    rec.lang = opts.locale;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += `${chunk} `;
        else interim += chunk;
      }
      const shown = `${finalText}${interim}`.trim();
      if (shown) opts.onPartial?.(shown);
      if (finalText.trim()) opts.onFinal?.(finalText.trim());
    };
    rec.onerror = (e: any) => {
      const map: Record<string, string> = {
        "not-allowed": "Microphone permission was blocked. Allow it in your browser settings.",
        "service-not-allowed": "Speech recognition is unavailable on this browser. Type instead.",
        "no-speech": "I did not hear anything. Try again a little closer to the mic.",
        network: "Speech recognition needs a connection right now. Your words are safe — try again shortly.",
        aborted: "",
      };
      const msg = map[e.error] ?? "Dictation stopped unexpectedly.";
      if (msg) opts.onError?.(msg);
    };
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {
          opts.onEnd?.();
        }
      } else opts.onEnd?.();
    };
    try {
      rec.start();
    } catch {
      /* already started */
    }
  } else {
    opts.onError?.("This browser cannot transcribe speech. You can type what you want to say.");
  }

  // Level metering for the heartbeat UI + acoustic capture.
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    levelTimer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      opts.onLevel?.(Math.min(1, rms * 9));
      opts.onFrames?.(buf.slice(), ctx?.sampleRate ?? 48000);
    }, 90);
  } catch {
    /* metering is optional */
  }

  const cleanup = () => {
    if (levelTimer) window.clearInterval(levelTimer);
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => {});
  };

  return {
    stop: () => {
      stopped = true;
      try {
        rec?.stop();
      } catch {
        /* noop */
      }
      cleanup();
    },
    abort: () => {
      stopped = true;
      try {
        rec?.abort();
      } catch {
        /* noop */
      }
      cleanup();
    },
    state: () => (stopped ? "stopped" : "listening"),
  };
}

/** One-shot level read used by the mic button preview. */
export async function measureLevel(ms = 900): Promise<number> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    const started = Date.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        peak = Math.max(peak, Math.sqrt(sum / buf.length));
        if (Date.now() - started > ms) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
    return Math.min(1, peak * 9);
  } catch {
    return 0;
  }
}

export function speak(text: string, lang: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const want = lang.toLowerCase();
    const voice =
      voices.find((v) => v.lang.toLowerCase().startsWith(want)) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    if (voice) u.voice = voice;
    u.lang = want.includes("-") ? lang : `${lang}-IN`;
    u.rate = 0.97;
    u.pitch = 1;
    u.onend = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch {
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}
