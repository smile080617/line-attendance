# lessons.md · append-only 教訓簿

格式見 `05-maintenance.md`。只准在檔尾追加，不得改寫既有條目。

## 2026-07-04 · claude · 雲端容器的 home 目錄不是持久儲存
症狀：制度原計畫寫進 ~/.agents/，但雲端 session 的容器會被回收，寫了等於丟失。
根因：把「使用者本機的檔案系統」和「雲端臨時容器」混為一談。
規則：任何要跨 session 留存的產出，一律寫進 git repo 並 push；home 目錄只放快取。
