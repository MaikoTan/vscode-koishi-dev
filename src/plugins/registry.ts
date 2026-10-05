/**
 * A plugin that can be referenced by name in the `plugins` block of `koishi.yml`.
 *
 * `configName` is the key a user types; `packageName` is what they install.
 */
export interface PluginInfo {
  /** The key used under `plugins:` in `koishi.yml`. */
  configName: string
  /** npm package name, as installed. */
  packageName: string
  /** Short summary shown in completion details and on hover. */
  description?: string
  /** Services the plugin requires, from its `koishi.service` field. */
  required?: string[]
  /** Services the plugin provides, from its `koishi.service.implements`. */
  implements?: string[]
  /** Local path to the installed `package.json`, when the plugin is resolvable. */
  manifestPath?: string
}

/**
 * Converts an npm package name into the config key used in `koishi.yml`.
 *
 * Koishi resolves plugin names by stripping the conventional prefixes, so
 * `koishi-plugin-adapter-qq`, `@koishijs/plugin-adapter-qq` and
 * `@koishijs/adapter-qq` all become `adapter-qq`. Packages outside those
 * conventions are returned unchanged, since users may alias them explicitly.
 */
export function toConfigName(packageName: string): string {
  let name = packageName
  if (name.startsWith('@')) {
    // Scoped: drop the scope, then the `plugin-` prefix if present.
    const slash = name.indexOf('/')
    if (slash !== -1) {name = name.slice(slash + 1)}
  }
  name = name.replace(/^koishi-plugin-/, '')
  name = name.replace(/^plugin-/, '')
  return name
}

/**
 * Officially maintained plugins, bundled with the extension.
 *
 * This is a static snapshot rather than a live registry query: completion must
 * work offline and instantly, and an online lookup on every keystroke would make
 * the extension slow and flaky. Plugins installed in the user's workspace are
 * merged on top of this list (see `PluginResolver`), so anything newer than this
 * snapshot still shows up.
 */
export const BUNDLED_PLUGINS: PluginInfo[] = [
  {
    configName: 'adapter-discord',
    packageName: '@koishijs/plugin-adapter-discord',
    description: 'Discord Adapter',
    implements: ['adapter'],
  },
  {
    configName: 'adapter-kook',
    packageName: '@koishijs/plugin-adapter-kook',
    description: 'KOOK Adapter',
    implements: ['adapter'],
  },
  {
    configName: 'adapter-qq',
    packageName: '@koishijs/plugin-adapter-qq',
    description: 'QQ Adapter',
    implements: ['adapter'],
  },
  {
    configName: 'adapter-satori',
    packageName: '@koishijs/plugin-adapter-satori',
    description: 'Satori Adapter',
    implements: ['adapter'],
  },
  {
    configName: 'adapter-telegram',
    packageName: '@koishijs/plugin-adapter-telegram',
    description: 'Telegram Adapter',
    implements: ['adapter'],
  },
  {
    configName: 'admin',
    packageName: '@koishijs/plugin-admin',
    description: 'User administration and permission management',
    required: ['database'],
    implements: ['service'],
  },
  {
    configName: 'analytics',
    packageName: '@koishijs/plugin-analytics',
    description: 'Built-in analytics',
    implements: ['service'],
  },
  {
    configName: 'auth',
    packageName: '@koishijs/plugin-auth',
    description: 'User authentication and registration',
    required: ['database'],
    implements: ['service'],
  },
  {
    configName: 'commands',
    packageName: '@koishijs/plugin-commands',
    description: 'Built-in command management',
    implements: ['service'],
  },
  {
    configName: 'config',
    packageName: '@koishijs/plugin-config',
    description: 'Web configuration interface',
    implements: ['service'],
  },
  {
    configName: 'console',
    packageName: '@koishijs/plugin-console',
    description: 'Koishi Console web UI',
    implements: ['service'],
  },
  {
    configName: 'database-memory',
    packageName: '@koishijs/plugin-database-memory',
    description: 'In-memory database implementation',
    implements: ['database'],
  },
  {
    configName: 'database-sqlite',
    packageName: '@koishijs/plugin-database-sqlite',
    description: 'SQLite database implementation',
    implements: ['database'],
  },
  {
    configName: 'help',
    packageName: '@koishijs/plugin-help',
    description: 'Automatic help for commands',
    required: ['command'],
  },
  {
    configName: 'hmr',
    packageName: '@koishijs/plugin-hmr',
    description: 'Hot module replacement for development',
    implements: ['service'],
  },
  {
    configName: 'insight',
    packageName: '@koishijs/plugin-insight',
    description: 'View and analyze message history',
    required: ['database'],
  },
  {
    configName: 'locales',
    packageName: '@koishijs/plugin-locales',
    description: 'Manage locales for plugins and bots',
    implements: ['service'],
  },
  {
    configName: 'logger',
    packageName: '@koishijs/plugin-logger',
    description: 'Record and view log messages',
    implements: ['service'],
  },
  {
    configName: 'market',
    packageName: '@koishijs/plugin-market',
    description: 'Koishi Plugin Marketplace',
    implements: ['service'],
  },
  {
    configName: 'mock',
    packageName: '@koishijs/plugin-mock',
    description: 'Mock bots for development and testing',
  },
  {
    configName: 'notifier',
    packageName: '@koishijs/plugin-notifier',
    description: 'Send notifications to bot owners',
  },
  {
    configName: 'sandbox',
    packageName: '@koishijs/plugin-sandbox',
    description: 'Render custom elements as images',
    implements: ['service'],
  },
  {
    configName: 'server',
    packageName: '@koishijs/plugin-server',
    description: 'HTTP server for Koishi',
    implements: ['server'],
  },
  {
    configName: 'server-proxy',
    packageName: '@koishijs/plugin-server-proxy',
    description: 'Proxy HTTP requests through the Koishi server',
    required: ['server'],
  },
  {
    configName: 'server-satori',
    packageName: '@koishijs/plugin-server-satori',
    description: 'Satori server support',
    required: ['server', 'adapter'],
  },
  {
    configName: 'status',
    packageName: '@koishijs/plugin-status',
    description: 'Track bot status and latency',
  },
]
