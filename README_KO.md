<p align="center">
  <img src="./assets/logo.png" alt="GoMentor logo" width="132" height="132" />
</p>

<h1 align="center">GoMentor</h1>

<p align="center">
  <strong>AI 에디터처럼 동작하는 데스크톱 바둑 선생님.</strong><br />
  KataGo는 사실을 판단하고, 멀티모달 LLM은 사람이 이해할 수 있게 설명합니다.
</p>

<p align="center">
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Release" src="https://img.shields.io/github/v/release/wimi321/GoMentor?include_prereleases&style=for-the-badge&label=Release" /></a>
  <a href="https://github.com/wimi321/GoMentor/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/wimi321/GoMentor/total?style=for-the-badge&label=Downloads" /></a>
  <a href="https://github.com/wimi321/GoMentor/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/wimi321/GoMentor?style=for-the-badge" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0f172a?style=for-the-badge" /></a>
  <a href="#커뮤니티"><img alt="QQ Group" src="https://img.shields.io/badge/QQ%20Group-1030632742-2563eb?style=for-the-badge" /></a>
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
  <strong>GoMentor 커뮤니티: QQ 1030632742</strong><br />
  사용 후기, 제안, 버그 리포트를 환영합니다.
</p>

---

GoMentor는 KataGo, 바둑판 스크린샷, 로컬 지식 카드, 학생 프로필, 멀티모달 LLM을 하나의 에이전트형 바둑 선생님으로 묶는 로컬 우선 데스크톱 앱입니다.

## 다운로드

공개 베타:

[GoMentor v0.2.0-beta.1](https://github.com/wimi321/GoMentor/releases/tag/v0.2.0-beta.1)

| 플랫폼 | 다운로드 |
| --- | --- |
| macOS Apple Silicon | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-mac-arm64.dmg) |
| macOS Intel | [DMG](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-mac-x64.dmg) |
| Windows x64 portable | [EXE](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-win-x64-portable.exe) |
| Windows x64 installer | [EXE](https://github.com/wimi321/GoMentor/releases/download/v0.2.0-beta.1/GoMentor-0.2.0-beta.1-win-x64.exe) |

현재 베타 패키지는 서명되지 않았으므로 macOS Gatekeeper 또는 Windows SmartScreen 경고가 표시될 수 있습니다.

## 주요 기능

- Fox/野狐 공개 기보 동기화와 SGF 가져오기.
- Lizzie / KTrain 스타일 바둑판, 후보수, 실전수 비교, 승률 그래프.
- 기보를 불러오면 KataGo 분석을 자동 시작.
- 승률 그래프에서 수순을 선택하면 해당 국면 분석을 자동으로 계속 진행.
- 현재 수, 전체 대국, 최근 10국, 훈련 계획을 LLM이 설명.
- 로컬 지식 베이스와 장기 학생 프로필.

## 개발

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

## 개인정보

기보, 설정, 리포트, 학생 프로필은 기본적으로 `~/.gomentor`에 저장됩니다. 현재 수 설명은 사용자가 설정한 LLM 엔드포인트로 바둑판 이미지, KataGo JSON, 선택된 지식 카드를 보낼 수 있습니다.

## 커뮤니티

의견과 제안을 위해 QQ 그룹에 참여해 주세요.

```text
1030632742
```

## License

MIT. See [LICENSE](./LICENSE).
