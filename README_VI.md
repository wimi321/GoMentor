<p align="center">
  <img src="./assets/logo.png" alt="GoMentor logo" width="132" height="132" />
</p>

<h1 align="center">GoMentor</h1>

<p align="center">
  <strong>Một giáo viên cờ vây trên desktop, hoạt động theo phong cách AI editor.</strong><br />
  KataGo đưa ra dữ liệu phân tích, multimodal LLM chuyển dữ liệu đó thành lời giảng dễ hiểu.
</p>

<p align="center">
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Release" src="https://img.shields.io/github/v/release/wimi321/GoMentor?include_prereleases&style=for-the-badge&label=Release" /></a>
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/wimi321/GoMentor/total?style=for-the-badge&label=Downloads" /></a>
  <a href="https://github.com/wimi321/GoMentor/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/wimi321/GoMentor?style=for-the-badge" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0f172a?style=for-the-badge" /></a>
  <a href="#cộng-đồng"><img alt="QQ Group" src="https://img.shields.io/badge/QQ%20Group-1030632742-2563eb?style=for-the-badge" /></a>
</p>

<p align="center">
  <a href="./README.md">中文</a> |
  <a href="./README_EN.md">English</a> |
  <a href="./README_JA.md">日本語</a> |
  <a href="./README_KO.md">한국어</a> |
  <a href="./README_TH.md">ไทย</a> |
  <a href="./README_VI.md">Tiếng Việt</a>
</p>

<p align="center">
  <strong>Cộng đồng GoMentor: QQ 1030632742</strong><br />
  Chào mừng góp ý, báo lỗi và cùng hoàn thiện giáo viên cờ vây AI.
</p>

---

GoMentor là ứng dụng desktop local-first cho người học và giáo viên cờ vây. Ứng dụng kết hợp KataGo, ảnh bàn cờ, bộ thẻ kiến thức cục bộ, hồ sơ học viên dài hạn và multimodal LLM thành một giáo viên cờ vây có thể tự chạy công cụ và giải thích kết quả.

## Tải xuống

Bản beta công khai:

[GoMentor v0.2.0-beta.1](https://github.com/wimi321/GoMentor/releases/tag/v0.2.0-beta.1)

| Nền tảng | Tải xuống |
| --- | --- |
| macOS Apple Silicon | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-mac-arm64.dmg) |
| macOS Intel | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-mac-x64.dmg) |
| Windows x64 portable | [EXE](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-win-x64-portable.exe) |
| Windows x64 installer | [EXE](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-win-x64.exe) |

Lưu ý: bản beta hiện chưa được ký và notarize trên macOS, cũng chưa được code-sign trên Windows, vì vậy hệ điều hành có thể hiển thị cảnh báo bảo mật.

## Tính năng chính

- Đồng bộ ván công khai từ Fox/野狐 và nhập SGF.
- Bàn cờ lấy cảm hứng từ Lizzie / KTrain với candidate moves, so sánh nước thực chiến và biểu đồ winrate.
- Tự động bắt đầu phân tích KataGo sau khi tải ván cờ.
- Khi chọn một nước trên biểu đồ, ứng dụng tự động tiếp tục phân tích vị trí đó.
- Giáo viên AI có thể phân tích nước hiện tại, toàn bộ ván, 10 ván gần nhất và tạo kế hoạch luyện tập.
- Bộ kiến thức cục bộ và hồ sơ học viên dài hạn.

## Phát triển

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## Quyền riêng tư

Ván cờ, báo cáo, cài đặt và hồ sơ học viên được lưu mặc định trong `~/.gomentor`. Phân tích nước hiện tại có thể gửi ảnh bàn cờ, KataGo JSON và một số knowledge cards đến LLM endpoint do người dùng cấu hình.

## Cộng đồng

Tham gia nhóm QQ để trao đổi, góp ý và cùng hoàn thiện GoMentor:

```text
1030632742
```

## License

MIT. See [LICENSE](./LICENSE).
