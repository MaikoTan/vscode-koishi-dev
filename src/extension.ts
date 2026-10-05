import * as vscode from 'vscode'

import { KOISHI_YML_SCHEMA_PATH, SchemaIndex } from './schema'
import { PluginResolver } from './plugins/resolver'
import { KoishiCompletionProvider } from './providers/completion'
import { KoishiHoverProvider } from './providers/hover'
import { KoishiDefinitionProvider } from './providers/definition'

/** Documents this extension contributes language intelligence for. */
export const KOISHI_YML_SELECTOR: vscode.DocumentSelector = [
  { language: 'yaml', scheme: 'file', pattern: '**/koishi.yml' },
  { language: 'yaml', scheme: 'untitled', pattern: '**/koishi.yml' },
]

export function activate(context: vscode.ExtensionContext): void {
  const schema = SchemaIndex.fromFile(KOISHI_YML_SCHEMA_PATH)
  const plugins = new PluginResolver()

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      KOISHI_YML_SELECTOR,
      new KoishiCompletionProvider(schema, plugins),
      ...KoishiCompletionProvider.triggerCharacters,
    ),
    vscode.languages.registerHoverProvider(
      KOISHI_YML_SELECTOR,
      new KoishiHoverProvider(schema, plugins),
    ),
    vscode.languages.registerDefinitionProvider(
      KOISHI_YML_SELECTOR,
      new KoishiDefinitionProvider(plugins),
    ),
  )

  console.log('Koishi Dev extension is now active')
}

export function deactivate(): void {
  // Nothing to tear down: all resources live in the extension context.
}
