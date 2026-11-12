import { ArrowRight, Check, Lightbulb, RotateCcw, Share2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prefetch, useAtlas, useEntry } from "../atlas/context";
import type { Entry, WordRef } from "../atlas/types";
import { play, pronunciationError, stopAudio } from "../lib/audio";
import { burst } from "../lib/burst";
import { cue } from "../lib/sound";
import { go } from "../lib/router";
import { gap, normalize, splitPair } from "../lib/text";
import { answer, advance, buildGuidedSession, buildSession, gradeFor, guidedRecap, guidedStats, sessionStats, useTextQuestion } from "../store/session";
import { Rating } from "../store/srs";
import { store, useStore, type ActiveSession, type QuizKind, type Step } from "../store/store";
import { EntryView, Highlight } from "../ui/EntryView";
import { Illustration } from "../ui/Illustration";
import { Galaxy } from "../galaxy/Galaxy";
import { AmbiencePicker } from "../ui/Ambience";
import { Ring } from "../ui/Ring";
import { Speak } from "../ui/Speak";
import { shareSession } from "../ui/shareSession";

export function Learn() {
  const atlas = useAtlas();
  const session = useStore((s) => s.progress.session);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { progress, settings } = store.get();
    if (!progress.session) {
      const s = buildGuidedSession(atlas, progress, settings, 5);
      if (!s.steps.length) {
        go({ page: "today" }, null, true);
        return;
      }
      store.progress((p) => ({ ...p, session: s }));
    }
  }, [atlas]);

  const ids = useMemo(() => [...new Set(session?.steps.map((s) => s.id) ?? [])], [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ids.length) return;
    let live = true;
    // Load the first chunk before rendering, the rest in the background.
    prefetch(atlas, ids.slice(0, 6)).then(() => live && setReady(true));
    void prefetch(atlas, ids);
    return () => {
      live = false;
    };
  }, [atlas, ids]);

  useEffect(() => () => stopAudio(), []);

  if (!session || !ready) return <div className="learn learn-loading"><span className="spinner" /></div>;
  if (session.finished || session.index >= session.steps.length) return <Summary session={session} />;
  return <Runner session={session} />;
}

function Runner({ session }: { session: ActiveSession }) {
  const atlas = useAtlas();
  const step = session.steps[session.index];
  const total = session.steps.length;
  const exit = () => {
    stopAudio();
    go({ page: "today" });
  };
  return (
    <div className="learn">
      <header className="learn-top">
        <button className="icon-btn" onClick={exit} aria-label="暫停並返回">
          <X size={22} />
        </button>
        <div className="learn-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={session.index}>
          <span style={{ width: `${(session.index / total) * 100}%` }} />
        </div>
        <span className="learn-count">
          {session.index + 1}
          <small>/{total}</small>
        </span>
        <AmbiencePicker />
      </header>
      <p className="learn-deck muted">{atlas.kind === "open" ? "Word Atlas 公開圖鑑" : atlas.name} · {atlas.count.toLocaleString()} 詞</p>
      <main className="learn-stage" key={`${session.id}-${session.index}-${step.kind}`}>
        {step.kind === "intro" ? <Intro step={step} guided={session.guided} /> : <Quiz step={step} session={session} />}
      </main>
    </div>
  );
}

function useStepTimer() {
  const t = useRef(performance.now());
  return () => (performance.now() - t.current) / 1000;
}

