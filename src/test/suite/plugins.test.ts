import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { PluginResolver, discoverInstalledPlugins, pluginNameAt, toConfigName } from '../../plugins/resolver'

/** One fake installed package: its directory name and its `package.json`. */
interface FixturePackage {
  name: string
  manifest: unknown
}

/** Builds a throwaway project with a fake `node_modules`. */
function fixture(packages: FixturePackage[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'koishi-plugins-'))
  for (const { name, manifest } of packages) {
    const dir = path.join(root, 'node_modules', name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
  }
  return root
}

suite('toConfigName', () => {
  test('strips the koishi-plugin- prefix', () => {
    assert.strictEqual(toConfigName('koishi-plugin-pets'), 'pets')
  })

  test('strips the scope and plugin- prefix', () => {
    assert.strictEqual(toConfigName('@koishijs/plugin-adapter-qq'), 'adapter-qq')
  })

  test('leaves unrelated names alone', () => {
    assert.strictEqual(toConfigName('koishi-core'), 'koishi-core')
  })
})

suite('pluginNameAt', () => {
  test('accepts the plugin key itself', () => {
    assert.strictEqual(pluginNameAt(['plugins', 'console']), 'console')
  })

  test('accepts a path below the plugin key', () => {
    assert.strictEqual(pluginNameAt(['plugins', 'console', 'show']), 'console')
  })

  test('rejects a non-plugin path', () => {
    assert.strictEqual(pluginNameAt(['delay', 'cancel']), undefined)
  })
})

suite('discoverInstalledPlugins', () => {
  const roots: string[] = []

  teardown(() => {
    for (const root of roots) {fs.rmSync(root, { recursive: true, force: true })}
    roots.length = 0
  })

  test('finds a package declaring a koishi field', () => {
      const root = fixture([{
        name: 'koishi-plugin-pets',
        manifest: { name: 'koishi-plugin-pets', koishi: { description: { en: 'Pets' } } },
      }])
      roots.push(root)

      const found = discoverInstalledPlugins(root)
      assert.strictEqual(found.length, 1)
      assert.strictEqual(found[0].configName, 'pets')
      assert.strictEqual(found[0].description, 'Pets')
      assert.ok(found[0].manifestPath?.endsWith('package.json'))
    })

    test('descends into scoped packages', () => {
      const root = fixture([{
        name: '@koishijs/plugin-adapter-qq',
        manifest: { name: '@koishijs/plugin-adapter-qq', koishi: {} },
      }])
      roots.push(root)

      const found = discoverInstalledPlugins(root)
      assert.strictEqual(found.length, 1)
      assert.strictEqual(found[0].configName, 'adapter-qq')
    })

    test('ignores packages without a koishi field', () => {
      const root = fixture([
        { name: 'typescript', manifest: { name: 'typescript' } },
        { name: 'lodash', manifest: { name: 'lodash' } },
      ])
      roots.push(root)

      assert.deepStrictEqual(discoverInstalledPlugins(root), [])
    })

    test('reads declared services', () => {
      const root = fixture([{
        name: 'koishi-plugin-admin',
        manifest: {
          name: 'koishi-plugin-admin',
          koishi: { service: { required: ['database'], implements: ['service'] } },
        },
      }])
      roots.push(root)

      const found = discoverInstalledPlugins(root)
      assert.deepStrictEqual(found[0].required, ['database'])
      assert.deepStrictEqual(found[0].implements, ['service'])
    })

  test('a missing node_modules yields no plugins', () => {
    assert.deepStrictEqual(discoverInstalledPlugins(path.join(os.tmpdir(), 'koishi-absent-dir')), [])
  })

    test('finds a symlinked plugin', function () {
      // `yarn link` / `npm link` is how Koishi plugins are developed locally, so a
      // linked package must be offered just like an installed one.
      const source = fixture([{
        name: 'koishi-plugin-linked',
        manifest: { name: 'koishi-plugin-linked', koishi: {} },
      }])
      roots.push(source)

      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'koishi-linked-'))
      roots.push(root)
      const link = path.join(root, 'node_modules', 'koishi-plugin-linked')

      try {
        fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
        fs.symlinkSync(path.join(source, 'node_modules', 'koishi-plugin-linked'), link, 'junction')
      } catch {
        // Creating links can require elevation on Windows; skip rather than fail.
        this.skip()
        return
      }

      const found = discoverInstalledPlugins(root)
      assert.strictEqual(found.length, 1)
      assert.strictEqual(found[0].configName, 'linked')
    })
  })

suite('PluginResolver', () => {
  const roots: string[] = []

  teardown(() => {
    for (const root of roots) {fs.rmSync(root, { recursive: true, force: true })}
    roots.length = 0
  })

  test('offers bundled plugins with no workspace', () => {
    const names = new PluginResolver().all([]).map((p) => p.configName)
    assert.ok(names.includes('adapter-qq'))
    assert.ok(names.includes('console'))
  })

  test('workspace plugins are merged over the bundled snapshot', () => {
      const root = fixture([{
        name: 'koishi-plugin-pets',
        manifest: { name: 'koishi-plugin-pets', koishi: { description: { en: 'Pets' } } },
      }])
      roots.push(root)

    const found = new PluginResolver().all([root])
    const pets = found.find((p) => p.configName === 'pets')
    assert.ok(pets, 'expected the installed plugin to be offered')
    assert.strictEqual(pets?.description, 'Pets')
    // Bundled entries survive alongside the discovered one.
    assert.ok(found.some((p) => p.configName === 'adapter-qq'))
  })

  test('an installed plugin wins over the bundled entry', () => {
      const root = fixture([{
        name: '@koishijs/plugin-adapter-qq',
        manifest: {
          name: '@koishijs/plugin-adapter-qq',
          koishi: { description: { en: 'Local override' } },
        },
      }])
      roots.push(root)

    const qq = new PluginResolver().all([root]).find((p) => p.configName === 'adapter-qq')
    assert.strictEqual(qq?.description, 'Local override')
  })

  test('finds a single plugin by config name', () => {
    assert.strictEqual(new PluginResolver().find('adapter-qq', [])?.packageName, '@koishijs/plugin-adapter-qq')
  })

  test('the manifest path is only set for installed plugins', () => {
    const resolver = new PluginResolver()
    assert.strictEqual(resolver.find('adapter-qq', [])?.manifestPath, undefined)
  })
})
