# GoMentor v0.3.4

GoMentor v0.3.4 is a usability polish release for configuration and first-run setup. It focuses on making the LLM settings flow feel like a real desktop app: paste works normally, the saved key can be verified on demand, and the settings surface now matches the light GoMentor product style.

QQ群：1030632742，欢迎一起交流、提建议、完善 GoMentor。

## Downloads

- macOS Apple Silicon: `GoMentor-0.3.4-mac-arm64.dmg`
- macOS Intel: `GoMentor-0.3.4-mac-x64.dmg`
- Windows x64 portable: `GoMentor-0.3.4-win-x64-portable.zip`
- Windows x64 installer: `GoMentor-0.3.4-win-x64.exe`
- Checksums: `SHA256SUMS.txt`

## What's New

- Added native desktop copy/paste support for settings fields through the Electron Edit menu and editable-field context menu.
- Fixed the API Key setup flow so keys copied from another app can be pasted into GoMentor normally.
- Added an on-demand “show key” control so users can verify the saved LLM API Key before testing multimodal analysis.
- Polished the settings header into the light desktop visual system with KataGo and LLM readiness badges.
- Removed the extra API Key copy control from settings to keep the interaction focused on paste, verify, and save.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Manual desktop smoke: Base URL field accepts pasted clipboard content.
- Release artifact checks before upload.

## Known Notes

- macOS packages may still require the usual trust/open steps if notarization is not available in the local build environment.
- Windows packages may trigger SmartScreen until the project has stronger signing reputation.
- Windows ARM64 is not included in this release.

---

## 中文

v0.3.4 重点修复设置页的桌面交互：从其它地方复制来的 API Key / Base URL 现在可以正常粘贴，设置页也改成更统一的浅色桌面风格。

推荐下载：

- Windows 用户优先下载 `GoMentor-0.3.4-win-x64-portable.zip` 免安装版。
- macOS Apple Silicon 下载 `GoMentor-0.3.4-mac-arm64.dmg`。
- macOS Intel 下载 `GoMentor-0.3.4-mac-x64.dmg`。

## 日本語

v0.3.4 は設定画面のデスクトップ操作を改善します。外部からコピーした API Key や Base URL を通常どおり貼り付けられ、設定画面も GoMentor のライトテーマに合わせて調整しました。

## 한국어

v0.3.4는 설정 화면의 데스크톱 사용성을 개선합니다. 외부에서 복사한 API Key와 Base URL을 정상적으로 붙여넣을 수 있고, 설정 화면도 GoMentor의 밝은 제품 스타일에 맞게 다듬었습니다.

## ภาษาไทย

v0.3.4 ปรับปรุงหน้าตั้งค่าให้ใช้งานเหมือนแอปเดสก์ท็อปจริง: วาง API Key/Base URL จากแอปอื่นได้ตามปกติ และปรับหน้าตั้งค่าให้เข้ากับสไตล์สว่างของ GoMentor

## Tiếng Việt

v0.3.4 cải thiện thao tác trên trang cài đặt: API Key và Base URL sao chép từ ứng dụng khác có thể dán bình thường, đồng thời giao diện cài đặt được chỉnh lại theo phong cách sáng của GoMentor.
