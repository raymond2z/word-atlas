import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAtlas } from "../atlas/context";
import { store } from "../store/store";

const LEVELS = [
  ["A2", "基礎", "日常詞還不太穩"],
  ["B1", "進階", "目標 5.5 – 6 分"],
  ["B2", "中高", "目標 6.5 – 7 分"],
  ["C1", "高級", "衝刺 7.5 分以上"],
];

export function Onboarding() {
  const atlas = useAtlas();
  const [level, setLevel] = useState(1);
  const [goal, setGoal] = useState(10);
  const finish = () => store.settings({ onboarded: true, startLevel: atlas.cefr.indexOf(LEVELS[level][0]), dailyNew: goal });
  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="歡迎">
      <div className="onboard-card">
        <img className="onboard-art" src={`${import.meta.env.BASE_URL}brand/hero.webp`} alt="" />
        <div className="onboard-body">
          <p className="eyebrow">歡迎來到詞光</p>
          <h1 className="display">
            {atlas.count.toLocaleString()} 顆星，
            <br />
            等你一顆顆點亮。
          </h1>
          <fieldset>
            <legend>你從哪裏出發？</legend>
            <div className="choice-grid">
              {LEVELS.map(([code, name, desc], i) => (
                <button key={code} className={`choice ${level === i ? "is-on" : ""}`} onClick={() => setLevel(i)} aria-pressed={level === i}>
                  <span className={`chip chip-level lv-${code}`}>{code}</span>
                  <b>{name}</b>
                  <small>{desc}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>每天點亮幾顆新星？</legend>
            <div className="segmented segmented-wide">
              {[5, 10, 15, 20].map((n) => (
                <button key={n} className={goal === n ? "is-on" : ""} onClick={() => setGoal(n)} aria-pressed={goal === n}>
                  {n} 顆{n === 10 ? " · 推薦" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary btn-xl" onClick={finish}>
            出發 <ArrowRight size={20} />
          </button>
          <p className="muted">不用註冊。進度只留在這臺裝置上，隨時可以在「我的」裏修改。</p>
        </div>
      </div>
    </div>
  );
}