function Intro({ step, guided }: { step: Step; guided?: boolean }) {
  const atlas = useAtlas();
  const { entry, error } = useEntry(step.id);
  const settings = useStore((s) => s.settings);
  const elapsed = useStepTimer();
  useEffect(() => {
    if (entry && settings.autoplay) void play(atlas.audio(entry, settings.accent), entry.w, settings.accent, 1, atlas.wordFallbackAudio?.(entry));
  }, [entry, atlas, settings.autoplay, settings.accent]);
  const next = useCallback(() => {
    stopAudio();
    if (store.get().settings.sfx) void cue("flip");
    advance(elapsed());
  }, [elapsed]);
  useKeys(entry ? { Enter: next, " ": next } : {});
  if (error) return <EntryLoadError />;
  if (!entry) return <span className="spinner" />;
  const example = entry.ex[0];
  const phrase = splitPair(entry.col[0] ?? "");
  return (
    <div className="intro">
      <p className="stage-label">
        <span className="dot dot-new" /> {guided ? "認識新詞" : "初次見面"}
      </p>
      {guided ? (
        <article className="guided-intro">
          <h2 className="headword" lang="en">{entry.w}</h2>
          <Speak url={atlas.audio(entry, settings.accent)} fallbackUrl={atlas.wordFallbackAudio?.(entry)} text={entry.w} accent={settings.accent} label="單字" />
          <p className="guided-meaning"><span className="pos">{entry.senses[0].pos}</span> {entry.senses[0].zh}</p>
          {example && <div className="guided-example">
            <p lang="en"><Highlight text={example.en} word={entry.w} /></p>
            {example.zh && <p className="muted">{example.zh}</p>}
            {phrase.en && <p><small>常用搭配</small> <span lang="en">{phrase.en}</span> {phrase.zh}</p>}
          </div>}
        </article>
      ) : <EntryView entry={entry} mode="intro" />}
      <footer className="learn-actions">
        <button className="btn btn-primary btn-xl" onClick={next} autoFocus>
          認識了 <ArrowRight size={20} />
        </button>
        <span className="hint-keys">
          <kbd>Enter</kbd> 繼續
        </span>
      </footer>
    </div>
  );
}

const KIND_LABEL: Record<QuizKind, string> = {
  meaning: "它是什麼意思？",
  picture: "看圖，補全這句話",
  listen: "聽，是哪個詞？",
  spell: "拼出這個詞",
};

function EntryLoadError() {
  return <div role="alert">
    <p>暫時無法載入詞條。重新載入後可繼續這一輪。</p>
    <button className="btn btn-primary" onClick={() => window.location.reload()}>重新載入</button>
  </div>;
}

