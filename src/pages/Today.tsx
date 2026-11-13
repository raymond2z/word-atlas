import { ArrowRight, BookOpen, Flame, Keyboard, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { prefetch, useAtlas, useEntry } from "../atlas/context";
import { go, openWord } from "../lib/router";
import { cue } from "../lib/sound";
import { hashSeed } from "../lib/text";
import { buildGuidedSession, guidedPlan, masteredCount } from "../store/session";
import { isMastered } from "../store/srs";
import { dayKey, store, useStore } from "../store/store";
import { Galaxy } from "../galaxy/Galaxy";
import { Highlight, Pronounce } from "../ui/EntryView";
import { Illustration } from "../ui/Illustration";
import { Ring } from "../ui/Ring";

const BRAND = `${import.meta.env.BASE_URL}brand`;

function greeting(h: number) {
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function streakOf(days: Record<string, { r: number }>) {
  let n = 0;
  const d = new Date();
  if (!(days[dayKey(d)]?.r > 0)) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)]?.r > 0) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function Today() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const [minutes, setMinutes] = useState<5 | 10>(5);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const plan = useMemo(() => guidedPlan(atlas, progress, settings, minutes, undefined, clock), [atlas, progress, settings, minutes, clock]);
  // Warm the first cards of today's journey so the session opens instantly.
  const firstIds = [...plan.review.slice(0, 4).map(({ id }) => id), ...plan.fresh].join(",");
  useEffect(() => {
    const ids = firstIds.split(",").filter(Boolean);
    const t = window.setTimeout(() => void prefetch(atlas, ids), 800);
    return () => window.clearTimeout(t);
  }, [atlas, firstIds]);
  const now = new Date();
  const today = progress.days[dayKey()];
  const streak = streakOf(progress.days);
  const active = progress.session && !progress.session.finished ? progress.session : null;
  const total = plan.review.length + plan.fresh.length;
  const goal = settings.dailyNew + Math.min(plan.due.length, 60);
  const doneToday = today?.r ?? 0;

  const start = (extra?: number) => {
    if (!active) {
      const current = store.get();
      const s = buildGuidedSession(atlas, current.progress, current.settings, minutes, extra);
      if (!s.steps.length) return;
      store.progress((p) => ({ ...p, session: s }));
    }
    if (settings.sfx) void cue("start");
    go({ page: "learn" });
  };

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const k = dayKey(d);
    return { k, label: "日一二三四五六"[d.getDay()], v: progress.days[k]?.r ?? 0, today: i === 6 };
  });

  const learned = Object.keys(progress.cards).length;
  const mastered = masteredCount(progress);
  const unseen = atlas.words.some((word) => !progress.cards[word.id]);

  return (
    <div className="page today">
      <header className="greet">
        <p className="eyebrow">
          {now.getMonth() + 1}月{now.getDate()}日 · 星期{"日一二三四五六"[now.getDay()]}
        </p>
        <h1 className="display">{greeting(now.getHours())}，探索者。</h1>
        <div className="active-deck">
          <BookOpen size={18} aria-hidden="true" />
          <span>目前詞庫 <b>{atlas.kind === "open" ? "Word Atlas 公開圖鑑" : atlas.name}</b> · {atlas.count.toLocaleString()} 詞</span>
          <a className="link" href="#/decks">切換詞庫</a>
        </div>
      </header>

      <section className={`journey ${total === 0 && !active ? "is-clear" : ""}`}>
        <img className="journey-art" src={`${BRAND}/hero.webp`} alt="" fetchPriority="high" />
        <div className="journey-body">
          {active ? (
            <>
              <p className="eyebrow eyebrow-light">練習進行中</p>
              <h2>
                還剩 <b>{active.steps.length - active.index}</b> 步
              </h2>
              <p className="journey-lede">進度已儲存，隨時接着走。</p>
            </>
          ) : total > 0 ? (
            <>
              <p className="eyebrow eyebrow-light">今日練習</p>
              <h2>
                複習 <b>{plan.review.length}</b> 詞 <i>·</i> 新詞 <b>{plan.fresh.length}</b> 詞
              </h2>
              <p className="journey-lede">
                {plan.due.length > plan.review.length
                  ? `本輪先練最早到期的詞，還有 ${plan.due.length - plan.review.length} 個到期詞可稍後複習。`
                  : "先複習到期詞，再認識新詞。"}
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow eyebrow-light">今日練習</p>
              <h2>目前沒有待練的詞</h2>
              <p className="journey-lede">稍後再查看到期詞，也可以加練一輪。</p>
            </>
          )}
          {!active && total > 0 && (
            <div className="daily-duration" role="group" aria-label="預計練習時間">
              {([5, 10] as const).map((duration) => (
                <button key={duration} className="btn btn-glass" aria-pressed={minutes === duration} onClick={() => setMinutes(duration)}>
                  約 {duration} 分鐘
                </button>
              ))}
            </div>
          )}
          <div className="journey-actions">
            {active || total > 0 ? (
              <button className="btn btn-primary btn-xl" onClick={() => start()}>
                {active ? "繼續今日練習" : "開始今日練習"} <ArrowRight size={20} />
              </button>
            ) : unseen ? (
              <button className="btn btn-primary btn-xl" onClick={() => start(3)}>
                加練新詞 <Sparkles size={18} />
              </button>
            ) : null}
            {!active && total === 0 && (
              <button className="btn btn-glass" onClick={() => go({ page: "practice" })}>
                <Keyboard size={18} /> 打字練習
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="today-grid">
        <WordOfDay />

        <section className="panel streak-panel">
          <div className="panel-head">
            <h3 className="eyebrow">這一週</h3>
            <span className={`streak ${streak ? "is-on" : ""}`}>
              <Flame size={16} /> 連續 {streak} 天
            </span>
          </div>
          <div className="streak-body">
            <Ring value={goal ? doneToday / goal : 0} size={112} stroke={8} tone="terra">
              <b>{doneToday}</b>
              <small>今日答題</small>
            </Ring>
            <ol className="week">
              {week.map((d) => (
                <li key={d.k} className={`${d.v ? "is-on" : ""} ${d.today ? "is-today" : ""}`} title={`${d.k}：${d.v} 題`}>
                  <span style={{ "--h": Math.min(1, d.v / 40) } as React.CSSProperties} />
                  <small>{d.label}</small>
                </li>
              ))}
            </ol>
          </div>
          <dl className="mini-stats">
            <div>
              <dt>已點亮</dt>
              <dd>{learned.toLocaleString()}</dd>
            </div>
            <div>
              <dt>已掌握</dt>
              <dd>{mastered.toLocaleString()}</dd>
            </div>
            <div>
              <dt>全部詞彙</dt>
              <dd>{atlas.count.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <LevelPath />
        <GalaxyPanel learned={learned} total={atlas.count} />
        <Topics />
      </div>
    </div>
  );
}

function GalaxyPanel({ learned, total }: { learned: number; total: number }) {
  const today = useStore((s) => s.progress.days[dayKey()]);
  const ids = useStore((s) => s.progress.cards);
  const todayIds = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Object.entries(ids)
      .filter(([, c]) => c.seen >= start.getTime())
      .map(([id]) => id);
  }, [ids]);
  void today;
  return (
    <section className="galaxy-panel" onClick={() => go({ page: "atlas", view: "galaxy" })} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go({ page: "atlas", view: "galaxy" })}>
      <Galaxy mode="mini" highlight={todayIds} />
      <div className="galaxy-panel-copy">
        <p className="eyebrow eyebrow-light">你的詞彙星圖</p>
        <h3>
          已點亮 <b>{learned.toLocaleString()}</b> 顆星
        </h3>
        <p>{learned ? `還有 ${(total - learned).toLocaleString()} 顆在等你。金色是今天新點亮的。` : `${total.toLocaleString()} 個詞是 ${total.toLocaleString()} 顆星。學會一個，就點亮一顆。`}</p>
        <span className="btn btn-glass">
          進入星圖 <ArrowRight size={18} />
        </span>
      </div>
    </section>
  );
}

