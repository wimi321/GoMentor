# Diagnostics UX

Diagnostics should be the first user-facing reliability layer.

## Gate states

- `ready`: Enter workbench automatically.
- `fixable`: Show warnings, allow continue.
- `blocked`: Do not enter workbench until fixed.

## Required checks

- App user directory writable.
- Bundled KataGo binary available and executable.
- Default KataGo model available.
- KataGo runtime config can be generated.

## Optional checks

- Claude-compatible proxy configured.
- Proxy API key valid.
- Model supports image input.
- Fox sync endpoint usable.

## UX standard

Every check should show:

- status
- title
- detail
- action
- optional technical detail

The user should not need terminal logs to understand common failures.
