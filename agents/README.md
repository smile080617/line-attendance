# agents/ — 三 harness 共用制度（單一正本 + 薄索引）

這是使用者跨 Claude Code／Codex CLI／Hermes Agent 共用的判斷力制度。
架構：`institution/` 是**唯一正本**；各 harness 的指令檔只是指向它的薄索引。
建立於 2026-07-04（雲端 session）。本 repo（line-attendance）只是宿主，
制度與打卡系統互不依賴。

## 目錄

```
institution/   正本：core.md（常載）＋ 六個分冊 ＋ lessons.md（教訓簿）
adapters/      使用者層索引範本（裝到本機 ~/.claude、~/.codex 用）與 Hermes 備註
verify.sh      防漂移檢查
```

repo 根目錄的 `CLAUDE.md` 與 `AGENTS.md` 是「repo 層」薄索引，
在本 repo 內開 session 時由各 harness 自動載入。

## 本機安裝（一次性；可整段貼給任何中階模型照做）

前提：使用者本機**沒有**既有 `~/.agents/` 結構（2026-07-04 確認），全新建立。

```bash
# 1. 取得正本（本 repo 任一份最新 clone 即可）
git clone https://github.com/smile080617/line-attendance ~/src/line-attendance  # 已有就 git pull
# 若 clone 失敗：repo 可能是私有的，先確認本機已設定 GitHub SSH key 或 token，再重試

# 2. 建 symlink：讓三個 harness 用同一路徑找到正本
mkdir -p ~/.agents
ln -s ~/src/line-attendance/agents/institution ~/.agents/institution

# 3. 裝使用者層索引（先備份既有檔！）
[ -f ~/.claude/CLAUDE.md ] && cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.bak-$(date +%F)
cp ~/src/line-attendance/agents/adapters/user-level-claude.md ~/.claude/CLAUDE.md

mkdir -p ~/.codex
[ -f ~/.codex/AGENTS.md ] && cp ~/.codex/AGENTS.md ~/.codex/AGENTS.md.bak-$(date +%F)
cp ~/src/line-attendance/agents/adapters/user-level-codex-agents.md ~/.codex/AGENTS.md

# 4. Hermes：機制未確認，見 adapters/hermes-notes.md 的填寫指引

# 5. 驗證
bash ~/src/line-attendance/agents/verify.sh
```

裝完後執行 `institution/05-maintenance.md` 的「首次遷移清單」，
把本機既有記憶（雲端建制時看不到）合併進正本。

## 日常同步

- 教訓與制度更新都走 git：改 → commit → push；其他機器／harness 開工先 pull。
- 每月跑一次 `verify.sh` ＋ 05 的記憶搬運。

## 長期：搬到專用 repo（建議，非必須）

制度是使用者級資產，不該永遠住在打卡系統裡。搬法：
1. 開新私有 repo（例如 `smile080617/agents`）。
2. `git mv agents/` 的內容過去（或直接複製整個 `agents/` 目錄後在原 repo 刪除）。
3. 更新本機 symlink 指向新 repo；repo 層索引檔（各專案的 CLAUDE.md／AGENTS.md）
   裡的 `agents/institution/...` 路徑改為 `~/.agents/institution/...`。
4. 跑 `verify.sh` 確認路由沒斷。
