import * as fs from 'fs'

import * as vscode from 'vscode'

import { KoishiYamlDocument } from '../yaml/document'
import { PluginResolver, discoverInstalledPlugins, pluginNameAt } from '../plugins/resolver'
import { pluginSearchRoots } from './roots'

/**
 * Locates a JSON field inside a manifest so a definition can reveal the field it
 * matched rather than dumping the user at the top of the file.
 *
 * `text.indexOf` yields a character offset, which has to be converted into a
 * line/character pair before it can be used as a `Range`.
 */
function fieldRange(manifestPath: string, field: string): vscode.Range | undefined {
  let text: string
  try {
    text = fs.readFileSync(manifestPath, 'utf-8')
  } catch {
    return undefined
  }

  const at = text.indexOf(`"${field}"`)
  if (at === -1) {return undefined}

  const before = text.slice(0, at)
  const line = before.split('\n').length - 1
  const character = before.length - (before.lastIndexOf('\n') + 1)
  return new vscode.Range(line, character, line, character + field.length + 2)
}

/**
 * Go to definition for `koishi.yml`.
 *
 * A plugin entry in `koishi.yml` names an npm package, so the useful destination
 * is that package's `package.json` in the user's `node_modules` — jumping there
 * shows the version actually installed alongside the plugin's own metadata.
 */
export class KoishiDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly plugins: PluginResolver) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Definition | null {
    const koishi = KoishiYamlDocument.parse(document.getText())
    const cursor = koishi.cursorAt(document.offsetAt(position))
        const name = pluginNameAt(cursor.path)
        if (!name) {return null}

        const roots = pluginSearchRoots(document)
        const known = this.plugins.find(name, roots)?.manifestPath
        const manifest = known ?? roots
          .flatMap(discoverInstalledPlugins)
      .find((plugin) => plugin.configName === name)?.manifestPath

    if (!manifest) {return null}

    const uri = vscode.Uri.file(manifest)
    const range = fieldRange(manifest, 'name')
    return new vscode.Location(uri, range ?? new vscode.Position(0, 0))
  }
}
