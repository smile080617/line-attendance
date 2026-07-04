# ~/.codex/AGENTS.md — 薄索引（Codex CLI 使用者層）
# 由 agents/adapters/user-level-codex-agents.md 範本安裝；改動前讀正本 05 的權限表。

**本檔只做路由，不放規則。** 唯一正本：`~/.agents/institution/`。

## 開工第一步（必做）

先讀 `~/.agents/institution/core.md`（常載核心：十條非談判規則＋完整路由表）。
沒讀 core.md 不要開始多步驟任務。
（此強制句是 Codex 的強制閘門，Claude 端由 `@import` 取代；維護時勿為統一而刪。）

## 路由速查

- 用哪個模型／升降級 → `~/.agents/institution/02-model-dispatch.md`
- 派工範本 → `~/.agents/institution/04-task-templates.md`
- 完成定義／何時問使用者 → `~/.agents/institution/03-judgment-rubrics.md`
- 踩雷回寫 → `~/.agents/institution/05-maintenance.md` → `lessons.md`

## Codex CLI 專屬機制

- 交辦一律命令列顯式指定模型（`codex --model …`），不依賴 config.toml 預設
  （已知會被上次 session 狀態覆蓋）。
- subagent 要明說才會出現：「Spawn a subagent using gpt-5.4-mini to …」；
  或另開低成本 session：`codex --model gpt-5.4-mini "＜交辦包＞"`。
- Memories 路徑（若啟用）：`~/.codex/memory/`（未經官方證實）；
  定位與搬運規則見 core 規則 7 與 05。

## 防漂移

本檔上限 150 行；新規則一律寫正本。月檢跑正本 repo 的 `agents/verify.sh`。
