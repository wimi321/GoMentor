# KataSensei

KataGo 분석과 LLM 설명을 결합해서, 바둑 학습자가 단순히 실수 위치만 보는 것이 아니라 왜 나빴는지와 어떻게 고쳐야 하는지까지 이해할 수 있게 해 주는 데스크톱 복기 앱입니다.

[中文](./README.md) | [English](./README_EN.md) | [日本語](./README_JA.md)

## 핵심 기능

- 로컬 SGF 불러오기
- Fox/野狐 공개 기보를 닉네임 또는 UID로 동기화
- KataGo 기반 핵심 실수 탐지
- OpenAI 호환 LLM으로 쉬운 해설 생성
- 로컬 우선 저장

## 빠른 시작

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

## 출력 파일

- `review.md`
- `review.json`

기본 저장 위치:

```text
~/.katasensei/reviews/<game-id>/
```
