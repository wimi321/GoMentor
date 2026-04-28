# GoMentor v0.3.2

GoMentor v0.3.2 is a quality release for the teacher-agent and analysis experience. It keeps the v0.3 teaching database work, but makes the core “analyze current move” flow feel closer to an AI editor: the teacher can call tools, stream a natural answer, show clean progress steps, and let users copy the explanation.

QQ群：1030632742，欢迎一起交流、提建议、完善 GoMentor。

## Downloads

- macOS Apple Silicon: `GoMentor-0.3.2-mac-arm64.dmg`
- macOS Intel: `GoMentor-0.3.2-mac-x64.dmg`
- Windows x64 portable: `GoMentor-0.3.2-win-x64-portable.zip`
- Windows x64 installer: `GoMentor-0.3.2-win-x64.exe`
- Checksums: `SHA256SUMS.txt`

## What's New

- Teacher runtime now uses a Claude Code-style tool loop: model tool calls are executed, returned as tool results, and the model continues until it produces the final answer.
- Current-move analysis now lightly requires the teacher to read the board image, call KataGo, and search the local knowledge base before teaching.
- Teacher replies are selectable and include a copy button.
- Tool calls now appear as clean step titles such as `读取棋谱`, `KataGo 当前局面`, and `检索知识库`, with a subtle running animation.
- KataGo analysis tasks can be cancelled when the user switches game, move, or analysis mode.
- Fast winrate graph generation uses a KaTrain-style low-visit sweep first, then refines likely mistakes.
- Board previous-move marking is cleaner and no longer competes with the current-move frame.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Local teacher-agent contract tests
- Local UI contract tests for board, timeline, teacher thread, and copy/tool trace behavior

## Known Notes

- macOS packages may still require the usual trust/open steps if notarization is not available in the local build environment.
- Windows packages may trigger SmartScreen until the project has stronger signing reputation.
- Windows ARM64 is not included in this release.

---

## 中文

v0.3.2 重点提升围棋老师 Agent 和分析体验：老师现在更像 AI 编辑器里的智能体，会调用工具、流式回答、展示简洁步骤，并支持复制讲解。

推荐下载：

- Windows 用户优先下载 `GoMentor-0.3.2-win-x64-portable.zip` 免安装版。
- macOS Apple Silicon 下载 `GoMentor-0.3.2-mac-arm64.dmg`。
- macOS Intel 下载 `GoMentor-0.3.2-mac-x64.dmg`。

## 日本語

v0.3.2 は教師エージェントと解析体験の品質向上版です。ツール呼び出し、自然なストリーミング回答、簡潔な実行ステップ、回答コピーに対応しました。

## 한국어

v0.3.2는 바둑 교사 에이전트와 분석 경험을 개선한 릴리스입니다. 도구 호출, 자연스러운 스트리밍 응답, 간결한 실행 단계, 답변 복사를 지원합니다.

## ภาษาไทย

v0.3.2 ปรับปรุงประสบการณ์ AI teacher และการวิเคราะห์: เรียกใช้เครื่องมือได้ ตอบแบบสตรีม แสดงขั้นตอนสั้น ๆ และคัดลอกคำอธิบายได้

## Tiếng Việt

v0.3.2 cải thiện trải nghiệm giáo viên AI và phân tích: gọi công cụ, trả lời dạng streaming, hiển thị các bước gọn gàng và cho phép sao chép phần giải thích.
