# 05 · 維護協議（含跨 harness 同步）

目的：讓這套制度在三個 harness、多台機器、以弱模型日常運作的情況下，
不漂移、不長肥、不失真。

## 檔案權限表（弱模型動手前先查這張表）

| 檔案 | 弱模型可自行改？ | 規則 |
|---|---|---|
| `lessons.md` | ✅ 只能 append | 照下方格式追加；不得改寫或刪除既有條目 |
| `02-model-dispatch.md` 的型號表 | ✅ 限更新過期值 | 發現型號已不存在時，查證後更新該格，並在 lessons.md 記一筆；不得改守則本文 |
| `01/03/04` 及 `02`（型號表以外）各分冊本文 | ❌ 先問使用者 | 提出修改建議＋理由，等使用者同意 |
| `agents/README.md`、`verify.sh`、`adapters/*`、本檔（05） | ❌ 先問使用者 | 例外：verify.sh 有可重現的 bug 時，查證後可修，並在 lessons.md 記一筆 |
| `core.md` | ❌ 先問使用者 | 常載核心，改動影響所有 session |
| 三個索引檔（CLAUDE.md / AGENTS.md 等） | ❌ 先問使用者 | 唯一例外：路由指到的正本路徑變了，可修路徑本身 |
| `06-letter.md` | ✅ 可在文末追加交接段 | 標注日期與 session 來源 |
| 使用者專案的原始碼 | 依該任務授權 | 與本制度無關，照任務卡 |

改任何「先問使用者」的檔案前：先備份（`cp X X.bak-<日期>` 或確認 git 乾淨可回滾）。

## 教訓回寫（lessons.md 格式）

一條教訓 = 4 行，append 到 `lessons.md` 末尾：

```
## <YYYY-MM-DD，填當天日期> · claude|codex|hermes · <一句話標題>
症狀：<發生了什麼>
根因：<為什麼>
規則：<一行可執行的預防規則，寫給下一個弱模型>
```

觸發時機：同一個坑第 2 次踩到、或第一次踩但重工成本超過 30 分鐘，就必須寫。
精簡時機：lessons.md 超過 300 行或 40 條 → 派中階模型做一次整併：
去重、把已成熟的規則升格進對應分冊（要先問使用者）、把過時條目移到
`lessons-archive.md`。整併本身也要記一條 lesson。

## 跨 harness 記憶回寫（防止再度漂移的關鍵）

規則：**三個 harness 自己的記憶機制只當快取，正本永遠是 `agents/institution/`。**

- Claude Code：auto memory（`~/.claude/projects/<專案>/memory/MEMORY.md`）會自己累積。
  每月一次（或發現裡面有通用教訓時）：把值得留的條目按上面格式搬進 lessons.md，
  然後在 MEMORY.md 該條目後標 `[已入正本]`。
- Codex CLI：若啟用 Memories（`~/.codex/memory/`，路徑未經官方文件證實），同樣搬運。
  session transcript（`~/.codex/sessions/`）不搬，只在需要失敗軌跡時引用。
- Hermes（暫定）：`MEMORY.md`／`USER.md` 同樣搬運；未確認前先不啟用其外部記憶 provider。
- 同步機制就是 git：教訓寫進 lessons.md → commit + push；每台機器、每個 harness
  的 session 開工先 `git pull` 正本 repo。不建立第二種同步管道。

## 索引檔防漂移檢查

每月一次、或任何 session 改過指令檔後，執行 `agents/verify.sh`（或手動照下列清單）：

1. 每個索引檔 ≤150 行。
2. 每個索引檔都含有指向 `agents/institution/core.md` 的路由行。
3. 索引檔中不得出現規則正文（判定法：出現「必須／禁止／一律」開頭的通用行為規則，
   且該規則已存在或應存在於正本 → 判為漂移，把它移回正本，索引只留一行指標）。
4. 正本 core.md ＋ 六個分冊（01–06）＋ lessons.md，共八個檔，都存在且非空。
5. 使用者層索引（`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、Hermes 指令檔）與
   `agents/adapters/` 內的範本比對：路由行還在、沒長出重複規則。

## 首次遷移清單（在使用者本機執行一次；派中階模型照做）

這個制度誕生於雲端容器，看不到使用者本機的既有記憶。回到本機後：

1. 蒐集：`~/.claude/CLAUDE.md`、各專案 CLAUDE.md、`~/.claude/projects/*/memory/MEMORY.md`、
   `~/.codex/AGENTS.md`、各專案 AGENTS.md、`~/.codex/memory/`（若有）、
   Hermes 的指令與記憶檔（待使用者指出）。
2. 全部備份到 `~/agents-migration-backup-<日期>/`。
3. 逐檔分類：通用規則→提案併入正本對應分冊（列清單給使用者裁決，不自行合併）；
   專案專屬→留在該專案索引檔的專屬區；過時→列入待刪清單給使用者確認。
4. 兩邊規則矛盾時：不裁決，列成「A 說 X、B 說 Y」清單交使用者。
5. 完成後把使用者層索引檔換成 `agents/adapters/` 的範本（先備份原檔）。