function Quiz({ step, session }: { step: Step & { kind: QuizKind }; session: ActiveSession }) {
  const atlas = useAtlas();
  const ref = atlas.byId.get(step.id)!;
  const { entry, error } = useEntry(step.id);
  const settings = useStore((s) => s.settings);
  const pending = session.pending;
  const elapsed = useStepTimer();
  const [hints, setHints] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const guided = session.guided;
  const chineseOptions = step.kind === "meaning" || (guided && step.kind === "listen");
  const options = useMemo(() => (step.options ?? []).map((id) => atlas.byId.get(id)!).filter(Boolean), [atlas, step.options]);

  const submit = useCallback(
    (value: string, correct: boolean) => {
      if (pending) return;
      const ms = elapsed() * 1000;
      if (correct) {
        const el = document.querySelector<HTMLElement>(step.kind === "spell" ? ".slots" : `[data-option="${value}"]`);
        const r = el?.getBoundingClientRect();
        if (r) burst(r.left + r.width / 2, r.top + r.height / 2);
      }
      if (settings.sfx) void cue(correct ? "correct" : "wrong");
      answer(atlas, step, correct, gradeFor(step.kind, correct, ms, hints > 0), value, hints > 0);
      if (entry && (!guided || settings.autoplay)) void play(atlas.audio(entry, settings.accent), entry.w, settings.accent, 1, atlas.wordFallbackAudio?.(entry));
    },
    [pending, elapsed, settings, atlas, step, hints, entry, guided],
  );

  const next = useCallback(() => {
    stopAudio();
    advance(elapsed());
  }, [elapsed]);

  const read = useCallback(async (rate = 1) => {
    if (!entry) return;
    setAudioError(false);
    const result = await play(atlas.audio(entry, settings.accent), entry.w, settings.accent, rate, atlas.wordFallbackAudio?.(entry));
    if (result === "unavailable") setAudioError(true);
  }, [atlas, entry, settings.accent]);

  useEffect(() => {
    if (step.kind === "listen" && entry && !pending) void read();
  }, [step.kind, entry, pending, read]);

  const keys: Record<string, () => void> = {};
  if (pending) {
    keys.Enter = next;
    keys[" "] = next;
  } else if (step.kind !== "spell") {
    options.forEach((o, i) => (keys[String(i + 1)] = () => submit(o.id, o.id === ref.id)));
  }
  useKeys(entry ? keys : {});

  if (error) return <EntryLoadError />;
  if (!entry) return <span className="spinner" />;
  const sentence = entry.ex[0] ? gap(entry.ex[0].en, entry.w) : null;

  return (
    <div className={`quiz quiz-${step.kind} ${pending ? (pending.correct ? "is-right" : "is-wrong") : ""}`}>
      <p className="stage-label">
        <span className={`dot ${step.retry ? "dot-retry" : "dot-review"}`} />
        {step.retry ? (guided ? "再試一次 · " : "再見一面 · ") : ""}
        {guided && step.kind === "listen" ? "聽發音，選出意思" : KIND_LABEL[step.kind]}
      </p>

      <section className="prompt">
        {step.kind === "meaning" && (
          <div className="prompt-word">
            <h2 className="headword" lang="en">
              {entry.w}
            </h2>
            <Speak url={atlas.audio(entry, settings.accent)} fallbackUrl={atlas.wordFallbackAudio?.(entry)} text={entry.w} accent={settings.accent} label={<span className="ipa">{settings.accent === "us" ? entry.us || entry.uk : entry.uk || entry.us}</span>} />
          </div>
        )}
        {step.kind === "picture" && (
          <div className="prompt-picture">
            <Illustration src={atlas.img(entry)} word={entry.w} topic={ref.topic} eager />
            <p className="cloze" lang="en">
              {sentence ? (
                <>
                  {sentence.before}
                  <span className="blank">{pending ? sentence.hidden : "　　　"}</span>
                  {sentence.after}
                </>
              ) : (
                entry.senses[0].zh
              )}
            </p>
            {sentence && pending && <p className="cloze-zh">{entry.ex[0].zh}</p>}
          </div>
        )}
        {step.kind === "listen" && (
          <div className="prompt-listen">
            <button className="listen-orb" onClick={() => void read()} aria-label="再聽一遍">
              <Volume2 size={40} strokeWidth={1.6} />
              <span />
            </button>
            <button className="link" onClick={() => void read(0.7)}>
              慢速再聽
            </button>
            {audioError && <p role="status" className="warn-text">{pronunciationError}</p>}
            {guided && !pending && audioError && <button className="btn btn-ghost" onClick={() => useTextQuestion(atlas, step)}>改做文字題</button>}
          </div>
        )}
        {step.kind === "spell" && (guided
          ? <p className="spell-zh">{entry.senses[0].zh}</p>
          : <SpellPrompt entry={entry} refw={ref} />)}
      </section>

      {step.kind === "spell" && guided ? (
        <GuidedSpelling entry={entry} pending={pending} hints={hints} onHint={() => setHints((level) => level + 1)} onSubmit={(v) => submit(v, normalize(v) === normalize(entry.w))} />
      ) : step.kind === "spell" ? (
        <SpellInput entry={entry} pending={pending} hints={hints} onHint={() => setHints((h) => Math.min(entry.w.length - 1, h + 1))} onSubmit={(v) => submit(v, normalize(v) === normalize(entry.w))} />
      ) : (
        <ul className={`options ${chineseOptions ? "options-zh" : "options-en"}`}>
          {options.map((o, i) => {
            const isAnswer = o.id === ref.id;
            const chosen = pending?.value === o.id;
            const cls = pending ? (isAnswer ? "is-answer" : chosen ? "is-chosen" : "is-dim") : "";
            return (
              <li key={o.id}>
                <button className={`option ${cls}`} data-option={o.id} onClick={() => submit(o.id, isAnswer)} disabled={!!pending}>
                  <kbd>{i + 1}</kbd>
                  <span lang={chineseOptions ? "zh-Hant" : "en"}>{chineseOptions ? o.zh : o.word}</span>
                  {pending && isAnswer && <Check size={20} className="option-mark" />}
                  {pending && chosen && !isAnswer && <X size={20} className="option-mark" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pending && <Feedback entry={entry} refw={ref} correct={pending.correct} assisted={guided && pending.hinted} guided={guided} onNext={next} />}
    </div>
  );
}

function SpellPrompt({ entry, refw }: { entry: Entry; refw: WordRef }) {
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  const sentence = entry.ex[0] ? gap(entry.ex[0].en, entry.w) : null;
  return (
    <div className="prompt-spell">
      <Illustration src={atlas.img(entry)} word={entry.w} topic={refw.topic} eager className="spell-art" />
      <div>
        <p className="spell-zh">
          <span className="pos">{entry.senses[0].pos}</span> {entry.senses[0].zh}
        </p>
        {sentence && (
          <p className="cloze cloze-sm" lang="en">
            {sentence.before}
            <span className="blank">　　　</span>
            {sentence.after}
          </p>
        )}
        <Speak url={atlas.audio(entry, accent)} fallbackUrl={atlas.wordFallbackAudio?.(entry)} text={entry.w} accent={accent} size="sm" label="聽發音" />
      </div>
    </div>
  );
}

function GuidedSpelling({ entry, pending, hints, onHint, onSubmit }: {
  entry: Entry; pending?: ActiveSession["pending"]; hints: number; onHint: () => void; onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const letters = Array.from(entry.w);
  const longer = Math.min(letters.length - 1, Math.max(2, Math.ceil(letters.length / 3)));
  const maxHints = longer > 1 ? 2 : letters.length > 1 ? 1 : 0;
  if (pending) {
    if (pending.correct || !pending.value) return null;
    return <div className="spelling-correction">
      <p>你的拼法 <span lang="en">{pending.value}</span></p>
      <p>正確拼法 <b lang="en">{letters.map((letter, i) => (
        normalize(pending.value[i] ?? "") === normalize(letter) ? letter : <mark key={i}>{letter}</mark>
      ))}</b></p>
    </div>;
  }
  return (
    <form className="guided-spelling" onSubmit={(event) => {
      event.preventDefault();
      if (value.trim()) onSubmit(value);
    }}>
      <label htmlFor="guided-spelling">輸入英文</label>
      <input id="guided-spelling" value={value} onChange={(event) => setValue(event.target.value)}
        autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done" maxLength={220} />
      {hints > 0 && <p className="guided-prefix" role="status">
        {hints === 1 ? "第一個字母" : "開首幾個字母"} <b lang="en">{letters.slice(0, hints === 1 ? 1 : longer).join("")}</b>
      </p>}
      <div className="spell-actions">
        {hints < maxHints && <button type="button" className="btn btn-ghost" onClick={onHint}>
          <Lightbulb size={17} /> {hints ? "再給一點提示" : "提示第一個字母"}
        </button>}
        <button type="button" className="btn btn-ghost" onClick={() => onSubmit("")}>想不起來</button>
        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>確認</button>
      </div>
    </form>
  );
}

function SpellInput({ entry, pending, hints, onHint, onSubmit }: { entry: Entry; pending?: { correct: boolean; value: string }; hints: number; onHint: () => void; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const target = entry.w;
  const prefix = target.slice(0, hints);
  useEffect(() => {
    if (hints && !normalize(value).startsWith(normalize(prefix))) setValue(prefix);
    input.current?.focus();
  }, [hints]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = pending ? pending.value : value;
  return (
    <form
      className="spell"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && value.trim()) onSubmit(value);
      }}
    >
      <div className="slots" aria-hidden="true" onClick={() => input.current?.focus()}>
        {Array.from(target).map((ch, i) => {
          const typed = shown[i];
          const ok = typed !== undefined && typed.toLowerCase() === ch.toLowerCase();
          return (
            <span key={i} className={`slot ${ch === " " ? "slot-space" : ""} ${typed !== undefined ? (pending ? (ok ? "is-ok" : "is-bad") : "is-filled") : ""} ${!pending && i === shown.length ? "is-caret" : ""}`}>
              {pending && !pending.correct ? ch : typed ?? ""}
            </span>
          );
        })}
      </div>
      <input
        ref={input}
        className="spell-input"
        value={shown}
        onChange={(e) => !pending && setValue(e.target.value.slice(0, target.length + 6))}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={`拼寫，${target.length} 個字符`}
        readOnly={!!pending}
      />
      {!pending && (
        <div className="spell-actions">
          <button type="button" className="btn btn-ghost" onClick={onHint} disabled={hints >= target.length - 1}>
            <Lightbulb size={17} /> 提示字母
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            確認 <kbd>Enter</kbd>
          </button>
        </div>
      )}
    </form>
  );
}

function Feedback({ entry, refw, correct, assisted, guided, onNext }: {
  entry: Entry; refw: WordRef; correct: boolean; assisted?: boolean; guided?: boolean; onNext: () => void;
}) {
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus({ preventScroll: true }), []);
  return (
    <div className={`feedback ${correct ? "is-right" : "is-wrong"}`} role="status">
      <div className="feedback-inner">
        <Illustration src={atlas.img(entry, "thumb")} word={entry.w} topic={refw.topic} className="feedback-art" />
        <div className="feedback-text">
          <p className="feedback-verdict">{correct ? (assisted ? "用提示答對" : "答對了") : "看看答案，稍後再試"}</p>
          <p className="feedback-word">
            <b lang="en">{entry.w}</b>
            <span className="ipa">{entry.uk || entry.us}</span>
            {guided && <Speak url={atlas.audio(entry, accent)} fallbackUrl={atlas.wordFallbackAudio?.(entry)} text={entry.w} accent={accent} size="sm" />}
          </p>
          <p className="feedback-zh">
            {entry.senses
              .slice(0, 2)
              .map((s) => `${s.pos} ${s.zh}`)
              .join("　")}
          </p>
          {entry.ex[0] && (
            <p className="feedback-ex" lang="en">
              <Highlight text={entry.ex[0].en} word={entry.w} />
            </p>
          )}
        </div>
        <button ref={btn} className={`btn btn-xl ${correct ? "btn-sage" : "btn-terra"}`} onClick={onNext}>
          繼續 <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

function Summary({ session }: { session: ActiveSession }) {
  const atlas = useAtlas();
  useEffect(() => {
    if (store.get().settings.sfx) void cue("complete");
  }, []);
  const stats = sessionStats(session);
  const words = [...new Set(session.steps.map((s) => s.id))].map((id) => atlas.byId.get(id)!).filter(Boolean);
  const wrong = words.filter((w) => session.graded[w.id] === Rating.Again);
  const { independent, assisted, missed } = guidedStats(session);
  const minutes = Math.max(1, Math.round(((session.finished ?? Date.now()) - session.started) / 60000));
  const done = () => {
    store.progress((p) => ({ ...p, session: null }));
    go({ page: "today" });
  };
  const again = () => {
    const { progress, settings } = store.get();
    store.progress((p) => ({ ...p, session: buildSession(atlas, progress, settings, { ids: wrong.map((w) => w.id) }) }));
  };
  if (session.guided) return (
    <div className="learn summary">
      <div className="summary-card">
        <h1 className="display">本輪練習完成</h1>
        <dl className="guided-results">
          <div><dt>獨立答對</dt><dd>{independent} 題</dd></div>
          <div><dt>用提示答對</dt><dd>{assisted} 題</dd></div>
          <div><dt>首次未答對</dt><dd>{missed} 題</dd></div>
        </dl>
        {assisted + missed > 0 && <>
          <h2 className="eyebrow">可再練的詞</h2>
          <ul className="guided-recap-words">
            {words.map((word) => {
              const skills = (["meaning", "listen", "spell"] as const)
                .filter((kind) => {
                  const result = session.outcomes?.[word.id]?.[kind];
                  return result && result !== "independent";
                }).map((kind) => ({ meaning: "詞義", listen: "聽辨", spell: "拼寫" })[kind]);
              return skills.length > 0 && <li key={word.id}><b lang="en">{word.word}</b> <span>{skills.join("、")}</span></li>;
            })}
          </ul>
        </>}
        <div className="summary-actions">
          {assisted + missed > 0 && <button className="btn btn-ghost" onClick={() => {
            const recap = guidedRecap(atlas, session);
            if (recap.steps.length) store.progress((p) => ({ ...p, session: recap }));
          }}><RotateCcw size={18} /> 再練這些題</button>}
          <button className="btn btn-ghost" onClick={() => shareSession(atlas, session)}><Share2 size={18} /> 分享成績卡</button>
          <button className="btn btn-primary btn-xl" onClick={done}>完成本輪 <ArrowRight size={20} /></button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="learn summary">
      <div className="summary-card">
        <div className="summary-sky">
          <Galaxy mode="mini" highlight={words.map((w) => w.id)} ignite />
          <p>今天點亮了 {words.length} 顆星</p>
        </div>
        <p className="eyebrow">這一程結束了</p>
        <h1 className="display">{stats.accuracy >= 90 ? "漂亮的一程。" : stats.accuracy >= 60 ? "穩穩向前。" : "錯過的，會再相遇。"}</h1>
        <div className="summary-stats">
          <Ring value={stats.accuracy / 100} size={128} tone={stats.accuracy >= 60 ? "sage" : "terra"}>
            <b>{stats.accuracy}%</b>
            <small>首次正確</small>
          </Ring>
          <dl>
            <div>
              <dt>新詞</dt>
              <dd>{session.newIds.length}</dd>
            </div>
            <div>
              <dt>複習</dt>
              <dd>{session.reviewIds.length}</dd>
            </div>
            <div>
              <dt>用時</dt>
              <dd>
                {minutes}
                <small>分鐘</small>
              </dd>
            </div>
          </dl>
        </div>
        <ul className="summary-words">
          {words.map((w) => (
            <li key={w.id} className={session.graded[w.id] === Rating.Again ? "is-wrong" : ""}>
              <Illustration src={atlas.img(w, "thumb")} word={w.word} topic={w.topic} />
              <span lang="en">{w.word}</span>
              <small>{w.zh}</small>
            </li>
          ))}
        </ul>
        <p className="summary-note">FSRS 已爲每個詞排好下次相遇的時間。答錯的詞，會更早回來。</p>
        <div className="summary-actions">
          {wrong.length > 0 && (
            <button className="btn btn-ghost" onClick={again}>
              <RotateCcw size={18} /> 再練 {wrong.length} 個錯詞
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => shareSession(atlas, session)}>
            <Share2 size={18} /> 分享成績卡
          </button>
          <button className="btn btn-primary btn-xl" onClick={done} ref={(b) => b?.focus({ preventScroll: true })}>
            完成 <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Page-level shortcuts that ignore typing in inputs (except Enter, which forms handle). */
export function useKeys(map: Record<string, () => void>) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      if (typing && !(e.key === "Enter" && (t as HTMLInputElement).readOnly)) return;
      if (t.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}
