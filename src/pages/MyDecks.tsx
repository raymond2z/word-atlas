import { Download, FileUp, Plus, Trash2, BookOpen } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { customCatalog, importVocabulary, type PersonalWord } from "../custom/catalog";
import { exportPersonalBackup, installPersonalBackup, MAX_BACKUP_BYTES, parsePersonalBackup } from "../custom/backup";
import { go } from "../lib/router";
import { store, useStore } from "../store/store";

type Draft = {
  word: string; zh: string; pos: string; cefr: string; topic: string;
  example: string; exampleZh: string; imageUrl: string; audioUkUrl: string; audioUsUrl: string;
};
const emptyDraft = (): Draft => ({
  word: "", zh: "", pos: "", cefr: "B1", topic: "custom",
  example: "", exampleZh: "", imageUrl: "", audioUkUrl: "", audioUsUrl: "",
});
function saveText(name: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const idSafe = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "my-deck";

export function MyDecks() {
  const catalog = useSyncExternalStore(customCatalog.subscribe, customCatalog.getSnapshot, customCatalog.getSnapshot);
  const [manageId, setManageId] = useState("");
  const deck = catalog.decks.find((d) => d.id === manageId) ?? catalog.decks.find((d) => d.id === catalog.activeId) ?? catalog.decks[0];
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);
  const input = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const activeSession = useStore((s) => s.progress.session);
  const busy = catalog.activeId === deck?.id && !!activeSession && !activeSession.finished;

  const safe = (fn: () => void) => {
    try { setProblem(""); fn(); }
    catch (e) { setProblem(e instanceof Error ? e.message : "操作失敗。"); }
  };
  const create = () => safe(() => {
    const id = customCatalog.create(newName);
    setNewName(""); setManageId(id); setMessage("已建立詞庫。現在可以新增或匯入單字。");
  });
  const select = () => safe(() => {
    if (!deck) return;
    customCatalog.select(deck.id);
    store.settings({ onboarded: true });
    setMessage("已切換到「" + deck.name + "」。原本公開詞庫的記憶紀錄不會受到影響。");
    go({ page: "today" });
  });
  const upload = async (f: File) => {
    if (!deck) return;
    setProblem("");
    setMessage("");
    try {
      if (f.size > 4 * 1024 * 1024) throw new Error("檔案超過 4 MB，請分批匯入。");
      const parsed = importVocabulary(await f.text(), f.name);
      if (!parsed.words.length) throw new Error("未找到可用的英文與中文資料，請檢查檔案格式。");
      const report = customCatalog.merge(deck.id, parsed.words);
      setMessage("成功新增 " + report.added + " 筆，原有 " + report.existing +
        " 筆、檔內重複 " + parsed.duplicates + " 筆、缺資料略過 " + parsed.skipped + " 筆。");
    } catch (e) { setProblem(e instanceof Error ? e.message : "檔案匯入失敗。"); }
  };
  const restore = async (file: File) => {
    setProblem("");
    setMessage("");
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("備份檔案超過 10 MB。");
      let data: unknown;
      try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
      catch { throw new Error("備份檔案必須是有效的 JSON。"); }
      const plan = parsePersonalBackup(data);
      if (!plan) throw new Error("這個檔案沒有學習紀錄。純詞庫請使用「匯入 CSV / JSON」。");
      installPersonalBackup(plan);
      setManageId(plan.decks[0].deck.id);
      setEditing(null);
      setQuery("");
      setLimit(60);
      const cards = plan.decks.reduce((total, { progress }) => total + Object.keys(progress.cards).length, 0);
      const replayed = plan.legacy ? "，重播 " + plan.reviews + " 次舊版複習" : "";
      const skipped = plan.skippedRecords ? "，略過 " + plan.skippedRecords + " 筆無法對應的紀錄" : "";
      setMessage(`已還原 ${plan.decks.length} 個詞庫副本和 ${cards} 張 FSRS 詞卡${replayed}${skipped}。`);
    } catch (e) { setProblem(e instanceof Error ? e.message : "備份還原失敗。"); }
  };
  const startEdit = (w?: PersonalWord) => {
    setEditing(w?.id ?? "new");
    setDraft(w ? {
      word: w.word, zh: w.zh, pos: w.pos, cefr: w.cefr, topic: w.topic,
      example: w.example, exampleZh: w.exampleZh,
      imageUrl: w.imageUrl ?? "", audioUkUrl: w.audioUkUrl ?? "", audioUsUrl: w.audioUsUrl ?? "",
    } : emptyDraft());
  };
  const update = (field: keyof Draft, value: string) => setDraft((v) => ({ ...v, [field]: value }));
  const saveWord = () => safe(() => {
    if (!deck) return;
    customCatalog.put(deck.id, { ...deck.words.find((word) => word.id === editing), ...draft });
    setEditing(null);
    setMessage("單字已儲存。");
  });
  const erase = (w: PersonalWord) => safe(() => {
    if (!deck || !confirm("確定從詞庫移除「" + w.word + "」？")) return;
    customCatalog.deleteWord(deck.id, w.id);
    if (editing === w.id) setEditing(null);
  });
  const filtered = deck?.words.filter((w) =>
    (w.word + " " + w.zh + " " + w.topic).toLowerCase().includes(query.toLowerCase().trim())) ?? [];

  return <div className="page my-decks">
    <header className="page-head">
      <h1 className="display">我的詞庫</h1>
      <p className="lede">用自己的英文單字和片語進行 FSRS 複習，並在星圖查看學習進度。</p>
    </header>

    <section className="panel" style={{ marginBottom: 20 }}>
      <h2>目前使用的詞庫</h2>
      <p className="muted">{catalog.activeId
        ? (catalog.decks.find((d) => d.id === catalog.activeId)?.name ?? "自訂詞庫")
        : "Word Atlas 公開圖鑑（原版 7,298 字）"}</p>
      <button className="btn btn-ghost" onClick={() => safe(() => { customCatalog.select(null); go({ page: "today" }); })}>
        <BookOpen size={17}/> 返回公開圖鑑
      </button>
    </section>

    <section className="panel" style={{ marginBottom: 20 }}>
      <h2>建立詞庫</h2>
      <div className="my-deck-row">
        <input aria-label="新詞庫名稱" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="例如 IELTS Academic / STEM English" maxLength={80}/>
        <button className="btn btn-primary" onClick={create}><Plus size={17}/> 建立</button>
        <button className="btn btn-ghost" onClick={() => backupInput.current?.click()}><FileUp size={17}/> 還原學習備份</button>
        <input ref={backupInput} hidden type="file" aria-label="學習備份 JSON" accept=".json,application/json" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void restore(file);
          e.target.value = "";
        }}/>
      </div>
      <div className="my-deck-list">
        {catalog.decks.map((d) => <button key={d.id} className={"chip-btn " + (deck?.id === d.id ? "is-on" : "")}
          onClick={() => { setManageId(d.id); setEditing(null); setQuery(""); setLimit(60); }}>
          {d.name} · {d.words.length} 字{catalog.activeId === d.id ? " · 使用中" : ""}
        </button>)}
      </div>
    </section>

    {message && <p role="status" className="panel" style={{ borderColor: "#71a78b" }}>{message}</p>}
    {problem && <p role="alert" className="panel warn-text">{problem}</p>}
    {deck && <section className="panel" style={{ marginBottom: 20 }}>
      <h2>編輯：{deck.name}</h2>
      {busy && <p className="warn-text">這個詞庫有未完成的學習流程。請先完成或暫停學習，再刪除或匯入內容。</p>}
      <div className="my-deck-row">
        <button className="btn btn-primary" disabled={!deck.words.length} onClick={select}>使用此詞庫開始學習</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}><FileUp size={17}/> 匯入 CSV / JSON</button>
        <button className="btn btn-ghost" onClick={() =>
          saveText(idSafe(deck.name) + ".json", JSON.stringify({ app: "my-word-atlas-custom-deck", version: 1, name: deck.name, words: deck.words }, null, 2), "application/json")}>
          <Download size={17}/> 匯出詞庫 JSON
        </button>
        <button className="btn btn-ghost" disabled={!deck.words.length} onClick={() =>
          saveText(idSafe(deck.name) + "-backup.json", exportPersonalBackup(deck), "application/json")}>
          <Download size={17}/> 備份詞庫與進度
        </button>
        <button className="btn btn-ghost" onClick={() => startEdit()}><Plus size={17}/> 新增單字</button>
        <input ref={input} hidden type="file" aria-label="詞庫 CSV 或 JSON" accept=".csv,.json,text/csv,application/json" onChange={(e) => {
          const file = e.target.files?.[0]; if (file) void upload(file);
          e.target.value = "";
        }}/>
      </div>
      <p className="muted">支援 Google 翻譯 CSV、含 word/zh 欄位的 CSV 和 Word Atlas JSON。已有的英文詞條會跳過。</p>
      <label className="my-deck-search">搜尋詞條
        <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(60); }} placeholder="英文、中文或主題"/>
      </label>
      <div className="my-deck-words">
        {filtered.slice(0, limit).map((w) => <div key={w.id} className="my-deck-word">
          <span><strong lang="en">{w.word}</strong> <small>{w.pos} · {w.cefr} · {w.zh}</small></span>
          <span>
            <button className="btn btn-ghost" onClick={() => startEdit(w)}>編輯</button>
            <button className="icon-btn" disabled={busy} onClick={() => erase(w)} aria-label={"刪除 " + w.word}><Trash2 size={16}/></button>
          </span>
        </div>)}
        {filtered.length > limit && <button className="btn btn-ghost" onClick={() => setLimit((n) => n + 60)}>載入更多（{limit} / {filtered.length}）</button>}
        {!!deck.words.length && !filtered.length && <p className="muted">沒有符合的詞條。</p>}
        {!deck.words.length && <p className="muted">此詞庫還沒有單字。可匯入 CSV、JSON，或先建立第一張單字卡。</p>}
      </div>
    </section>}

    {editing && deck && <section className="panel my-deck-editor" style={{ marginBottom: 20 }}>
      <h2>{editing === "new" ? "新增單字" : "編輯單字"}</h2>
      <p className="muted">詞性和例句是選填的，沒有錄音檔也能使用瀏覽器英文語音。</p>
      <div className="my-deck-fields">
        <label>英文 *<input value={draft.word} disabled={editing !== "new"} onChange={(e) => update("word", e.target.value)} /></label>
        <label>中文 *<input value={draft.zh} onChange={(e) => update("zh", e.target.value)} /></label>
        <label>詞性<input value={draft.pos} onChange={(e) => update("pos", e.target.value)} placeholder="adj. / n. / v." /></label>
        <label>CEFR<select value={draft.cefr} onChange={(e) => update("cefr", e.target.value)}>
          {["A1","A2","B1","B2","C1","C2"].map((x) => <option key={x}>{x}</option>)}
        </select></label>
        <label>主題<input value={draft.topic} onChange={(e) => update("topic", e.target.value)} /></label>
        <label>英文例句<input value={draft.example} onChange={(e) => update("example", e.target.value)} /></label>
        <label>例句中文<input value={draft.exampleZh} onChange={(e) => update("exampleZh", e.target.value)} /></label>
        <label>圖片網址（HTTPS）<input value={draft.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} /></label>
        <label>英式錄音網址（HTTPS）<input value={draft.audioUkUrl} onChange={(e) => update("audioUkUrl", e.target.value)} /></label>
        <label>美式錄音網址（HTTPS）<input value={draft.audioUsUrl} onChange={(e) => update("audioUsUrl", e.target.value)} /></label>
      </div>
      <div className="my-deck-row">
        <button className="btn btn-primary" onClick={saveWord}>儲存單字</button>
        <button className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
      </div>
    </section>}

    <section className="panel"><h2>備份與換裝置</h2>
      <p className="muted">學習資料保存在這個瀏覽器。換裝置前，下載「備份詞庫與進度」，再用「還原學習備份」建立副本。也可用同一按鈕匯入 V1.4.1 備份，系統會按原來的複習日期與評分重算 FSRS 排程。</p>
    </section>
  </div>;
}
