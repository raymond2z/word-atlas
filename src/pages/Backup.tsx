import { Download, FileUp } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { useAtlas } from "../atlas/context";
import { exportPersonalBackup, installPersonalBackup, MAX_BACKUP_BYTES, parsePersonalBackup } from "../custom/backup";
import { customCatalog, customDatasetId, object } from "../custom/catalog";
import { go } from "../lib/router";
import { dayKey, exportBackup, importBackup, store } from "../store/store";

const backupTimeKey = (dataset: string) => "my-word-atlas:last-backup:" + dataset;

function readBackupTime(dataset: string) {
  try { return Number(localStorage.getItem(backupTimeKey(dataset))) || 0; }
  catch { return 0; }
}

export function Backup({ deckId }: { deckId?: string }) {
  const atlas = useAtlas();
  const catalog = useSyncExternalStore(customCatalog.subscribe, customCatalog.getSnapshot, customCatalog.getSnapshot);
  const deck = catalog.decks.find((item) => item.id === (deckId ?? catalog.activeId));
  const target = deck ? customDatasetId(deck.id) : atlas.id;
  const targetName = deck?.name ?? (atlas.kind === "open" ? "Word Atlas 公開圖鑑" : atlas.name);
  const file = useRef<HTMLInputElement>(null);
  const [lastDownload, setLastDownload] = useState<{ target: string; at: number }>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [restoredId, setRestoredId] = useState<string>();
  const last = lastDownload?.target === target ? lastDownload.at : readBackupTime(target);

  const download = () => {
    setError("");
    const contents = deck ? exportPersonalBackup(deck) : exportBackup();
    const blob = new Blob([contents], { type: "application/json" });
    if (blob.size > MAX_BACKUP_BYTES) {
      setError("這份備份超過 10 MB，請先縮小詞庫再備份。");
      return;
    }
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `word-atlas-${deck ? "personal" : "progress"}-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    const at = Date.now();
    setLastDownload({ target, at });
    try { localStorage.setItem(backupTimeKey(target), String(at)); }
    catch { /* The download can still succeed when browser storage is unavailable. */ }
    setMessage("已啟動備份下載。");
  };

  const restore = async (source: File) => {
    setBusy(true);
    setError("");
    setMessage("");
    setRestoredId(undefined);
    try {
      if (source.size > MAX_BACKUP_BYTES) throw new Error("備份檔案超過 10 MB。");
      const contents = (await source.text()).replace(/^\uFEFF/, "");
      let data: unknown;
      try { data = JSON.parse(contents); }
      catch { throw new Error("備份檔案必須是有效的 JSON。"); }
      const plan = parsePersonalBackup(data);
      if (plan) {
        installPersonalBackup(plan);
        if (restoreSettings && plan.settings) store.settings({ ...plan.settings, onboarded: true });
        setRestoredId(plan.decks[0].deck.id);
        const cards = plan.decks.reduce((total, { progress }) => total + Object.keys(progress.cards).length, 0);
        const replayed = plan.legacy ? `，重算 ${plan.reviews} 次舊版複習` : "";
        const skipped = plan.skippedRecords ? `，略過 ${plan.skippedRecords} 筆無法對應的紀錄` : "";
        setMessage(`已還原 ${plan.decks.length} 個詞庫副本和 ${cards} 張 FSRS 詞卡${replayed}${skipped}。`);
        return;
      }
      if (object(data) && data.app === "word-atlas" && data.version === 2 && object(data.progress)) {
        if (data.progress.datasetId !== atlas.id) throw new Error("請先切換至備份對應的詞庫，再還原這份進度。");
        if (!confirm(`還原這份進度備份會覆蓋「${atlas.name}」現有的學習進度及設定。確定還原？`)) return;
        const result = importBackup(contents);
        if (!result.ok) throw new Error(result.error);
        setMessage(`已還原 ${result.cards} 張 FSRS 詞卡。`);
        return;
      }
      throw new Error("找不到學習備份資料。若檔案只含單字，請到「我的詞庫」使用「匯入 CSV / JSON」。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "備份還原失敗。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page backup-page">
      <header className="page-head">
        <h1 className="display">備份與還原</h1>
        <p className="lede">換裝置前，先把詞庫和學習進度下載成備份。</p>
      </header>
      <div className="backup-grid">
        <section className="panel">
          <h2>{deck ? "完整備份" : "學習進度備份"}</h2>
          <p><b>{targetName}</b> · {(deck?.words.length ?? atlas.count).toLocaleString()} 詞</p>
          <p className="muted">{deck ? "包含此詞庫的詞條、FSRS 複習排程、收藏、錯詞和學習設定。" : "包含此詞庫的 FSRS 複習排程、收藏、錯詞和學習設定。詞庫內容由網站提供。"}</p>
          <p className="muted">上次下載備份 {last ? new Date(last).toLocaleString("zh-MO") : "尚無紀錄"}</p>
          <div className="my-deck-row">
            <button className="btn btn-primary" onClick={download} disabled={busy || deck?.words.length === 0}>
              <Download size={17} /> {deck ? "備份詞庫與進度" : "備份學習進度"}
            </button>
            <a className="btn btn-ghost" href="#/decks">管理詞庫</a>
          </div>
        </section>
        <section className="panel">
          <h2>還原學習備份</h2>
          <p className="muted">個人詞庫會還原為獨立副本。也支援 V1.4.1 備份。</p>
          <label className="backup-option">
            <input type="checkbox" checked={restoreSettings} disabled={busy} onChange={(event) => setRestoreSettings(event.target.checked)} />
            同時套用個人詞庫備份內的設定
          </label>
          <button className="btn btn-ghost" onClick={() => file.current?.click()} disabled={busy}>
            <FileUp size={17} /> {busy ? "正在還原…" : "選擇備份檔案"}
          </button>
          <input ref={file} hidden type="file" aria-label="學習備份 JSON" accept=".json,application/json" onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (selected) void restore(selected);
          }} />
          {message && <p role="status">{message}</p>}
          {error && <p role="alert" className="warn-text">{error}</p>}
          {restoredId && <button className="btn btn-primary" onClick={() => {
            try {
              customCatalog.select(restoredId);
              store.settings({ onboarded: true });
              go({ page: "today" });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "無法切換詞庫。");
            }
          }}>使用還原的詞庫</button>}
        </section>
      </div>
    </div>
  );
}
