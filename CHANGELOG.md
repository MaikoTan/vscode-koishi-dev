# Change Log

All notable changes to the "koishi-dev" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Add field, enum and plugin name completion for `koishi.yml`. Plugin names come
  from a bundled snapshot of the official plugins merged with the plugins
  installed in the current workspace.
- Add hover documentation for `koishi.yml` config fields, showing the schema
  description, type, allowed values and constraints.
- Add hover for plugin entries in the `plugins` block, mapping a config name to
  its npm package and declared services.
- Add go to definition from a plugin name to the installed package's
  `package.json`.

### Fixed

- Fix F5 reporting `Task '${defaultBuildTask}' not found`. VS Code no longer
  supports that variable, so `launch.json` now names the build task directly.
  The task is labelled `watch: compile` rather than `npm: watch`, because VS
  Code auto-detects `package.json` scripts under that same identifier and the
  duplicate makes F5 prompt for a task instead of running it.
- Fix F5 failing to start the Extension Development Host on a fresh clone. The
  `schemata/*.json` and `snippets/*.json` files are generated from their `.yaml`
  sources and are gitignored, but the default build task only ran `tsc`, so
  activation threw `Schema not found: .../schemata/koishi-yml.json`. The default
  build task now runs the conversion first.
- Compile `src/test` as part of `yarn run compile`, so `yarn test` can find the
  test files it previously never built.
- Update the Mocha test runner for the current `glob` and `mocha` releases.

## [0.0.4] - 2024-02-23

### Added

- Add YAML validation for `koishi.yml` file. ([`4f3e5b6](https://github.com/MaikoTan/vscode-koishi-dev/commit/4f3e5b698fd6e099d7276400a696d54749cadb52))

## [0.0.3] - 2023-11-10

### Added

- Add JavaScript snippets for developing Koishi ([#3](https://github.com/MaikoTan/vscode-koishi-dev/pull/3))

## [0.0.2] - 2023-11-10

### Fixed

- Add missing `preview` field in `koishi` field ([#1](https://github.com/MaikoTan/vscode-koishi-dev/pull/1))

## [0.0.1] - 2023-04-15

### Added

- Initial release
- Add validation of the `koishi` field to `package.json` ([`74e1bdc`](https://github.com/MaikoTan/vscode-koishi-dev/commit/74e1bdcfea9db7dc23d82c36fb7d314536747478))

[0.0.4]: https://github.com/MaikoTan/vscode-koishi-dev/compare/0.0.3..v0.0.4
[0.0.3]: https://github.com/MaikoTan/vscode-koishi-dev/compare/0.0.2..0.0.3
[0.0.2]: https://github.com/MaikoTan/vscode-koishi-dev/compare/0.0.1..0.0.2
[0.0.1]: https://github.com/MaikoTan/vscode-koishi-dev/commit/74e1bdcfea9db7dc23d82c36fb7d314536747478
