import * as vscode from 'vscode'

import { SchemaIndex } from '../schema'
import type { PathSegment, SchemaNode } from '../schema/types'
import { KoishiYamlDocument } from '../yaml/document'
import { PluginResolver, pluginNameAt } from '../plugins/resolver'
import { pluginSearchRoots } from './roots'

/** Renders a schema node's allowed values, if it constrains them. */
function valueDocs(node: SchemaNode): string[] {
  const lines: string[] = []

  if (node.enum) {
    const allowed = node.enum.map((value, index) => {
      const note = node.enumDescriptions?.[index]
      return note ? `\`${String(value)}\` — ${note}` : `\`${String(value)}\``
    })
    lines.push(`Allowed values: ${allowed.join(', ')}`)
  }

  const type = Array.isArray(node.type) ? node.type.join(' | ') : node.type
  if (type) {lines.push(`Type: \`${type}\``)}

  const bounds: string[] = []
  if (node.minimum !== undefined) {bounds.push(`min ${node.minimum}`)}
  if (node.maximum !== undefined) {bounds.push(`max ${node.maximum}`)}
  if (node.maxLength !== undefined) {bounds.push(`max length ${node.maxLength}`)}
  if (bounds.length) {lines.push(`Constraints: ${bounds.join(', ')}`)}

  return lines
}

/**
 * Hover documentation for `koishi.yml`.
 *
 * Shows the schema's `description` for the field under the cursor, and the
 * package name plus declared services for a plugin entry.
 */
export class KoishiHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly schema: SchemaIndex,
    private readonly plugins: PluginResolver,
  ) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const koishi = KoishiYamlDocument.parse(document.getText())
    const offset = document.offsetAt(position)
    const cursor = koishi.cursorAt(offset)
    const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_$@.-]+/)

    const plugin = this.pluginHover(cursor.path, document)
    if (plugin) {return new vscode.Hover(plugin, range)}

    const node = this.schema.resolve(cursor.path)
    if (!node) {return null}

    const lines: string[] = []
    if (node.title) {lines.push(`**${node.title}**`)}
    if (node.description) {lines.push(node.description)}
    lines.push(...valueDocs(node))

    if (lines.length === 0) {return null}
    return new vscode.Hover(new vscode.MarkdownString(lines.join('\n\n')), range)
  }

  /**
   * Hover for a plugin entry, showing which npm package the config name maps to.
   *
   * Knowing that `adapter-qq` comes from `@koishijs/plugin-adapter-qq` is the piece
   * that makes the `plugins` block editable without a lookup table at hand.
   */
  private pluginHover(
    path: PathSegment[],
    document: vscode.TextDocument,
  ): vscode.MarkdownString | null {
      const name = pluginNameAt(path)
      if (!name) {return null}

    const plugin = this.plugins.find(name, pluginSearchRoots(document))
    if (!plugin) {return null}

    const lines = [`**${plugin.configName}**`, '', `npm: \`${plugin.packageName}\``]
    if (plugin.description) {lines.push('', plugin.description)}

    const services: string[] = []
    if (plugin.implements?.length) {services.push(`provides \`${plugin.implements.join('`, `')}\``)}
    if (plugin.required?.length) {services.push(`requires \`${plugin.required.join('`, `')}\``)}
    if (services.length) {lines.push('', services.join(' · '))}

    if (!plugin.manifestPath) {lines.push('', '_Not installed in this workspace._')}

    return new vscode.MarkdownString(lines.join('\n'))
  }
}
