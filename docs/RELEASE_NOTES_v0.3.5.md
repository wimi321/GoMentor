# GoMentor v0.3.5

GoMentor v0.3.5 is a keyboard navigation release for faster review sessions. You can now step through a game with Left/Right arrows, jump to the beginning or end with Home/End, and move quickly without causing a burst of KataGo live-analysis restarts.

QQ群：1030632742，欢迎一起交流、提建议、完善 GoMentor。

## Downloads

- macOS Apple Silicon: `GoMentor-0.3.5-mac-arm64.dmg`
- macOS Intel: `GoMentor-0.3.5-mac-x64.dmg`
- Windows x64 portable: `GoMentor-0.3.5-win-x64-portable.zip`
- Windows x64 installer: `GoMentor-0.3.5-win-x64.exe`
- Checksums: `SHA256SUMS.txt`

## What's New

- Added global Left/Right arrow shortcuts to step backward and forward through moves.
- Added Home/End shortcuts to jump to the first or final board position.
- Debounced live KataGo analysis while using keyboard navigation so the board updates immediately and analysis restarts only after a short idle pause.
- Preserved usable partial live-analysis results when rapid move changes cancel the previous KataGo search.
- Kept keyboard navigation out of editable fields, selects, buttons, and modified key combinations.

## Verification

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm rc:check`
- `pnpm rc:artifacts`
- `pnpm check:katago-assets`

## Known Notes

- macOS packages may still require the usual trust/open steps if notarization is not available in the local build environment.
- Windows packages may trigger SmartScreen until the project has stronger signing reputation.
- Windows ARM64 is not included in this release.

---

## 中文

v0.3.5 让复盘切手更顺手：可以用左右方向键前后移动，用 Home/End 跳到开局或终局。快速按键时棋盘会立刻响应，KataGo 精读会在短暂等待后再重新分析，避免频繁启动和取消。

推荐下载：

- Windows 用户优先下载 `GoMentor-0.3.5-win-x64-portable.zip` 免安装版。
- macOS Apple Silicon 下载 `GoMentor-0.3.5-mac-arm64.dmg`。
- macOS Intel 下载 `GoMentor-0.3.5-mac-x64.dmg`。

## 日本語

v0.3.5 ではキーボードでの棋譜移動を追加しました。左右キーで前後に進み、Home/End で最初または最後の局面へ移動できます。連続操作中の KataGo 解析も短く待ってから再開します。

## 한국어

v0.3.5는 키보드 기보 탐색을 추가합니다. 좌우 방향키로 수를 앞뒤로 이동하고 Home/End로 첫 수 또는 마지막 국면으로 이동할 수 있으며, 빠른 이동 중 KataGo 분석 재시작을 줄였습니다.

## ภาษาไทย

v0.3.5 เพิ่มการนำทางด้วยคีย์บอร์ด: ใช้ปุ่มลูกศรซ้าย/ขวาเพื่อเลื่อนหมาก และ Home/End เพื่อไปต้นหรือท้ายเกม พร้อมลดการเริ่มวิเคราะห์ KataGo ซ้ำเมื่อกดเร็ว ๆ

## Tiếng Việt

v0.3.5 bổ sung điều hướng ván cờ bằng bàn phím: dùng mũi tên trái/phải để lùi hoặc tiến nước, Home/End để về đầu hoặc cuối ván, đồng thời giảm việc khởi động lại phân tích KataGo khi bấm nhanh.
