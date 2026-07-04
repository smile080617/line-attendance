# 02 · 模型調度守則

原則：**指揮官不下場**。主線（較貴的模型與 context）只花在「換便宜模型就掉品質」的
判斷上：拆解任務、寫交辦包、裁決衝突、審結論。搬運型工作（掃檔、批次改、跑驗證、
查資料）一律下放便宜檔位。預設檔位＝**平衡**（使用者 2026-07-04 選定）：中階當主線，
便宜檔跑批次，卡關才升頂級。

## 三檔位表（查證基準日 2026-07-04；型號會過期，以各平台當下 /model 清單為準）

| | Claude Code | Codex CLI | Hermes Agent（暫定） |
|---|---|---|---|
| 便宜／批次 | `haiku`（Haiku 4.5，ID `claude-haiku-4-5-20251001`） | `gpt-5.4-mini`（官方建議的 subagent 用模型；effort 只到 high） | 待使用者填寫 |
| 中階／主線預設 | `sonnet`（Sonnet 5，ID `claude-sonnet-5`） | `gpt-5.5` + `model_reasoning_effort="medium"` | 待使用者填寫 |
| 頂級／升級用 | `opus`（Opus 4.8，ID `claude-opus-4-8`）；特例才用 `fable` | `gpt-5.5` + effort `high` 或 `xhigh` | 待使用者填寫 |
| effort 參數值 | `low/medium/high/xhigh/max`（Sonnet 5 / Opus 4.8 / Fable 5） | GPT-5.5：`none/low/medium/high/xhigh`；mini：`minimal/low/medium/high` | 未確認 |
| 顯式指定方式 | `/model`、`--model`、subagent frontmatter `model:`、Agent 呼叫的 model 參數 | `codex --model <id>`、session 內 `/model`、`~/.codex/config.toml` 的 `model=` | ⚠未確認：`hermes -m <model> --provider <p>`、`/model`（`--global` 持久化） |
| subagent／平行 | 原生：`.claude/agents/*.md` 可設 `model: haiku` 等 | 有，但**只在明確要求時**生成：交辦句要寫「spawn a subagent using gpt-5.4-mini to …」 | ⚠未確認：`hermes kanban`／`hermes chat --worktree`／`hermes profile` |

查證備註（弱模型別自行推翻，也別照抄過期值）：
- Codex：GPT-5.2-Codex／GPT-5.3-Codex 自 2026-06 起淘汰中，不要再指定。
  已知問題：config.toml 的 model 設定可能被上次 session 狀態蓋掉——**交辦時一律在
  命令列顯式帶 `--model`**，不要依賴 config 預設。
- Hermes：多供應商、無固定階梯；上表三檔位待使用者用 `hermes model` 確認後回填本表。
  Hermes 身分本身尚未由使用者確認（暫定 Nous Research `hermes-agent`）。
- 安全路由：Claude 端部分請求會被自動導到 Opus 4.8；它是否消耗同一額度池
  **未確認**，建議到 claude.ai 的 usage 頁實測。不要把制度價值綁在特定型號上。

## 任務交辦三要素（缺一不發包；完整範本見 04）

1. **目標與動機**：做什麼、為什麼（一句動機讓執行者能自行處理邊角案例）。
2. **驗收條件**：可機械判定的清單（命令＋期望輸出、或「檔案 X 必含/不含 Y」）。
3. **回報格式**：規定只回什麼（見下方回報合約），防止倒垃圾進主對話。

## 回報合約（所有 subagent／低成本 session 適用）

- 只回：結論（≤10 行）＋關鍵位置（`檔案:行號`）＋驗收條件逐條 ✅/❌。
- 長產物（diff、log、報告）存檔後回傳**路徑**，不貼全文。
- 失敗時回：症狀、已試過的 2 條路、卡住的確切位置——不回「我試了很多方法」。

## 升降級路徑

- **便宜檔錯 1 次**（同一子任務）→ 升中階，交辦包附上：原交辦、錯誤輸出、期望結果。
- **中階連錯 2 次**（同一子任務）→ 升頂級，必附完整失敗軌跡：原始交辦、兩次嘗試的
  diff 或動作序列、每次的錯誤輸出。沒有軌跡的升級等於重來，浪費頂級額度。
- **頂級解出後**→ 把解法寫成弱模型可照做的步驟清單，降回便宜檔批次套用到其餘案例。
- **同一件事最多重試 2 輪**。第 3 次想重試＝方向錯訊號，改走 03 的 rubric 4（換路）。
- 升級解決不了環境問題（缺套件、權限、網路）：先修環境或換路，別燒頂級額度。

## 驗證不自驗

- 檔案改動：派 fresh-context agent 做 read-back——只給它「檔案路徑＋驗收條件」，
  不給實作過程，讓它逐條核對。
- 程式碼：跑該 repo 既有測試／lint；沒有測試就實跑受影響流程一次，貼命令與輸出。
- 高風險判斷（架構取捨、對外文案、不可逆操作前的分析）：第二意見——拿到**另一個
  harness 的不同供應商模型**覆核（Claude↔GPT 互查最有價值）；或生成 3 個候選答案
  再派一個 agent 當評審擇優。

## 跨 harness 分工（依查證能力；Hermes 欄待確認後修訂）

| 任務型態 | 建議 harness | 理由 |
|---|---|---|
| 需要平行掃描、多角色、MCP 外部工具 | Claude Code | 原生 subagent＋skills＋MCP 最成熟 |
| 單一明確目標做到完的實作／除錯 | Codex CLI | 沙箱內長時間自主執行；單線程反而專注 |
| 跨供應商第二意見、多模型評審 | Hermes | 多供應商路由（暫定）；或直接在另一 harness 開 session |
| 沒有 subagent 機制時的分工 | 任一 | 開一個新的低成本 session，貼入 04 的交辦包，關閉後只把結論帶回主線 |
