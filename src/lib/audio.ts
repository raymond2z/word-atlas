import { duck } from "./sound";

type Accent = "uk" | "us";
export type Playback = "recorded" | "device" | "fallback" | "stopped" | "unavailable";
export const pronunciationError = "無法播放發音。請按朗讀重試，並檢查裝置的英文語音。";

let active: AbortController | undefined;

export function stopAudio() {
  active?.abort();
  active = undefined;
  duck(false);
}

export function canSynthesize() {
  return typeof window.speechSynthesis?.speak === "function" &&
    typeof window.SpeechSynthesisUtterance === "function";
}

/** Resolve when audio finishes, fails, or is replaced by another pronunciation. */
export async function play(
  url: string | null | undefined,
  text: string,
  accent: Accent = "uk",
  rate = 1,
  fallbackUrl?: string | null,
): Promise<Playback> {
  stopAudio();
  const controller = new AbortController();
  const { signal } = controller;
  active = controller;
  duck(true);
  try {
    if (url && await playRecording(url, rate, signal)) return "recorded";
    if (signal.aborted) return "stopped";

    const language = accent === "uk" ? "en-GB" : "en-US";
    const synth = canSynthesize() ? window.speechSynthesis : undefined;
    const english = synth?.getVoices().filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang)) ?? [];
    const preferred = english.find((voice) => voice.lang.replace("_", "-").toLowerCase() === language.toLowerCase());
    // A bundled fallback is immediately playable when the device lacks the requested voice.
    const useFallbackFirst = !!fallbackUrl && !preferred;
    if (useFallbackFirst && await playRecording(fallbackUrl, rate, signal)) return "fallback";
    if (signal.aborted) return "stopped";
    if (synth && text.trim() && await playSpeech(synth, text, language, preferred ?? english[0], rate, signal)) return "device";
    if (signal.aborted) return "stopped";
    if (!useFallbackFirst && fallbackUrl && await playRecording(fallbackUrl, rate, signal)) return "fallback";
    return signal.aborted ? "stopped" : "unavailable";
  } finally {
    if (active === controller) {
      active = undefined;
      duck(false);
    }
  }
}

function playRecording(url: string, rate: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    const ended = () => finish(true);
    const failed = () => finish(false);
    const started = () => window.clearTimeout(timeout);
    const timeout = window.setTimeout(failed, 6000);

    function finish(ok: boolean) {
      started();
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", failed);
      audio.removeEventListener("playing", started);
      signal.removeEventListener("abort", failed);
      if (!ok) audio.pause();
      resolve(ok);
    }

    audio.addEventListener("ended", ended);
    audio.addEventListener("error", failed);
    audio.addEventListener("playing", started);
    signal.addEventListener("abort", failed, { once: true });
    void audio.play().catch(failed);
  });
}

function playSpeech(
  synth: SpeechSynthesis,
  text: string,
  language: string,
  voice: SpeechSynthesisVoice | undefined,
  rate: number,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang ?? language;
    if (voice) utterance.voice = voice;
    utterance.rate = rate * 0.95;

    const cancel = () => { finish(false); synth.cancel(); };
    const timeout = window.setTimeout(cancel, 3000);
    function finish(ok: boolean) {
      window.clearTimeout(timeout);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      signal.removeEventListener("abort", cancel);
      resolve(ok);
    }

    utterance.onstart = () => window.clearTimeout(timeout);
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    signal.addEventListener("abort", cancel, { once: true });
    try { synth.speak(utterance); }
    catch { finish(false); }
  });
}
