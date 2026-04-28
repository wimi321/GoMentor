# GoMentor v0.3.3

GoMentor v0.3.3 improves the current-move teacher explanation quality. The main change is “teaching pacing”: routine joseki should be short, joseki branches should show key variations, and middle-game fights should explain purpose, expected reply, continuation, and practical result.

QQ群：1030632742，欢迎一起交流、提建议、完善 GoMentor。

## Downloads

- macOS Apple Silicon: `GoMentor-0.3.3-mac-arm64.dmg`
- macOS Intel: `GoMentor-0.3.3-mac-x64.dmg`
- Windows x64 portable: `GoMentor-0.3.3-win-x64-portable.zip`
- Windows x64 installer: `GoMentor-0.3.3-win-x64.exe`
- Checksums: `SHA256SUMS.txt`

## What's New

- Added internal teacher pacing modes for current-move analysis:
  - `minimal`: short explanation for routine joseki or tiny loss.
  - `branch`: explain 1-2 key variations for joseki branches or similar shapes.
  - `detailed`: explain purpose, expected reply, PV continuation, and practical result for middle-game fights and clear losses.
  - `caution`: speak as a tendency when KataGo evidence is weak.
- KataGo and knowledge tool results now include `teachingPacing` advice for the agent.
- Current-move prompt now asks the teacher to control explanation density without returning to a fixed report template.
- Real LLM smoke checks now validate the Agent Runtime output and pacing advice.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm smoke:teacher-llm`
- `pnpm smoke:teacher-llm:real`
- Release artifact checks before upload

## Known Notes

- macOS packages may still require the usual trust/open steps if notarization is not available in the local build environment.
- Windows packages may trigger SmartScreen until the project has stronger signing reputation.
- Windows ARM64 is not included in this release.

---

## 中文

v0.3.3 重点优化“分析当前手”的讲棋火候：常规定式少讲，定式分支列关键变化，中盘战则讲清目的、应手、后续变化和实战评价。这个版本不新增复杂 UI，只让老师更像真人讲棋。

推荐下载：

- Windows 用户优先下载 `GoMentor-0.3.3-win-x64-portable.zip` 免安装版。
- macOS Apple Silicon 下载 `GoMentor-0.3.3-mac-arm64.dmg`。
- macOS Intel 下载 `GoMentor-0.3.3-mac-x64.dmg`。

## 日本語

v0.3.3 は現在手の説明品質を改善します。定型的な定石は短く、分岐は重要変化を示し、中盤戦では目的・応手・継続・実戦評価をより丁寧に説明します。

## 한국어

v0.3.3은 현재 수 해설의 밀도를 개선합니다. 일반 정석은 짧게, 분기는 핵심 변화 중심으로, 중반 전투는 목적과 응수, 이후 진행, 실전 평가를 더 자세히 설명합니다.

## ภาษาไทย

v0.3.3 ปรับจังหวะการอธิบายหมากปัจจุบัน: joseki ปกติอธิบายสั้นลง, สาขา joseki แสดงรูปแบบสำคัญ, และการต่อสู้กลางเกมอธิบายเป้าหมาย คำตอบที่คาดหวัง ลำดับต่อ และผลในเกมจริง

## Tiếng Việt

v0.3.3 cải thiện nhịp độ giải thích nước hiện tại: joseki quen thuộc nói ngắn hơn, nhánh joseki nêu biến chính, còn trung bàn sẽ giải thích mục đích, phản ứng dự kiến, tiếp diễn PV và đánh giá thực chiến.
