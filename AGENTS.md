# AGENTS.md — 薄索引（Codex CLI 與 Hermes Agent 共用；兩者都會自動讀本檔）

**本檔只做路由，不放規則。** 所有通用規則的唯一正本在 `agents/institution/`。
在本檔新增任何行為規則＝漂移，一律改寫進正本（權限見 `agents/institution/05-maintenance.md`）。

## 開工第一步（必做）

先讀 `agents/institution/core.md`（約 80 行，含十條非談判規則與完整路由表）。
沒讀 core.md 不要開始多步驟任務。

## 路由速查

- 用哪個模型／升降級 → `agents/institution/02-model-dispatch.md`
- 派工範本（搜尋／實作／重構／研究／審查） → `agents/institution/04-task-templates.md`
- 完成定義／何時問使用者 → `agents/institution/03-judgment-rubrics.md`
- 踩雷回寫格式 → `agents/institution/05-maintenance.md` → `lessons.md`

## Codex CLI 專屬機制

- 交辦時**一律在命令列顯式指定模型**（`codex --model gpt-5.5` 等），
  不要依賴 `~/.codex/config.toml` 的預設（已知會被上次 session 狀態覆蓋）。
- subagent 不會自動出現，要明說：「Spawn a subagent using gpt-5.4-mini to …」。
  或另開低成本 session：`codex --model gpt-5.4-mini "＜交辦包全文＞"`。
- effort 調整：config `model_reasoning_effort`、session 內 Alt+, / Alt+.。
- Memories 若有啟用（`~/.codex/memory/`，路徑未經官方證實）只當快取，
  通用教訓搬回正本 lessons.md（規則見 05）。

## Hermes Agent 專屬機制（暫定，身分未經使用者確認）

- 暫定為 Nous Research `hermes-agent`（會自動注入本檔與 SOUL.md／MEMORY.md）。
  若你是 Hermes 上的 session 且發現與實際不符：停，照 `agents/adapters/hermes-notes.md`
  的填寫指引修正本區塊（這是索引檔少數允許的修改，仍需先問使用者）。
- 模型三檔位待使用者用 `hermes model` 確認後回填 `02-model-dispatch.md`。
- `MEMORY.md`／`USER.md` 只當快取，通用教訓搬回正本 lessons.md。
- 平行機制：`hermes kanban`／`hermes chat --worktree`／`hermes profile`。

## 專案專屬區（line-attendance）

- LINE 打卡系統：Node.js（Express）＋ `@line/bot-sdk` ＋ Supabase；入口 `index.js`，
  前端 `index.html`。無測試、無 lint——改動後最低驗證 `node --check index.js`，
  回報中明寫「未實測」。
- 秘密都在環境變數（dotenv），不得寫死、不得印出。
- `agents/` 目錄是跨專案共用制度的宿主，與打卡系統無關，不要動它。

## 防漂移

本檔上限 150 行。改本檔前先讀 05 的權限表；月檢跑 `bash agents/verify.sh`。
