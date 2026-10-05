import * as fs from 'fs'
import * as path from 'path'

import { BUNDLED_PLUGINS, PluginInfo, toConfigName } from './registry'

/** npm's flattened layout is `node_modules/x`, `node_modules/@scope/name`, … */
const MAX_SCOPE_DEPTH = 3

interface ManifestLike {
  name?: string
  description?: string
  koishi?: {
    description?: string | Record<string, string>
    service?: {
      required?: string[]
      optional?: string[]
      implements?: string[]
    }
  }
}

function readManifest(manifestPath: string): ManifestLike | undefined {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ManifestLike
  } catch {
    // A missing or malformed package.json just means this candidate is skipped.
    return undefined
  }
}

/**
 * Builds a plugin record from an installed package's `package.json`.
 *
 * Only packages that declare a `koishi` field are considered, which is the same
 * signal Koishi itself uses to recognise a plugin, so third-party plugins and
 * unrelated dependencies do not pollute the suggestions.
 */
function fromManifest(manifestPath: string): PluginInfo | undefined {
  const manifest = readManifest(manifestPath)
  const packageName = manifest?.name
  if (!manifest || !packageName) {return undefined}
  if (!manifest.koishi) {return undefined}

  const { service } = manifest.koishi
  const description = typeof manifest.koishi.description === 'string'
    ? manifest.koishi.description
    : manifest.koishi.description?.en
      ?? manifest.koishi.description?.zh
      ?? manifest.description

  return {
    configName: toConfigName(packageName),
    packageName,
    description,
    required: service?.required,
    implements: service?.implements,
    manifestPath,
  }
}

/**
 * Lists package directories directly inside `dir`, ignoring `.bin` and dotfiles.
 *
 * Symlinks and Windows junctions are included because `yarn link` / `npm link` is
 * the normal way to develop a Koishi plugin locally, and a linked plugin is just
 * as real to the user as an installed one.
 */
function packageDirs(dir: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) =>
      (entry.isDirectory() || entry.isSymbolicLink())
      && !entry.name.startsWith('.')
      && entry.name !== '.bin')
    .map((entry) => entry.name)
}

/**
 * Finds Koishi plugins installed under a project root.
 *
 * Scans `node_modules` for packages declaring a `koishi` field, descending into
 * scoped directories. Results are cached per root because `node_modules` of a
 * real Koishi project is large and rescanning it on every keystroke would be
 * noticeable.
 */
export function discoverInstalledPlugins(root: string): PluginInfo[] {
  const nodeModules = path.join(root, 'node_modules')
  const found: PluginInfo[] = []
  const seen = new Set<string>()

  const visit = (dir: string, depth: number): void => {
    if (depth > MAX_SCOPE_DEPTH) {return}

    for (const name of packageDirs(dir)) {
      const full = path.join(dir, name)
      const plugin = fromManifest(path.join(full, 'package.json'))
      if (plugin && !seen.has(plugin.packageName)) {
        seen.add(plugin.packageName)
        found.push(plugin)
      }
      // Scoped packages nest one level deeper: `node_modules/@scope/name`.
      if (name.startsWith('@')) {visit(full, depth + 1)}
    }
  }

  visit(nodeModules, 0)
  return found
}

/**
 * Supplies plugin names for completion, hover and go-to-definition.
 *
 * Combines the bundled snapshot of official plugins with whatever is installed
 * in the workspace containing the edited file, preferring the installed metadata
 * so hover reflects the version the user actually depends on.
 */
export class PluginResolver {
  private readonly cache = new Map<string, PluginInfo[]>()

  /**
   * All known plugins, workspace-installed ones first so they win on conflicts.
   *
   * @param roots workspace folders to scan; normally just the one owning the file.
   * @param refresh re-scan `node_modules` instead of using the cache.
   */
  all(roots: string[], refresh = false): PluginInfo[] {
    const merged = new Map<string, PluginInfo>()

    for (const plugin of BUNDLED_PLUGINS) {
      merged.set(plugin.configName, plugin)
    }

    for (const root of roots) {
      for (const plugin of this.installed(root, refresh)) {
        merged.set(plugin.configName, plugin)
      }
    }

    return [...merged.values()]
  }

  /** Looks up a single plugin by its config name. */
  find(name: string, roots: string[]): PluginInfo | undefined {
    return this.all(roots).find((plugin) => plugin.configName === name)
  }

  /** Installed plugins for a root, memoized until `refresh` is requested. */
  private installed(root: string, refresh: boolean): PluginInfo[] {
    const cached = this.cache.get(root)
    if (cached && !refresh) {return cached}

    const discovered = discoverInstalledPlugins(root)
    this.cache.set(root, discovered)
    return discovered
  }
}

/** True when `path` points at a plugin entry key inside the `plugins` block. */
export function isPluginKeyPath(path: Array<string | number>): boolean {
  return path.length === 1 && path[0] === 'plugins'
}

/**
 * The plugin name a config path refers to, or `undefined` if it is not a plugin.
 *
 * Accepts both the key itself (`['plugins', 'console']`) and anything below it
 * (`['plugins', 'console', 'show']`), so hover and go-to-definition work whether
 * the cursor is on the plugin name or on one of its options.
 */
export function pluginNameAt(path: Array<string | number>): string | undefined {
  if (!isPluginKeyPath(path.slice(0, 1))) {return undefined}
  const name = path[1]
  return typeof name === 'string' ? name : undefined
}

export { toConfigName }
export type { PluginInfo }