function WordOfDay() {
  const atlas = useAtlas();
  const pick = useMemo(() => {
    const pool = atlas.words.filter((w) => w.cefr >= 2 && w.media & 1);
    const list = pool.length ? pool : atlas.words;
    return list[hashSeed(dayKey()) % list.length];
  }, [atlas]);
  const { entry } = useEntry(pick?.id);
  if (!pick) return null;
  return (
    <section className="panel wotd" onClick={() => openWord(pick.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openWord(pick.id)} aria-label={`今日一詞：${pick.word}`}>
      <Illustration src={atlas.img(pick)} word={pick.word} topic={pick.topic} className="wotd-art" />
      <div className="wotd-body">
        <h3 className="eyebrow">今日一詞</h3>
        <p className="wotd-word" lang="en">
          {pick.word}
        </p>
        {entry && (
          <div onClick={(e) => e.stopPropagation()}>
            <Pronounce entry={entry} refw={pick} />
          </div>
        )}
        <p className="wotd-zh">{pick.zh}</p>
        {entry?.ex[0] && (
          <p className="wotd-ex" lang="en">
            <Highlight text={entry.ex[0].en} word={entry.w} />
          </p>
        )}
      </div>
    </section>
  );
}

function LevelPath() {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  const start = useStore((s) => s.settings.startLevel);
  const levels = useMemo(() => {
    const out = atlas.cefr.map((name) => ({ name, total: 0, seen: 0, mastered: 0 }));
    for (const w of atlas.words) {
      const l = out[w.cefr];
      l.total++;
      const c = cards[w.id];
      if (c) {
        l.seen++;
        if (isMastered(c)) l.mastered++;
      }
    }
    return out;
  }, [atlas, cards]);
  const NAMES = ["入門", "基礎", "進階", "中高", "高級", "精通"];
  return (
    <section className="panel path-panel">
      <div className="panel-head">
        <h3 className="eyebrow">學習路線 · 從 A1 到 C2</h3>
        <span className="legend">
          <i className="lg-seen" /> 已學 <i className="lg-done" /> 已掌握
        </span>
      </div>
      <ol className="route">
        {levels.map((l, i) => {
          const seen = l.seen / Math.max(1, l.total);
          const done = l.mastered / Math.max(1, l.total);
          return (
            <li key={l.name} className={`${i === start ? "is-start" : ""} ${l.seen ? "is-on" : ""}`}>
              <button onClick={() => go({ page: "atlas", level: l.name })} aria-label={`${l.name} ${NAMES[i]}，已學 ${l.seen} / ${l.total}`}>
                <span className="station" style={{ "--seen": seen, "--done": done } as React.CSSProperties}>
                  <b>{l.name}</b>
                </span>
                <span className="station-name">{NAMES[i]}</span>
                <span className="station-count">
                  {l.seen}
                  <small>/{l.total}</small>
                </span>
                {i === start && <span className="station-flag">起點</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Topics() {
  const atlas = useAtlas();
  const counts = useMemo(() => {
    const c = new Array(atlas.topics.length).fill(0);
    atlas.words.forEach((w) => c[w.topic]++);
    return c;
  }, [atlas]);
  return (
    <section className="topics-panel">
      <div className="panel-head">
        <h3 className="eyebrow">按雅思話題探索</h3>
        <button className="link" onClick={() => go({ page: "atlas" })}>
          打開圖鑑
        </button>
      </div>
      <ul className="topic-tiles">
        {atlas.topics.map(([key, name], i) => (
          <li key={key}>
            <button onClick={() => go({ page: "atlas", topic: key })}>
              <img src={`${BRAND}/topic-${key}.webp`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              <span>
                <b>{name}</b>
                <small>{counts[i]} 個詞</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
