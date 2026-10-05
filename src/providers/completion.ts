import * as vscode from 'vscode'

import { SchemaIndex } from '../schema'
import type { PathSegment, SchemaNode } from '../schema/types'
import { KoishiYamlDocument } from '../yaml/document'
import { PluginResolver, isPluginKeyPath } from '../plugins/resolver'
import type { PluginInfo } from '../plugins/registry'
import { pluginSearchRoots } from './roots'

/** Detail text summarizing what a schema node accepts. */
function describe(node: SchemaNode): string {
  const parts: string[] = []
  if (node.type) {parts.push(Array.isArray(node.type) ? node.type.join(' | ') : node.type)}
  if (node.enum) {parts.push('enum')}
  if (node.minimum !== undefined || node.maximum !== undefined) {
    parts.push(`range ${node.minimum ?? '-∞'}..${node.maximum ?? '∞'}`)
  }
  return parts.join(' · ')
}

/**
 * Documentation for a plugin, combining its npm package and declared services.
 */
function pluginDetails(plugin: PluginInfo): vscode.CompletionItemLabel['description'] | undefined {
  const services = [
    plugin.implements?.length ? `provides ${plugin.implements.join(', ')}` : '',
    plugin.required?.length ? `requires ${plugin.required.join(', ')}` : '',
  ].filter(Boolean)
  const text = [plugin.packageName, ...services].join(' · ')
  return text || undefined
}

/**
 * Completion for `koishi.yml`.
 *
 * Three sources feed the list, in the order they are checked:
 *  - plugin names, when the cursor is inside the `plugins` block;
 *  - field names declared by the schema at the cursor's level;
 *  - enum values, when the cursor sits on a value that has a fixed set.
 */
export class KoishiCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters = ['"', ':', '-', '@']

  constructor(
    private readonly schema: SchemaIndex,
    private readonly plugins: PluginResolver,
  ) {}

  provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
    ): vscode.CompletionItem[] {
      const koishi = KoishiYamlDocument.parse(document.getText())
      const cursor = koishi.cursorAt(document.offsetAt(position))
      const roots = pluginSearchRoots(document)
      const range = wordRange(document, cursor.word)

      return [
        ...(cursor.onKey ? this.pluginItems(cursor.parentPath, range, roots) : []),
        // Field names belong to a key position only. Offering them on the value
        // side would bury the enum values that actually apply to that field.
        ...(cursor.onKey ? this.fieldItems(cursor.parentPath, range) : []),
        ...this.valueItems(cursor, range),
      ]
    }

    /**
     * Plugin suggestions, offered only inside the `plugins` block.
     *
     * The block is a free-form map in the schema, so this is the only way users
     * discover the correct config names for the adapters and features they install.
     */
    private pluginItems(
      parentPath: PathSegment[],
      range: vscode.Range,
      roots: string[],
    ): vscode.CompletionItem[] {
      if (!isPluginKeyPath(parentPath)) {return []}

    return this.plugins.all(roots).map((plugin) => {
      const item = new vscode.CompletionItem(
        plugin.configName,
        plugin.description ? vscode.CompletionItemKind.Reference : vscode.CompletionItemKind.Module,
      )
      item.detail = pluginDetails(plugin)
      item.documentation = new vscode.MarkdownString(
        plugin.description ? `**${plugin.packageName}**\n\n${plugin.description}` : plugin.packageName,
      )
      item.sortText = `0${plugin.configName}`
            item.range = range
      // Jumping to the plugin's manifest is what makes this more than a name list.
      item.command = plugin.manifestPath
        ? {
          command: 'vscode.open',
          title: 'Open plugin manifest',
          arguments: [vscode.Uri.file(plugin.manifestPath)],
        }
        : undefined
      return item
    })
  }

  /** Field names declared by the schema at the cursor's level. */
  private fieldItems(
    parentPath: PathSegment[],
      range: vscode.Range,
  ): vscode.CompletionItem[] {
    return this.schema.propertiesOf(parentPath).map(({ name, schema }, index) => {
      const kind = this.kindOf(schema)
      const item = new vscode.CompletionItem(name, kind)

      const docs = [schema.description, describe(schema)].filter(Boolean)
      item.detail = describe(schema) || undefined
      item.documentation = docs.length
        ? new vscode.MarkdownString([`\`${name}\``, '', ...docs].join('\n'))
        : undefined
      item.insertText = this.insertTextFor(name, schema)
      // Preserve the schema's declaration order, which groups related fields.
      item.sortText = String(index).padStart(3, '0')
            item.range = range
      return item
    })
  }

  /**
   * Enum values for the field the cursor is on.
   *
   * Triggered on the value side (`i18n.output: |`), so these are only offered when
   * the cursor is on a value rather than on a key.
   */
  private valueItems(
    cursor: ReturnType<KoishiYamlDocument['cursorAt']>,
          range: vscode.Range,
  ): vscode.CompletionItem[] {
    // On a key, field completion is what applies.
          if (cursor.onKey) {return []}

    const enums = this.schema.enumAt(cursor.path)
    if (enums.length === 0) {return []}

    return enums.map(({ value, description }) => {
      const item = new vscode.CompletionItem(
        String(value),
        vscode.CompletionItemKind.EnumMember,
      )
      item.detail = description ?? cursor.path.join('.')
      item.documentation = description
        ? new vscode.MarkdownString(description)
        : undefined
      item.range = range
      item.insertText = this.insertTextFor(String(value), this.schema.resolve(cursor.path))
      return item
    })
  }

  /** Maps a schema type onto the icon VSCode shows in the completion list. */
        private kindOf(node: SchemaNode): vscode.CompletionItemKind {
      switch (nodeType(node)) {
        case 'boolean': return vscode.CompletionItemKind.EnumMember
        case 'integer':
        case 'number': return vscode.CompletionItemKind.Value
        case 'array':
        case 'object': return vscode.CompletionItemKind.Struct
        default: return vscode.CompletionItemKind.Property
      }
    }

  /**
   * The text inserted for a completion.
   *
   * Booleans and enums are inserted already quoted, so accepting a suggestion in
   * YAML does not produce a bare string where the schema demands a scalar, and
   * plugin names containing `@` stay valid without manual quoting.
   */
  private insertTextFor(name: string, node: SchemaNode | undefined): string {
    const type = nodeType(node)
    if (type === 'boolean' || node?.enum) {
      return JSON.stringify(name)
    }
    return name
  }
}

function nodeType(node: SchemaNode | undefined): string | undefined {
  if (!node?.type) {return undefined}
  return Array.isArray(node.type) ? node.type[0] : node.type
}

/**
 * The range a completion replaces: the partially typed word under the cursor.
 *
 * Anchoring to the word rather than the whole line is what lets a user cycle
 * through suggestions while keeping the `: ` and indentation intact.
 */
function wordRange(
  document: vscode.TextDocument,
  word: { text: string; start: number; end: number },
): vscode.Range {
  return new vscode.Range(
      document.positionAt(word.start),
      document.positionAt(word.end),
    )
  }
