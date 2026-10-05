import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import * as vscode from 'vscode'

import { KOISHI_YML_SELECTOR, activate } from '../../extension'
import { KOISHI_YML_SCHEMA_PATH, SchemaIndex } from '../../schema'
import { PluginResolver } from '../../plugins/resolver'
import { KoishiCompletionProvider } from '../../providers/completion'
import { KoishiHoverProvider } from '../../providers/hover'
import { KoishiDefinitionProvider } from '../../providers/definition'

const schema = SchemaIndex.fromFile(KOISHI_YML_SCHEMA_PATH)
const plugins = new PluginResolver()

const completion = new KoishiCompletionProvider(schema, plugins)
const hover = new KoishiHoverProvider(schema, plugins)
const definition = new KoishiDefinitionProvider(plugins)

/** Opens a temporary `koishi.yml` and closes it again. */
async function withKoishiFile<T>(
  content: string,
  run: (document: vscode.TextDocument) => Promise<T> | T,
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'koishi-yml-'))
  const file = path.join(dir, 'koishi.yml')
  fs.writeFileSync(file, content, 'utf-8')

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  try {
    return await run(document)
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Flattens hover contents to plain text.
 *
 * A provider returns `MarkdownString`s, and `String(markdown)` yields
 * `"[object Object]"`, so tests must read `.value` explicitly.
 */
function hoverText(result: vscode.Hover | null): string {
  const contents = result?.contents ?? []
  return contents
    .map((part) => {
      if (typeof part === 'string') {return part}
      return part instanceof vscode.MarkdownString ? part.value : ''
    })
    .join('\n')
}

suite('providers', () => {
  test('activation registers the language providers', () => {
    const subscriptions: vscode.Disposable[] = []
    activate({
      subscriptions,
    } as unknown as vscode.ExtensionContext)

    assert.strictEqual(subscriptions.length, 3)
    for (const subscription of subscriptions) {subscription.dispose()}
  })

  test('the selector targets koishi.yml only', () => {
    const selector = KOISHI_YML_SELECTOR as Array<Record<string, string>>
    assert.ok(selector.some((s) => s.pattern === '**/koishi.yml'))
    assert.ok(selector.every((s) => s.language === 'yaml'))
  })
})

suite('KoishiCompletionProvider', () => {
  test('offers root fields on an empty document', async () => {
    await withKoishiFile('', async (document) => {
      const items = await completion.provideCompletionItems(
        document,
        new vscode.Position(0, 0),
      )
      const labels = items.map((i) => String(i.label))
      assert.ok(labels.includes('plugins'))
      assert.ok(labels.includes('delay'))
      assert.ok(labels.includes('host'))
    })
  })

  test('offers only the fields valid at the cursor level', async () => {
    const text = 'delay:\n  \n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
          new vscode.Position(1, 2),
      )
      const labels = items.map((i) => String(i.label))
      assert.ok(labels.includes('cancel'), 'expected delay fields')
      assert.ok(!labels.includes('host'), 'root fields do not belong under delay')
    })
  })

  test('offers plugin names inside the plugins block', async () => {
    const text = 'plugins:\n  \n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
          new vscode.Position(1, 2),
      )
      const labels = items.map((i) => String(i.label))
      assert.ok(labels.includes('adapter-qq'))
      assert.ok(labels.includes('console'))
      // Plugin names are not config fields.
      assert.ok(!labels.includes('delay'))
    })
  })

  test('plugin items carry the npm package name as detail', async () => {
    const text = 'plugins:\n  \n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
          new vscode.Position(1, 2),
      )
      const qq = items.find((i) => String(i.label) === 'adapter-qq')
      assert.ok(qq)
      assert.ok(String(qq?.detail).includes('@koishijs/plugin-adapter-qq'))
    })
  })

  test('offers enum values on the value side of a field', async () => {
    const text = 'prefixMode: \n'
    await withKoishiFile(text, async (document) => {
        // The cursor sits in the empty value slot, just past the `: `.
        const items = await completion.provideCompletionItems(
          document,
          new vscode.Position(0, 'prefixMode: '.length),
        )
        const labels = items.map((i) => String(i.label))
        assert.deepStrictEqual(labels.sort(), ['auto', 'strict'])
      })
    })

  test('does not offer enum values while typing the key', async () => {
    const text = 'prefixMode\n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
        new vscode.Position(0, text.length - 1),
      )
      const labels = items.map((i) => String(i.label))
      assert.ok(!labels.includes('auto'))
      assert.ok(!labels.includes('strict'))
    })
  })

  test('nested enum values are offered with their descriptions', async () => {
    const text = 'i18n:\n  output: \n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
        new vscode.Position(1, '  output: '.length),
      )
      const labels = items.map((i) => String(i.label)).sort()
      assert.deepStrictEqual(labels, ['prefer-channel', 'prefer-user'])

        const preferUser = items.find((i) => String(i.label) === 'prefer-user')
        assert.strictEqual(preferUser?.detail, "Prefer the user's locale")
      })
    })

  test('field items document themselves', async () => {
    const text = 'delay:\n  \n'
    await withKoishiFile(text, async (document) => {
      const items = await completion.provideCompletionItems(
        document,
          new vscode.Position(1, 2),
      )
      const cancel = items.find((i) => String(i.label) === 'cancel')
      assert.ok(cancel?.detail, 'expected a type hint')
    })
  })

  test('the completion range covers only the typed word', async () => {
      // A partially typed plugin name, exactly as it appears mid-edit.
      const text = 'plugins:\n  ada\n'
      await withKoishiFile(text, async (document) => {
        const items = await completion.provideCompletionItems(
          document,
          new vscode.Position(1, '  ada'.length),
        )
        const qq = items.find((i) => String(i.label) === 'adapter-qq')
        assert.ok(qq, 'expected plugin suggestions for a partial name')
        const range = qq?.range as vscode.Range
        assert.ok(range)
        // Only `ada` is replaced, so the indentation survives acceptance.
        assert.strictEqual(range.start.character, 2)
        assert.strictEqual(range.end.character, 5)
      })
    })

    test('a partial plugin name still resolves to the plugins level', async () => {
      const text = 'plugins:\n  ada\n'
      await withKoishiFile(text, async (document) => {
        const items = await completion.provideCompletionItems(
          document,
          new vscode.Position(1, '  ada'.length),
        )
        const labels = items.map((i) => String(i.label))
        assert.ok(labels.includes('adapter-qq'))
      })
    })
})

