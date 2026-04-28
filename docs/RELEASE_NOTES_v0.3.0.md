# GoMentor v0.3.0 Release Notes

GoMentor v0.3.0 focuses on teaching quality. This release adds a richer local joseki and pattern knowledge layer, multilingual UI language selection, and a stricter evidence pipeline so the AI teacher can explain positions with less template-like output and more reliable Go context.

## Highlights

- Built-in joseki database bundle and source manifest.
- Motif and joseki recognition for local shape matching.
- Expanded elite pattern and joseki knowledge cards.
- Teacher evidence payloads that connect KataGo candidates, board context, matched knowledge, and saved reports.
- Verification notes that help prevent unsupported coordinates, winrates, or conclusions from leaking into teacher answers.
- UI language selection for Chinese, English, Japanese, Korean, Thai, and Vietnamese.

## Teaching Changes

- KataGo remains the source of truth.
- Knowledge cards, joseki data, and motif recognizers are used for explanation and training transfer.
- Strong matches may be named directly; weaker matches should be phrased as “similar to” instead of forced labels.
- The teacher should answer like a human coach: explain the judgment path, identify the practical mistake, and suggest concrete next practice.

## Downloads

- `GoMentor-0.3.0-mac-arm64.dmg`
- `GoMentor-0.3.0-mac-x64.dmg`
- `GoMentor-0.3.0-win-x64-portable.zip`
- `GoMentor-0.3.0-win-x64.exe`

## Known Limitations

- KataGo binary/model assets are not committed as normal Git files; they are prepared through release asset tooling.
- macOS packages may be unsigned/not notarized depending on available release credentials.
- Windows packages may be unsigned and can trigger SmartScreen.
- Windows ARM64 is not part of this release target.

## Source Notes

The bundled joseki database files keep their source manifest and license documentation in `data/knowledge/joseki-source-manifest.json` and `docs/BUNDLED_JOSEKI_DATABASES.md`.
