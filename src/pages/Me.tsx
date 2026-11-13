import { Download, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { useAtlas } from "../atlas/context";
import { isMastered } from "../store/srs";
import { nextSkillReview, SKILL_LABELS } from "../store/session";
import { dayKey, resetProgress, REVIEW_SKILLS, store, useStore, type Settings } from "../store/store";
import { toast } from "../ui/Toast";
import { streakOf } from "./Today";

export function Me({ privateAvailable }: { privateAvailable: boolean }) {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const saveError = useStore((s) => s.saveError);

  const stats = useMemo(() => {
    const cards = Object.values(progress.cards);
    const days = Object.values(progress.days);
    const r = days.reduce((n, d) => n + d.r, 0);
    const c = days.reduce((n, d) => n + d.c, 0);
    const t = days.reduce((n, d) => n + d.t, 0);
    const nextDates = Object.keys(progress.cards)
      .filter((id) => atlas.byId.has(id))
      .map((id) => nextSkillReview(progress, id, settings.spell)!.due);
    const skills = REVIEW_SKILLS.map((kind) => {
      const entries = Object.entries(progress.skills).flatMap(([id, results]) =>
        atlas.byId.has(id) && results[kind] ? [results[kind]] : []);
      const independent = entries.filter((skill) => skill.outcome === "independent").length;
      return { kind, independent, total: entries.length };
    });
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() + i);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      return nextDates.filter((due) => (i === 0 ? due <= end.getTime() : due >= start.getTime() && due <= end.getTime())).length;
    });
    return { learned: cards.length, mastered: cards.filter(isMastered).length, reviews: r, accuracy: r ? Math.round((c / r) * 100) : 0, minutes: Math.round(t / 60), forecast, skills };
  }, [progress, atlas, settings.spell]);

  const set = (patch: Partial<Settings>) => store.settings(patch);
  const maxF = Math.max(1, ...stats.forecast);

  return (
    <div className="page me">
      <header className="page-head">
        <p className="eyebrow">我的</p>
        <h1 className="display">你的星空</h1>
      </header>

      <section className="stat-strip">
        <div>
          <dt>連續學習</dt>
          <dd>
            {streakOf(progress.days)}
            <small>天</small>
          </dd>
        </div>
        <div>
          <dt>已點亮</dt>
          <dd>{stats.learned.toLocaleString()}</dd>
        </div>
        <div>
          <dt>長期記住</dt>
          <dd>{stats.mastered.toLocaleString()}</dd>
        </div>
        <div>
          <dt>首次正確率</dt>
          <dd>
            {stats.accuracy}
            <small>%</small>
          </dd>
        </div>
        <div>
          <dt>學習時長</dt>
          <dd>
            {stats.minutes}
            <small>分鐘</small>
          </dd>
        </div>
      </section>

      <div className="me-grid">
        <section className="panel">
          <h3 className="eyebrow">分項學習紀錄</h3>
          <dl className="skill-history">
            {stats.skills.map(({ kind, independent, total }) => (
              <div key={kind}>
                <dt>{SKILL_LABELS[kind]}</dt>
                <dd>{total ? `${independent}／${total} 詞` : "尚未練習"}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">顯示上次獨立答對的詞數及該項已練習的詞數。</p>
        </section>
        <section className="panel">
          <h3 className="eyebrow">過去 20 周</h3>
          <Heatmap days={progress.days} />
          <p className="muted">一格是一天，顏色越深，那天答得越多。「長期記住」指記憶穩定度超過 21 天。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">未來 7 天的複習量</h3>
          <ol className="forecast">
            {stats.forecast.map((n, i) => (
              <li key={i}>
                <span style={{ height: `${(n / maxF) * 100}%` }} />
                <b>{n}</b>
                <small>{i === 0 ? "今天" : i === 1 ? "明天" : `+${i}`}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel settings">
          <h3 className="eyebrow">學習設置</h3>
          <Field label="每日新詞" hint="每輪先安排到期複習，再按練習時間加入新詞。">
            <div className="segmented">
              {[5, 10, 15, 20, 30].map((n) => (
                <button key={n} className={settings.dailyNew === n ? "is-on" : ""} onClick={() => set({ dailyNew: n })}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="從哪個難度開始" hint="跳過已經熟悉的低級別詞。">
            <div className="segmented">
              {atlas.cefr.map((l, i) => (
                <button key={l} className={settings.startLevel === i ? "is-on" : ""} onClick={() => set({ startLevel: i })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="目標記憶率" hint="越高複習越頻繁。90% 是大多數人的甜點。">
            <div className="segmented">
              {[0.85, 0.9, 0.95].map((n) => (
                <button key={n} className={settings.retention === n ? "is-on" : ""} onClick={() => set({ retention: n })}>
                  {Math.round(n * 100)}%
                </button>
              ))}
            </div>
          </Field>
          <Field label="發音">
            <div className="segmented">
              <button className={settings.accent === "uk" ? "is-on" : ""} onClick={() => set({ accent: "uk" })}>
                英式
              </button>
              <button className={settings.accent === "us" ? "is-on" : ""} onClick={() => set({ accent: "us" })}>
                美式
              </button>
            </div>
          </Field>
          <Field label="外觀">
            <div className="segmented">
              {(
                [
                  ["system", "跟隨系統"],
                  ["light", "淺色"],
                  ["dark", "深色"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={settings.theme === k ? "is-on" : ""} onClick={() => set({ theme: k })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Toggle label="自動播放發音" on={settings.autoplay} set={(v) => set({ autoplay: v })} />
          <Toggle label="介面音效" on={settings.sfx} set={(v) => set({ sfx: v })} />
          <Toggle label="開屏動畫（每天一次）" on={settings.splash} set={(v) => set({ splash: v })} />
          <Toggle label="複習時加入拼寫題" on={settings.spell} set={(v) => set({ spell: v })} />
          {privateAvailable && (
            <Field label="詞庫" hint="私人詞庫只在本機開發伺服器中可用，不會被打包發佈。">
              <div className="segmented">
                <button className={settings.dataset === "open" ? "is-on" : ""} onClick={() => set({ dataset: "open" })}>
                  開放圖鑑
                </button>
                <button className={settings.dataset === "private" ? "is-on" : ""} onClick={() => set({ dataset: "private" })}>
                  私人 8000
                </button>
              </div>
            </Field>
          )}
        </section>

        <section className="panel">
          <h3 className="eyebrow">資料</h3>
          <p className="muted">進度只存在這臺裝置的瀏覽器裏：沒有帳號，沒有伺服器。換裝置時，匯出備份再匯入即可。</p>
          {saveError && <p className="warn-text">瀏覽器拒絕儲存（可能是隱私模式或空間已滿）。請儘快匯出備份。</p>}
          <div className="data-actions">
            <a className="btn btn-ghost" href="#/backup">
              <Download size={18} /> 備份與還原
            </a>
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => {
                if (confirm("確定清空這個詞庫的全部學習記錄？此操作無法撤銷，建議先匯出備份。")) {
                  resetProgress();
                  toast("學習記錄已清空");
                }
              }}
            >
              <RotateCcw size={18} /> 清空記錄
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <b>{label}</b>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

function Heatmap({ days }: { days: Record<string, { r: number }> }) {
  const weeks = 20;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay());
  const cells: { k: string; v: number; future: boolean }[] = [];
  const d = new Date(start);
  for (let i = 0; i < (weeks + 1) * 7; i++) {
    const k = dayKey(d);
    cells.push({ k, v: days[k]?.r ?? 0, future: d > end });
    d.setDate(d.getDate() + 1);
  }
  const lvl = (v: number) => (v === 0 ? 0 : v < 10 ? 1 : v < 25 ? 2 : v < 50 ? 3 : 4);
  return (
    <div className="heatmap" role="img" aria-label="學習熱力圖">
      {cells.map((c) => (
        <span key={c.k} className={`h${c.future ? "x" : lvl(c.v)}`} title={`${c.k} · ${c.v} 題`} />
      ))}
    </div>
  );
}
