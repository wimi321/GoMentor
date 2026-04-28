<p align="center">
  <img src="./assets/logo.png" alt="GoMentor logo" width="132" height="132" />
</p>

<h1 align="center">GoMentor</h1>

<p align="center">
  <strong>AI エディタのように動くデスクトップ囲碁教師。</strong><br />
  KataGo が局面を評価し、マルチモーダル LLM が学習者にわかる言葉で説明します。
</p>

<p align="center">
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Release" src="https://img.shields.io/github/v/release/wimi321/GoMentor?include_prereleases&style=for-the-badge&label=Release" /></a>
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/wimi321/GoMentor/total?style=for-the-badge&label=Downloads" /></a>
  <a href="https://github.com/wimi321/GoMentor/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/wimi321/GoMentor?style=for-the-badge" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0f172a?style=for-the-badge" /></a>
  <a href="#コミュニティ"><img alt="QQ Group" src="https://img.shields.io/badge/QQ%20Group-1030632742-2563eb?style=for-the-badge" /></a>
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
  <strong>GoMentor コミュニティ: QQ 1030632742</strong><br />
  フィードバック、提案、バグ報告を歓迎します。
</p>

---

GoMentor は、KataGo、棋盤スクリーンショット、ローカル知識カード、学習者プロフィール、マルチモーダル LLM を組み合わせたローカル優先の囲碁学習アプリです。単なるチャット付き棋盤ではなく、局面を調べ、根拠を集め、説明し、練習計画まで作れる AI 囲碁教師を目指しています。

## ダウンロード

公開リリース：

[GoMentor v0.3.3](https://github.com/wimi321/GoMentor/releases/tag/v0.3.3)

| プラットフォーム | ダウンロード |
| --- | --- |
| macOS Apple Silicon | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.3.3/GoMentor-0.3.3-mac-arm64.dmg) |
| macOS Intel | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.3.3/GoMentor-0.3.3-mac-x64.dmg) |
| Windows x64 portable ZIP | [ZIP](https://github.com/wimi321/GoMentor/releases/download/v0.3.3/GoMentor-0.3.3-win-x64-portable.zip) |
| Windows x64 installer | [EXE](https://github.com/wimi321/GoMentor/releases/download/v0.3.3/GoMentor-0.3.3-win-x64.exe) |

注意：現在のリリースは未署名です。macOS Gatekeeper や Windows SmartScreen の警告が表示される場合があります。

## 主な機能

- Fox/野狐の公開棋譜同期と SGF インポート。
- Lizzie / KTrain に着想を得た棋盤、候補手、実戦手比較、勝率グラフ。
- 棋譜を読み込むと KataGo 分析を自動開始。
- 勝率グラフで手を選ぶと、その局面の分析を自動継続。
- 多モーダル LLM による現在手、全局、最近 10 局、トレーニング計画の説明。
- ローカル知識ベースと学習者プロフィール。

## 開発

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

## プライバシー

棋譜、設定、レポート、学習者プロフィールは既定で `~/.gomentor` に保存されます。現在手の説明では、ユーザーが設定した LLM エンドポイントへ棋盤画像、KataGo JSON、知識カードの一部を送信する場合があります。

## コミュニティ

QQ グループでフィードバックや提案を歓迎しています。

```text
1030632742
```

## License

MIT. See [LICENSE](./LICENSE).
