# lessons.md · append-only 教訓簿

格式見 `05-maintenance.md`。只准在檔尾追加，不得改寫既有條目。

## 2026-07-04 · claude · 雲端容器的 home 目錄不是持久儲存
症狀：制度原計畫寫進 ~/.agents/，但雲端 session 的容器會被回收，寫了等於丟失。
根因：把「使用者本機的檔案系統」和「雲端臨時容器」混為一談。
規則：任何要跨 session 留存的產出，一律寫進 git repo 並 push；home 目錄只放快取。

## 2026-07-04 · claude · bash 的 cd 不穿透 symlink，路徑腳本要用 cd -P
症狀：verify.sh 經 ~/.agents symlink 呼叫時，用 `cd dir/..` 解析出錯誤的父目錄，全部檢查誤報失敗。
根因：bash 預設邏輯路徑模式，symlink 後接 `..` 回到 symlink 所在處，不是實體父目錄。
規則：凡是「從 $0 推算 repo 根」的腳本一律用 `cd -P`；文件不要教使用者用 symlink+`..` 呼叫腳本。
