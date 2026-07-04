# ~/.claude/CLAUDE.md — 薄索引（Claude Code 使用者層）
# 由 agents/adapters/user-level-claude.md 範本安裝；改動前讀正本 05 的權限表。

**本檔只做路由，不放規則。** 唯一正本：`~/.agents/institution/`。

## 常載核心（先讀這個）

@~/.agents/institution/core.md

## 路由速查

- 用哪個模型／升降級 → `~/.agents/institution/02-model-dispatch.md`
- 派工範本 → `~/.agents/institution/04-task-templates.md`
- 完成定義／何時問人 → `~/.agents/institution/03-judgment-rubrics.md`
- 踩雷回寫 → `~/.agents/institution/05-maintenance.md` → `lessons.md`

## Claude Code 專屬機制

- 派便宜 subagent：Agent 工具；唯讀掃描 Explore＋`model: haiku`，
  要寫檔的交辦 general-purpose＋`model: sonnet`。
- 模型與 effort：`/model`（haiku／sonnet／opus）、`/effort`（low～max）。
- auto-memory 只當快取，通用教訓搬回正本 lessons.md（規則見 05）。
- 長對話會被壓縮：決策與「檔案:行號」隨做隨寫進任務卡檔案。

## 防漂移

本檔上限 150 行；新規則一律寫正本。月檢：`bash ~/.agents/institution/../verify.sh`
（即正本所在 repo 的 `agents/verify.sh`）。
