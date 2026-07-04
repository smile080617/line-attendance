# CLAUDE.md — 薄索引（Claude Code 專用）

**本檔只做路由，不放規則。** 所有通用規則的唯一正本在 `agents/institution/`。
在本檔新增任何行為規則＝漂移，一律改寫進正本（權限見 `agents/institution/05-maintenance.md`）。

## 常載核心（先讀這個）

@agents/institution/core.md

## 路由

core.md 內有完整路由表。速查：
- 用哪個模型／升降級 → `agents/institution/02-model-dispatch.md`
- 派工範本 → `agents/institution/04-task-templates.md`
- 完成定義／何時問人 → `agents/institution/03-judgment-rubrics.md`
- 踩雷回寫 → `agents/institution/05-maintenance.md` → `lessons.md`

## Claude Code 專屬機制（只在本 harness 有效的操作方式）

- 派便宜 subagent：用 Agent 工具，唯讀掃描用 Explore＋`model: haiku`；
  要寫檔的交辦用 general-purpose＋`model: sonnet`。範本全文放進 prompt。
- 本 session 模型：`/model` 或 `--model`（`haiku`／`sonnet`／`opus`；特例 `fable`，
  完整表見 02）；effort：`/effort`（low／medium／high／xhigh／max）。
- auto-memory 路徑：`~/.claude/projects/<專案>/memory/`；
  定位與搬運規則見 core 規則 7 與 05。
- 長對話會被自動壓縮：重要決策與「檔案:行號」隨做隨寫進任務卡檔案。

## 專案專屬區（line-attendance）

- LINE 打卡系統：Node.js（Express）＋ `@line/bot-sdk` ＋ Supabase；入口 `index.js`，
  前端 `index.html`。無測試、無 lint——改動後的最低驗證：`node --check index.js`
  ＋在回報中明寫「未實測」。
- 秘密都在環境變數（dotenv），不得寫死、不得印出。
- `agents/` 目錄是跨專案共用制度的宿主，與打卡系統無關，部署與重構都不要動它。

## 防漂移

本檔上限 150 行。改本檔前先讀 `agents/institution/05-maintenance.md` 的權限表；
月檢跑 `bash agents/verify.sh`。
