# AGENT.md

Reference documentation for AI coding agents working on the **Koishi Dev** VSCode
extension. It describes the repository layout, the toolchain, and the exact
commands for building, testing, and packaging.

For user-facing documentation see [README.md](./README.md).

## Project overview

A VSCode extension that adds Koishi developer support:

- JSON Schema validation for the `koishi` field in `package.json`
- YAML Schema validation for `koishi.yml`
- IntelliSense for `koishi.yml` — field / enum / plugin-name completion, hover
  documentation, and go-to-definition from a plugin name to its `package.json`
- TypeScript / JavaScript snippets

## Repository structure

```
├── src/
│   ├── extension.ts          # Extension entry: registers the language providers
│   ├── schema/               # JSON Schema index — resolve schema by config path
│   │   ├── types.ts          # SchemaNode / PathSegment type definitions
│   │   └── index.ts          # SchemaIndex: path lookup, property & enum extraction
│   ├── yaml/
│   │   └── document.ts       # koishi.yml parsing: cursor offset → config path
│   ├── plugins/
│   │   ├── registry.ts       # Bundled snapshot of official plugins, package→config name
│   │   └── resolver.ts       # Scans workspace node_modules, merges installed plugins
│   ├── providers/
│   │   ├── completion.ts     # Completion: fields / enums / plugin names
│   │   ├── hover.ts          # Hover: schema docs + plugin package info
│   │   ├── definition.ts     # Go to definition: plugin name → package.json
│   │   └── roots.ts          # Locates workspace roots
│   └── test/
│       ├── runTest.ts        # Downloads/launches VSCode, runs mocha
│       └── suite/            # schema / plugins / providers / extension tests
├── schemata/
│   ├── koishi-yml.yaml       # YAML Schema for koishi.yml   (source of truth)
│   ├── koishi-yml.json       # Generated — consumed by VSCode
│   ├── package-json.yaml     # YAML Schema for package.json "koishi" field
│   └── package-json.json     # Generated
├── snippets/
│   ├── koishi.common.yaml    # Snippet definitions (source of truth)
│   └── koishi.common.json    # Generated
├── scripts/
│   └── convert.ts            # YAML → JSON conversion script
├── .github/workflows/        # build (CI), publish, tagger
├── .vscode/                  # Debug/launch configuration (F5 → Extension Host)
├── package.json              # Extension manifest
└── tsconfig.json             # TypeScript configuration
```

Note: `schemata/*.json`, `snippets/*.json`, `out/` and `*.vsix` are generated and
git-ignored. Never edit the generated JSON by hand — edit the `.yaml` source and
re-run the convert script.

## Toolchain

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 20+ (CI uses 20) | Build / test runtime |
| Yarn | 4.x via Corepack | Dependency management (`packageManager` pinned) |
| TypeScript | 5.9 | Compilation to `out/` |
| `yaml` | 2.x | Runtime YAML parsing with offsets |
| `js-yaml` | dev | Build-time conversion only |
| ESLint | 10 + typescript-eslint | Linting |
| `@vscode/test-electron` | 3.x | Launches a real VSCode for tests |
| `@vscode/vsce` | 4.x | `.vsix` packaging |

```bash
corepack enable          # once, provides the pinned Yarn version
yarn install --immutable # CI-style reproducible install
```

## Commands

| Command | What it does |
| --- | --- |
| `yarn run compile` | `tsc -p ./` — compile `src/` into `out/` |
| `yarn run watch` | Compile in watch mode |
| `yarn run convert` | `tsx ./scripts/convert.ts` — regenerate schema/snippet JSON from YAML |
| `yarn run lint` | `eslint src` |
| `yarn test` | compile → convert → lint → run mocha inside VSCode |
| `yarn run package` | `vsce package --no-yarn` — produces `koishi-dev-<version>.vsix` |
| `yarn run vscode:prepublish` | compile + convert (the release pre-step) |

### Build

```bash
yarn install --immutable
yarn run vscode:prepublish   # compile + regenerate schemata/snippets JSON
```

### Test

```bash
yarn test
```

`yarn test` is the full gate: it compiles, regenerates the JSON artifacts, lints,
and then launches a downloaded VSCode instance via `@vscode/test-electron` to run
the mocha suites. The suite needs a display; on Linux CI it runs under
`xvfb-run -a yarn test`.

Test layers:

- `src/test/suite/schema.test.ts` — pure logic (schema index)
- `src/test/suite/plugins.test.ts` — pure logic + temp directories
- `src/test/suite/providers.test.ts` — invokes providers inside a real VSCode
- `src/test/suite/extension.test.ts` — extension activation smoke test

For fast iteration on pure-logic files, `yarn run compile` plus
`node ./out/test/runTest.js` is enough.

### Package

```bash
yarn run vscode:prepublish
yarn run package    # → koishi-dev-<version>.vsix
```

### Debug

Press <kbd>F5</kbd> in VSCode (see `.vscode/launch.json`) to start an Extension
Development Host with the extension loaded. Open a `koishi.yml` in that window to
exercise completion, hover, and go-to-definition.

## Architecture notes

All three `koishi.yml` providers share one cursor-to-path resolution step:

```
KoishiYamlDocument.cursorAt(offset) → { path, parentPath, onKey, word }
                                    ↓
                    SchemaIndex looks up the schema by path
```

- `path` — the config path at the cursor. On a **key** it is that key's own
  path; on a **value** it is the value's path.
- `parentPath` — the innermost mapping at the cursor, i.e. the level where a new
  key may appear.
- `onKey` — distinguishes key position from value position, deciding whether to
  offer field names or enum values.

Gotchas to keep in mind when editing this code:

- The YAML parser cannot express "typed but not yet a key". In `plugins:\n  ada`,
  `ada` parses as a scalar value of `plugins`, so `cursorAt` falls back to
  indentation to decide whether the cursor is on a key.
- Empty value slots (`prefixMode: |`) must be classified as **value** positions,
  otherwise enum completion never fires.
- The document is re-parsed on every request. Config files are small enough that
  the cost is negligible, and it avoids tracking external edits manually.

## Contribution guidelines

- Schema and snippet definitions are authored in YAML (comments, readability);
  run `yarn run convert` after every change and commit the regenerated JSON only
  if it is tracked.
- Keep the extension runtime dependency-light: `yaml` is the only production
  dependency.
- CI (`.github/workflows/build.yml`) runs `yarn test` then `yarn package` on every
  push and pull request, so both must pass before merging.
- Releases are cut by pushing a tag; `publish.yml` packages and publishes to the
  Visual Studio Marketplace and Open VSX.
- Licensed under AGPL-3.0.