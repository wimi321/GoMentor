# KataGo Assets Strategy

## P0 decision

KataSensei P0 should ship with a bundled KataGo binary and one default model. The default model should be the b18 recommended model already referenced by the project.

## Repository policy

Large binaries and models should not be committed as normal Git blobs. Use one of these options:

1. Git LFS for binaries/models.
2. CI artifact download before release packaging.
3. Local release build preparation via `scripts/prepare_katago_assets.mjs`.

## Expected runtime layout

```text
data/katago/
  manifest.json
  bin/darwin-arm64/katago
  bin/darwin-x64/katago
  bin/win32-x64/katago.exe
  models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz
```

## Scripts

Prepare assets:

```bash
KATASENSEI_KATAGO_BINARY=/path/to/katago \
KATASENSEI_KATAGO_MODEL=/path/to/model.bin.gz \
node scripts/prepare_katago_assets.mjs
```

Check for dev:

```bash
node scripts/check_katago_assets.mjs --mode=dev
```

Check for release:

```bash
node scripts/check_katago_assets.mjs --mode=release
```

Release mode must fail if assets are missing.

## Diagnostics behavior

- Dev build: missing assets can be warning.
- Release build: missing assets should be blocked.
- LLM missing should be warning, not blocked.
