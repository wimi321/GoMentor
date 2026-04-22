# Security Policy

KataSensei handles local SGFs, student profiles, API keys, board screenshots, and LLM requests. Please treat privacy and local-system safety as product requirements.

## Supported Versions

KataSensei is currently in early public development. Security fixes target the latest `main` branch until stable releases begin.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories on the repository:

https://github.com/wimi321/katasensei/security/advisories

Do not open a public issue for vulnerabilities that include exploit details, private SGFs, API keys, personal data, or local paths.

## Sensitive Data Guidelines

- Do not paste real API keys into issues or logs.
- Remove private SGF content and student-identifying data before sharing bug reports.
- Current-move analysis may send a board screenshot, KataGo JSON, and selected knowledge cards to the configured LLM endpoint.
- Web-search tools must use generic Go topics and must not include student names, SGF contents, board screenshots, API keys, local paths, or other private data.

## Local Execution

KataSensei runs local processes such as KataGo. Changes that alter binary discovery, model loading, local file access, shell execution, or automatic installation should receive extra review.
