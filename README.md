<p align="center">
<img src="https://github.com/MaikoTan/vscode-koishi-dev/blob/master/koishi.png?raw=true" alt="logo">
</p>

<h1 align="center">Koishi Dev</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=MaikoTan.koishi-dev">
    <img alt="Visual Studio Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/MaikoTan.koishi-dev?include_prereleases&style=for-the-badge&logo=visualstudiocode&label=VSCode%20Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/MaikoTan/koishi-dev">
    <img alt="Open VSX Version" src="https://img.shields.io/open-vsx/v/MaikoTan/koishi-dev?style=for-the-badge&logo=vscodium&label=Open-VSX">
  </a>
</p>

<p align="center">
A VSCode extension for Koishi Development.
</p>

## Features

The extension is still **Work in Progress** currently.

- [x] Package.json schema for "koishi" field
- [x] YAML validation for `koishi.yml` file
- [x] Field, enum and plugin name completion in `koishi.yml`
- [x] Hover documentation for config fields and plugins
- [x] Go to definition from a plugin name to its `package.json`
- [x] JavaScript / TypeScript code snippets

### `koishi.yml` IntelliSense

Beyond structural validation, the extension provides language features for
`koishi.yml`:

- **Completion** — field names at the current level, enum values on the value
  side of a field (`prefixMode`, `i18n.output`), and plugin names inside the
  `plugins` block.
- **Plugin names** — a bundled snapshot of the official plugins is merged with
  whatever is installed in your workspace, so third-party plugins appear too.
  Hovering shows the npm package name and the services a plugin provides or
  requires.
- **Hover** — the description, type, allowed values and numeric constraints
  declared in the schema.
- **Go to definition** — from a plugin name to that package's `package.json` in
  `node_modules`.

## License

This extension is licensed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html) license.
