# Contributing

## Setup

1. Clone the repository.
2. Install Node.js 18+.
3. Run validation:

```bash
npm run validate
```

4. Load unpacked extension from `chrome://extensions`.

## Common tasks

### Update strict rules

```bash
npm run rules:update
```

### Compile all enabled rulesets

```bash
npm run rules:compile
```

### Validate before commit

```bash
npm run validate
```

### Run rule quality tests

```bash
npm test
```

### Build release zip

```bash
npm run build:zip
```

## Coding guidelines

- Keep default mode lightweight.
- Prefer declarative rules over runtime interception.
- Keep allowlist logic deterministic and minimal.
- Avoid adding new permissions unless strictly necessary.
- Keep UI dependency-free and accessible.

## Pull requests

- Include a short problem statement and what changed.
- Include test/validation steps and results.
- Document any permission or behavior changes in `README.md`.

## Scope priorities

1. Performance
2. Stability
3. Rule quality
4. UI polish
