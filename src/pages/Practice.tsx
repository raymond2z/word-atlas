import { Headphones, Keyboard, RotateCcw, Type, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { prefetch, useAtlas } from "../atlas/context";
import type { Entry } from "../atlas/types";
import { canSynthesize, play, pronunciationError, stopAudio, type Playback } from "../lib/audio";
import { cue } from "../lib/sound";
import { hashSeed, shuffle } from "../lib/text";
import { clean, correctCharacterCount, same, typingDelta, typingMetrics } from "../lib/typing";
import { store, useStore } from "../store/store";
import { AmbiencePicker } from "../ui/Ambience";
import { Illustration } from "../ui/Illustration";

type Mode = "word" | "sentence" | "dictation";
type Source = "recent" | "mistakes" | "saved" | "path";

const MODES: [Mode, string, string, typeof Type][] = [
  ["word", "單字", "看提示，寫出英文", Type],
  ["sentence", "例句", "照着抄寫，練出手感", Keyboard],
  ["dictation", "聽寫", "只聽聲音，寫下整句", Headphones],
];
const SOURCES: [Source, string][] = [
  ["recent", "最近學過"],
  ["mistakes", "錯詞本"],
  ["saved", "收藏"],
  ["path", "學習路線"],
];

export function Practice() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const startLevel = useStore((s) => s.settings.startLevel);
  const [mode, setMode] = useState<Mode>("word");
  const [source, setSource] = useState<Source>(() => (Object.keys(progress.cards).length ? "recent" : "path"));
  const [round, setRound] = useState<{ entries: Entry[]; key: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");
  const canSpeak = canSynthesize();

  const pool = useMemo(() => {
    const learned = Object.entries(progress.cards)
      .sort((a, b) => (b[1].last ?? 0) - (a[1].last ?? 0))
      .map(([id]) => id);
    const ids =
      source === "recent" ? learned : source === "mistakes" ? progress.mistakes : source === "saved" ? progress.bookmarks : atlas.words.filter((w) => w.cefr >= startLevel).slice(0, 400).map((w) => w.id);
    return ids.filter((id) => atlas.byId.has(id));
  }, [atlas, progress.cards, progress.mistakes, progress.bookmarks, source, startLevel]);

  const eligible = useMemo(() => mode === "word" ? pool : pool.filter((id) => {
    const ref = atlas.byId.get(id)!;
    const hasExample = ref.hasExample ?? !!atlas.peek(id)?.ex.some((example) => example.en.trim());
    return hasExample && (mode !== "dictation" || canSpeak || !!atlas.audio(ref, "ex"));
  }), [atlas, pool, mode, canSpeak]);

  const chooseMode = (next: Mode) => { setMode(next); setProblem(""); };
  const chooseSource = (next: Source) => { setSource(next); setProblem(""); };

  const start = async () => {
    if (loading || !eligible.length) return;
    setProblem("");
    setLoading(true);
    try {
      const ids = shuffle(eligible, hashSeed(String(Date.now()))).slice(0, 10);
      const entries = (await prefetch(atlas, ids)).filter((e): e is Entry => !!e && (mode === "word" || !!e.ex[0]?.en.trim()));
      if (entries.length !== ids.length) {
        setRound(null);
        setProblem("部分詞條未能載入。請重試，或換一個練習來源。");
        return;
      }
      setRound({ entries, key: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  if (round) return <TypingRound key={round.key} mode={mode} entries={round.entries} onExit={() => setRound(null)} onAgain={start} loading={loading} />;

  const best = progress.typing.filter((t) => t.mode === mode).reduce((m, t) => Math.max(m, t.wpm), 0);
  return (
    <div className="page practice">
      <header className="page-head">
        <p className="eyebrow">練習 · Typing Studio</p>
        <h1 className="display">讓手，也記住它們。</h1>
        <p className="lede">打字只練拼寫和手感，不會改動記憶進度。</p>
      </header>
      <div className="practice-grid">
        <section className="panel">
          <h3 className="eyebrow">模式</h3>
          <div className="mode-cards">
            {MODES.map(([k, name, desc, Icon]) => (
              <button key={k} className={`mode-card ${mode === k ? "is-on" : ""}`} onClick={() => chooseMode(k)} disabled={loading} aria-pressed={mode === k}>
                <Icon size={22} strokeWidth={1.7} />
                <b>{name}</b>
                <small>{desc}</small>
              </button>
            ))}
          </div>
          <h3 className="eyebrow">詞來自</h3>
          <div className="segmented segmented-wide">
            {SOURCES.map(([k, label]) => (
              <button key={k} className={source === k ? "is-on" : ""} onClick={() => chooseSource(k)} disabled={loading} aria-pressed={source === k}>
                {label}
              </button>
            ))}
          </div>
          <p className="muted" role="status">
            {loading ? "正在準備題目…" : eligible.length
              ? `可練 ${eligible.length.toLocaleString()} 題，本輪隨機抽 ${Math.min(10, eligible.length)} 題。`
              : !pool.length ? "這個來源還沒有詞條，請換一個來源。"
              : mode === "dictation" && !canSpeak ? "目前沒有可播放的例句錄音。"
              : "這個來源的詞條沒有英文例句。"}
          </p>
          {problem && <p role="alert" className="warn-text">{problem}</p>}
          {eligible.length === 0 && pool.length > 0 && mode !== "word"
            ? <button className="btn btn-primary btn-xl" onClick={() => chooseMode("word")}>改練單字</button>
            : <button className="btn btn-primary btn-xl" onClick={start} disabled={loading || !eligible.length}>
              {loading ? "準備中…" : "開始一輪"}
            </button>}
        </section>
        <section className="panel practice-side">
          <img src={`${import.meta.env.BASE_URL}brand/${mode === "dictation" ? "listen" : "typing"}.webp`} alt="" />
          <dl className="mini-stats">
            <div>
              <dt>最佳速度</dt>
              <dd>
                {best}
                <small>WPM</small>
              </dd>
            </div>
            <div>
              <dt>完成輪次</dt>
              <dd>{progress.typing.length}</dd>
            </div>
          </dl>
          <p className="muted">WPM 按標準每 5 個字符計 1 詞，只統計正確輸入。</p>
        </section>
      </div>
    </div>
  );
}

function TypingRound({ mode, entries, onExit, onAgain, loading }: { mode: Mode; entries: Entry[]; onExit: () => void; onAgain: () => void; loading: boolean }) {
  const atlas = useAtlas();
  const settings = useStore((s) => s.settings);
  const [i, setI] = useState(0);
  const [value, setValue] = useState("");
  // Running totals live in a ref so every keystroke is counted exactly once.
  const totalsRef = useRef({ typed: 0, correct: 0, accepted: 0, ms: 0 });
  const [totals, setTotals] = useState(totalsRef.current);
  const [done, setDone] = useState(false);
  const [audioState, setAudioState] = useState<Playback | null>(null);
  const started = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const e = entries[i];
  const target = mode === "word" ? e.w : e.ex[0].en;
  const fallbackUrl = mode === "word" ? atlas.wordFallbackAudio?.(e) : null;
  const read = () => play(atlas.audio(e, mode === "word" ? settings.accent : "ex"), target, settings.accent, 1, fallbackUrl);
  const reportAudio = (status: Playback) => { if (status !== "stopped") setAudioState(status); };

  useEffect(() => {
    setValue("");
    setAudioState(null);
    started.current = null;
    input.current?.focus();
    if (mode === "dictation" || settings.autoplay) void read().then(reportAudio);
    return stopAudio;
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (next: string) => {
    if (done) return;
    if (started.current === null && next) started.current = performance.now();
    const d = typingDelta(value, next, target);
    if (settings.sfx && d.total > 0) void cue("key");
    const t = totalsRef.current;
    totalsRef.current = { ...t, typed: t.typed + d.total, correct: t.correct + d.correct };
    setTotals(totalsRef.current);
    setValue(next);
    if (clean(next).length >= clean(target).length && same(next.trimEnd(), target)) finishItem(next);
  };

  const finishItem = (final: string) => {
    const ms = started.current ? performance.now() - started.current : 0;
    const accepted = correctCharacterCount(final, target);
    if (settings.sfx) void cue("correct");
    const t = totalsRef.current;
    const nt = { ...t, accepted: t.accepted + accepted, ms: t.ms + ms };
    totalsRef.current = nt;
    setTotals(nt);
    if (i + 1 >= entries.length) {
      setDone(true);
      const m = typingMetrics(nt.correct, nt.typed, nt.accepted, nt.ms);
      store.progress((p) => ({ ...p, typing: [...p.typing, { at: Date.now(), mode, items: entries.length, wpm: m.wpm, accuracy: m.accuracy }].slice(-500) }));
    } else window.setTimeout(() => setI(i + 1), 260);
  };

  const m = typingMetrics(totals.correct, totals.typed, totals.accepted, totals.ms);
  const chars = Array.from(target);
  const typed = Array.from(value);

  if (done)
    return (
      <div className="page practice">
        <section className="panel typing-done">
          <p className="eyebrow">本輪完成</p>
          <h1 className="display">
            {m.wpm} <small>WPM</small>
          </h1>
          <p className="lede">準確率 {m.accuracy}% · {entries.length} 項</p>
          <div className="summary-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              返回
            </button>
            <button className="btn btn-primary btn-xl" onClick={onAgain} disabled={loading} autoFocus>
              <RotateCcw size={18} /> {loading ? "準備中…" : "再來一輪"}
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="page practice typing">
      <header className="typing-top">
        <button className="btn btn-ghost" onClick={onExit}>
          結束
        </button>
        <AmbiencePicker />
        <div className="learn-progress">
          <span style={{ width: `${(i / entries.length) * 100}%` }} />
        </div>
        <span className="typing-meter">
          <b>{m.wpm}</b> WPM · <b>{m.accuracy}%</b>
        </span>
      </header>
      <section className="typing-stage" onClick={() => input.current?.focus()}>
        {mode === "word" && (
          <div className="typing-cue">
            <Illustration src={atlas.img(e)} word={e.w} topic={0} eager />
            <p>
              <span className="pos">{e.senses[0].pos}</span> {e.senses[0].zh}
            </p>
          </div>
        )}
        {mode !== "word" && (
          e.ex[0].zh && <p className="typing-zh">{e.ex[0].zh}</p>
        )}
        <button className="btn btn-ghost" type="button" onClick={(event) => {
          event.stopPropagation();
          setAudioState(null);
          void read().then(reportAudio);
        }}>
          <Volume2 size={18} /> {mode === "word" ? "朗讀單字" : mode === "sentence" ? "朗讀例句" : "再聽一遍"}
        </button>
        {audioState === "unavailable" && <p role="status" className="warn-text">{pronunciationError}</p>}
        {audioState === "fallback" && <p role="status" className="muted">已播放備用美式發音。</p>}
        <p className={`typing-text ${mode === "word" ? "is-word" : ""} ${mode === "dictation" ? "is-hidden" : ""}`} lang="en" aria-hidden="true">
          {chars.map((ch, k) => {
            const t = typed[k];
            const cls = t === undefined ? (k === typed.length ? "is-caret" : "") : same(t, ch) ? "is-ok" : "is-bad";
            const show = mode === "dictation" && t === undefined ? (ch === " " ? " " : /[A-Za-z]/.test(ch) ? "·" : ch) : ch;
            return (
              <span key={k} className={cls}>
                {show}
              </span>
            );
          })}
        </p>
        <input
          ref={input}
          className="typing-input"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="在這裏輸入"
        />
        <p className="muted typing-help">
          {mode === "dictation" ? "聽不清可以點「再聽一遍」。" : "直接開始輸入，全部正確後自動進入下一項。"} 第 {i + 1}/{entries.length} 項
        </p>
      </section>
    </div>
  );
}
