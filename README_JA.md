# KataSensei

KataGo の判断力と LLM の説明力を組み合わせ、囲碁学習者が「どこで損をしたか」だけでなく「なぜそうなるのか」まで理解できるようにするデスクトップ復盤アプリです。

[中文](./README.md) | [English](./README_EN.md) | [한국어](./README_KO.md)

## 主な機能

- ローカル SGF の読み込み
- Fox/野狐の公開棋譜をニックネームまたは UID から同期
- KataGo による大きな失着の検出
- OpenAI 互換 LLM によるわかりやすい解説
- ローカル保存を前提とした安全な運用

## クイックスタート

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

## 出力

- `review.md`
- `review.json`

保存先:

```text
~/.katasensei/reviews/<game-id>/
```
