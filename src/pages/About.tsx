import { ArrowUpRight, Database, Github, Heart } from "lucide-react";
import { useAtlas } from "../atlas/context";
import { REPO_URL } from "../config";

const BASE = import.meta.env.BASE_URL;

export function About() {
  const atlas = useAtlas();
  return (
    <div className="page about">
      <header className="about-hero">
        <img src={`${BASE}brand/og.webp`} alt="" />
        <div>
          <p className="eyebrow">關於詞光</p>
          <h1 className="display">一詞一畫，點亮雅思。</h1>
          <p className="lede">
            詞光把雅思閱讀 8000 詞整理成 {atlas.count.toLocaleString()} 個詞條。每個詞一幅原創插畫，一句日常例句，一句雅思例句，配英美髮音、常用搭配和易混提示。學會一個，就在你的星圖上點亮一顆星。
          </p>
          <p className="lede">它免費、開源、無需註冊。代碼用 MIT，詞庫用 CC BY 4.0，誰都可以拿去用。</p>
          <div className="about-actions">
            <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
              <Github size={18} /> 在 GitHub 上查看
            </a>
            <a className="btn btn-ghost" href={`${REPO_URL}/tree/main/data`} target="_blank" rel="noreferrer">
              <Database size={18} /> 下載詞庫 JSON / CSV
            </a>
          </div>
        </div>
      </header>

      <div className="about-grid">
        <section className="panel">
          <h3 className="eyebrow">爲什麼記得住</h3>
          <ul className="feature-list">
            <li>
              <b>先看見。</b>每個詞都有一幅畫，畫的就是第一句例句裏發生的事。
            </li>
            <li>
              <b>再想起。</b>選義、看圖補句、聽音辨詞、拼寫，從認得走到會寫。
            </li>
            <li>
              <b>剛好在快忘時重逢。</b>FSRS 是新版 Anki 用的開源記憶算法，只在你快要遺忘時安排複習。
            </li>
            <li>
              <b>分數誠實。</b>只算第一次作答。答錯的詞會換個題型再見一面，但不會抬高正確率。
            </li>
            <li>
              <b>進度只屬於你。</b>沒有帳號，沒有伺服器，資料存在你的瀏覽器裏，隨時能匯出。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">快捷鍵</h3>
          <dl className="keys">
            <div>
              <dt>
                <kbd>⌘</kbd>
                <kbd>K</kbd> 或 <kbd>/</kbd>
              </dt>
              <dd>搜索任何詞</dd>
            </div>
            <div>
              <dt>
                <kbd>1</kbd>–<kbd>4</kbd>
              </dt>
              <dd>選擇答案</dd>
            </div>
            <div>
              <dt>
                <kbd>Enter</kbd>
              </dt>
              <dd>確認 / 繼續</dd>
            </div>
            <div>
              <dt>
                <kbd>←</kbd> <kbd>→</kbd>
              </dt>
              <dd>詞卡里切換上一個、下一個</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>關閉彈窗</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h3 className="eyebrow">內容從哪裏來</h3>
          <p className="muted">
            釋義、例句、搭配和提示由大語言模型按統一的詞典規範重新撰寫；插畫由圖像模型按統一畫風逐詞繪製；發音和朗讀由 ElevenLabs 合成（英音 Alice，美音 Sarah）。所有內容都經過結構和一致性的自動校驗，但沒有逐條人工審校。看到錯的地方，歡迎在 GitHub 提 Issue，或者直接改資料提 PR。
          </p>
          <p className="muted">詞光不是官方雅思詞表，也不承諾提分。它只想把背單字這件事，做得好看一點、紮實一點。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">給開發者</h3>
          <p className="muted">
            <code>data/word-atlas.json</code> 和 <code>.csv</code> 是完整詞庫；<code>public/atlas</code> 裏是網頁用的分塊資料、插畫和音頻。拿去做 Anki 牌組、背詞小程序、瀏覽器插件，或者 AI 應用的評測集，署名即可。
          </p>
          <a className="link" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            閱讀文檔 <ArrowUpRight size={14} />
          </a>
        </section>
      </div>
      <p className="colophon">
        <Heart size={14} /> 做給每一個在背單字的人。
      </p>
    </div>
  );
}
