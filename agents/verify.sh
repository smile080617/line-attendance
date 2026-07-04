#!/usr/bin/env bash
# 防漂移檢查：索引檔行數上限、路由指標存在、正本檔齊全。
# 用法：bash agents/verify.sh   （在正本所在 repo 的根目錄或任意處執行皆可）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INST="$ROOT/agents/institution"
fail=0
err() { echo "FAIL: $1"; fail=1; }
ok()  { echo "ok:   $1"; }

# 1. 正本檔齊全且非空
for f in core.md 01-diagnosis.md 02-model-dispatch.md 03-judgment-rubrics.md \
         04-task-templates.md 05-maintenance.md 06-letter.md lessons.md; do
  if [ -s "$INST/$f" ]; then ok "institution/$f 存在且非空"; else err "institution/$f 缺少或為空"; fi
done

# 2. 索引檔（repo 層 + 使用者層若存在）：行數 ≤150、含指向 core.md 的路由行
check_index() {
  local file="$1"
  [ -f "$file" ] || { echo "skip: $file 不存在（未安裝則屬正常）"; return; }
  local lines; lines=$(wc -l < "$file")
  if [ "$lines" -le 150 ]; then ok "$file 行數 $lines ≤150"; else err "$file 行數 $lines 超過 150（漂移徵兆）"; fi
  if grep -q "institution/core\.md" "$file"; then ok "$file 含 core.md 路由行"; else err "$file 沒有指向 core.md 的路由行"; fi
}
check_index "$ROOT/CLAUDE.md"
check_index "$ROOT/AGENTS.md"
check_index "$HOME/.claude/CLAUDE.md"
check_index "$HOME/.codex/AGENTS.md"

# 3. core.md 常載上限
core_lines=$(wc -l < "$INST/core.md")
if [ "$core_lines" -le 150 ]; then ok "core.md 行數 $core_lines ≤150"; else err "core.md 行數 $core_lines 超過 150"; fi

# 4. lessons.md 精簡門檻提醒（非失敗）
lessons_lines=$(wc -l < "$INST/lessons.md")
[ "$lessons_lines" -gt 300 ] && echo "WARN: lessons.md 已 $lessons_lines 行（>300），依 05 觸發精簡"

# 5. 本機 symlink（若已安裝）
if [ -L "$HOME/.agents/institution" ]; then
  target=$(readlink "$HOME/.agents/institution")
  ok "~/.agents/institution → $target"
elif [ -e "$HOME/.agents/institution" ]; then
  err "~/.agents/institution 存在但不是 symlink（可能出現第二份正本）"
else
  echo "skip: ~/.agents/institution 未安裝（雲端容器屬正常）"
fi

if [ "$fail" -eq 0 ]; then echo "== 全部通過 =="; else echo "== 有失敗項，照 05 維護協議處理 =="; exit 1; fi
