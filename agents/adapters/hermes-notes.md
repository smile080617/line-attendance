# Hermes Agent 備註與填寫指引（身分未確認）

狀態（2026-07-04）：使用者在建制時被問「Hermes Agent 是哪個」，選了「其他」但未填
名稱。以下暫定資料指向查證到的最可能候選；**第一個在 Hermes 上執行的 session
必須先核對身分**，不符就照文末指引重寫。

## 暫定候選：Nous Research `hermes-agent`（查證於 2026-07-04）

來源為 GitHub repo 的 docs 檔（官方站對查證工具回 403，未能直接交叉核對）：

- 指令檔：自動注入 `AGENTS.md`、`SOUL.md`、`.cursorrules` 類檔案
  （`hermes setup --ignore-rules` 可停用）。→ 因此 repo 層的 `AGENTS.md` 薄索引
  對它同時生效，不需要第三份索引檔。
- 設定：`config.yaml`（`hermes config show|edit|path`）。
- 記憶：內建 `MEMORY.md`／`USER.md`；可外接 provider（Honcho／Mem0／Hindsight）。
  制度規則：未確認前不啟用外部 provider；內建記憶只當快取，教訓搬回正本。
- 模型選擇：`hermes model`（精靈）、`/model`（`--global` 持久化）、
  單次 `hermes -m <model> --provider <p>`；`hermes fallback` 管理備援鏈。
- 平行機制：`hermes kanban`（多工派發）、`hermes project`、`hermes chat --worktree`、
  `hermes profile`。
- effort 等級參數：未確認是否存在。

## 若實際的 Hermes 是別的東西：填寫指引（給中階模型照做）

1. 問使用者或用 `--help` 查證四件事：
   (a) 指令檔的實際檔名與載入位置；(b) 記憶機制的檔名／路徑；
   (c) 可用模型清單與便宜／中階／頂級三檔位；(d) 有無 subagent 或平行機制。
2. 依查證結果改三處（都先備份、先問使用者）：
   - 本檔：換掉「暫定候選」整段。
   - repo 根 `AGENTS.md` 的「Hermes 專屬機制」區塊——若它的指令檔不是 AGENTS.md，
     刪除該區塊，另建它專用的薄索引檔（抄 `user-level-codex-agents.md` 的骨架，
     只換專屬機制段）。
   - 正本 `02-model-dispatch.md` 的 Hermes 欄：回填三檔位與指定方式。
3. 查不到的項目寫「待使用者填寫」，不編造。