suite('KoishiHoverProvider', () => {
  test('documents a config field', async () => {
    const text = 'delay:\n  cancel: 0\n'
    await withKoishiFile(text, async (document) => {
        const value = hoverText(await hover.provideHover(
        document,
        new vscode.Position(1, '  cancel'.length - 1),
        ))
        assert.ok(value.includes('The delay for canceling messages'))
      })
    })

    test('shows the type and enum for an enum field', async () => {
      const text = 'prefixMode: auto\n'
      await withKoishiFile(text, async (document) => {
        const value = hoverText(await hover.provideHover(
          document,
          new vscode.Position(0, 'prefixMode'.length - 1),
        ))
        assert.ok(value.includes('auto'))
        assert.ok(value.includes('strict'))
        assert.ok(value.includes('Type: `string`'))
      })
    })

    test('maps a plugin name to its npm package', async () => {
      const text = 'plugins:\n  adapter-qq:\n'
      await withKoishiFile(text, async (document) => {
        const value = hoverText(await hover.provideHover(
          document,
          new vscode.Position(1, '  adapter-qq'.length - 1),
        ))
        assert.ok(value.includes('@koishijs/plugin-adapter-qq'))
        assert.ok(value.includes('adapter'))
      })
    })

    test('reports a value constraint', async () => {
      const text = 'port: 5140\n'
      await withKoishiFile(text, async (document) => {
        const value = hoverText(await hover.provideHover(
          document,
          new vscode.Position(0, 'port'.length - 1),
        ))
        assert.ok(value.includes('Type: `integer`'))
        assert.ok(value.includes('min 0'))
      })
    })

    test('documents a field by hovering its value', async () => {
      const text = 'port: 5140\n'
      await withKoishiFile(text, async (document) => {
        const value = hoverText(await hover.provideHover(
          document,
          new vscode.Position(0, 'port: 51'.length - 1),
        ))
        assert.ok(value.includes('The port of the server'))
      })
    })
})

suite('KoishiDefinitionProvider', () => {
  test('has no definition for an uninstalled plugin', async () => {
    const text = 'plugins:\n  adapter-qq:\n'
    await withKoishiFile(text, async (document) => {
      const result = await definition.provideDefinition(
        document,
        new vscode.Position(1, '  adapter-qq'.length - 1),
      )
      assert.strictEqual(result, null)
    })
  })

  test('jumps to an installed plugin manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'koishi-ws-'))
    const dir = path.join(root, 'node_modules', 'koishi-plugin-pets')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'koishi-plugin-pets', version: '1.0.0', koishi: {} }),
      'utf-8',
    )

    try {
      const file = path.join(root, 'koishi.yml')
      fs.writeFileSync(file, 'plugins:\n  pets:\n', 'utf-8')
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))

      // No workspace folder owns this file, so discovery falls back to its root.
      const result = await definition.provideDefinition(
        document,
        new vscode.Position(1, '  pets'.length - 1),
      )

      assert.ok(result, 'expected a definition for an installed plugin')
      const location = result as vscode.Location
      assert.ok(location.uri.fsPath.endsWith(path.join('node_modules', 'koishi-plugin-pets', 'package.json')))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
