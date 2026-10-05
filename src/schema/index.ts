import * as fs from 'fs'
import * as path from 'path'

import { PathSegment, SchemaNode, ValueShape } from './types'

/** Root schema describing the whole `koishi.yml` document. */
export const KOISHI_YML_SCHEMA_PATH = path.join(__dirname, '../../schemata/koishi-yml.json')

/**
 * Merges several schema nodes that all apply at the same location.
 *
 * Keywords that describe the value itself (`type`, `enum`, `default`, …) are
 * overridden by the first node that defines them, while descriptive and nested
 * keywords (`description`, `properties`, `items`, …) are unioned so callers can
 * see every branch of an `anyOf`/`oneOf`.
 */
function mergeNodes(nodes: (SchemaNode | undefined)[]): SchemaNode {
  const present = nodes.filter((node): node is SchemaNode => !!node)
  if (present.length === 0) {return {}}
  if (present.length === 1) {return present[0]}

  const merged: SchemaNode = {}
  const nestedKeys = [
      'properties',
      'patternProperties',
      'enum',
      'enumDescriptions',
      'required',
      'allOf',
      'anyOf',
      'oneOf',
    ]

  for (const node of present) {
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined) {continue}

        // `type` may be a string or a list, so it is normalized before merging —
        // otherwise concatenating onto a string value throws.
        if (key === 'type') {
          const types = (Array.isArray(value) ? value : [value]) as string[]
          merged.type = [...new Set([...(merged.type as string[] | undefined ?? []), ...types])]
          continue
        }

        if (nestedKeys.includes(key)) {
          if (Array.isArray(value)) {
            const list = ((merged[key] as unknown[]) ?? []) as unknown[]
            list.push(...value)
            merged[key] = list
          } else if (typeof value === 'object') {
            const record = ((merged[key] as Record<string, unknown>) ?? {}) as Record<string, unknown>
            Object.assign(record, value)
            merged[key] = record
          } else {
            merged[key] = value
          }
          continue
        }
        if (!(key in merged)) {merged[key] = value}
      }
    }
  return merged
}

/** Normalizes the `type` keyword, which may be a string or a list of strings. */
function typeOf(node: SchemaNode): string | undefined {
  const { type } = node
  if (typeof type === 'string') {return type}
  if (Array.isArray(type)) {return type.find((item) => item !== 'null')}
  return undefined
}

/** Flattens combinator branches so callers do not have to recurse themselves. */
function branchesOf(node: SchemaNode): SchemaNode[] {
  const combinators = [...(node.allOf ?? []), ...(node.anyOf ?? []), ...(node.oneOf ?? [])]
  return combinators.flatMap((branch) => [branch, ...branchesOf(branch)])
}

/**
 * Navigates a JSON Schema by a config path.
 *
 * The bundled schemata are hand-written and fairly flat, but this intentionally
 * understands `patternProperties`, tuple/array `items` and combinators so that
 * adding a richer schema later does not silently break completion.
 */
export class SchemaIndex {
  constructor(private readonly root: SchemaNode) {}

  /**
     * Loads a schema from a JSON file on disk.
     *
     * The schemata are generated from `schemata/*.yaml` by `yarn run convert` and
     * are gitignored, so a missing file means the conversion step was skipped. Say
     * so, rather than letting `require` fail with a bare module error.
     */
    static fromFile(file: string): SchemaIndex {
      const resolved = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file)
      if (!fs.existsSync(resolved)) {
        throw new Error(
          `Schema not found: ${resolved}\n`
          + 'The schemata are generated from the .yaml sources. Run `yarn run convert` first.',
        )
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return new SchemaIndex(require(resolved) as SchemaNode)
    }

  get rootSchema(): SchemaNode {
    return this.root
  }

  /** The schema node that applies at `segments`, or `undefined` if unconstrained. */
  resolve(segments: PathSegment[]): SchemaNode | undefined {
    let current: SchemaNode = this.root
    for (const segment of segments) {
      const next = this.childOf(current, segment)
      if (!next) {return undefined}
      current = next
    }
    return current
  }

  /** Every schema node that constrains the value at `segments`. */
  resolveAll(segments: PathSegment[]): SchemaNode[] {
    const direct = this.resolve(segments)
    if (!direct) {return []}
    return [direct, ...branchesOf(direct)]
  }

  /** Follows one path segment from a schema node. */
  private childOf(node: SchemaNode, segment: PathSegment): SchemaNode | undefined {
    const candidates = this.candidatesOf(node, segment)
    return candidates.length ? mergeNodes(candidates) : undefined
  }

  /** All schema nodes describing `segment` inside `node` (before merging). */
  private candidatesOf(node: SchemaNode, segment: PathSegment): SchemaNode[] {
    const found: SchemaNode[] = []

    for (const branch of [node, ...branchesOf(node)]) {
      if (typeof segment === 'number') {
        const { items } = branch
        if (Array.isArray(items)) {
          const entry = items[segment]
          if (entry) {found.push(entry)}
        } else if (items) {
          found.push(items)
        }
        continue
      }

      const named = branch.properties?.[segment]
      if (named) {found.push(named)}

      for (const [pattern, value] of Object.entries(branch.patternProperties ?? {})) {
        try {
          if (new RegExp(pattern).test(segment)) {found.push(value)}
        } catch {
          // Ignore malformed patterns rather than failing the whole request.
        }
      }
    }
    return found
  }

  /**
   * Property names valid under `segments`.
   *
   * Returns declarations in schema order so completion keeps a stable, readable
   * ranking instead of an arbitrary alphabetical one.
   */
  propertiesOf(segments: PathSegment[]): Array<{ name: string; schema: SchemaNode }> {
    const parent = this.resolve(segments)
    if (!parent) {return []}

    const seen = new Set<string>()
    const result: Array<{ name: string; schema: SchemaNode }> = []

    for (const branch of [parent, ...branchesOf(parent)]) {
      for (const [name, schema] of Object.entries(branch.properties ?? {})) {
        if (seen.has(name)) {continue}
        seen.add(name)
        result.push({ name, schema })
      }
    }
    return result
  }

  /**
   * Pattern-constrained property names under `segments`.
   *
   * `package.json`'s localized `koishi.description` is the motivating case: it has
   * no enumerable keys, so the completions have to come from the patterns.
   */
  patternPropertiesOf(segments: PathSegment[]): Array<{ pattern: string; schema: SchemaNode }> {
    const parent = this.resolve(segments)
    if (!parent) {return []}

    const seen = new Set<string>()
    const result: Array<{ pattern: string; schema: SchemaNode }> = []

    for (const branch of [parent, ...branchesOf(parent)]) {
      for (const [pattern, schema] of Object.entries(branch.patternProperties ?? {})) {
        if (seen.has(pattern)) {continue}
        seen.add(pattern)
        result.push({ pattern, schema })
      }
    }
    return result
  }

  /** Enum values allowed at `segments`, merged across combinator branches. */
    enumAt(segments: PathSegment[]): Array<{ value: unknown; description?: string }> {
      const values: unknown[] = []
      const descriptions: string[] = []

      for (const node of this.resolveAll(segments)) {
        if (!node.enum) {continue}
        for (const [index, value] of node.enum.entries()) {
          values.push(value)
          descriptions.push(node.enumDescriptions?.[index] ?? '')
        }
      }

      return values.map((value, index) => ({
        value,
        description: descriptions[index] || undefined,
      }))
    }

  /** The value shape expected at `segments`. */
  shapeAt(segments: PathSegment[]): ValueShape {
    const node = this.resolve(segments)
    if (!node) {return 'unknown'}
    const type = typeOf(node)
    switch (type) {
      case 'boolean': return 'boolean'
      case 'number': return 'number'
      case 'integer': return 'integer'
      case 'string': return 'string'
      case 'array': return 'array'
      case 'object': return 'object'
      case 'null': return 'null'
      default: return 'unknown'
    }
  }

  /** Human-readable type label used in hover and completion details. */
  typeLabelAt(segments: PathSegment[]): string | undefined {
    const node = this.resolve(segments)
    if (!node) {return undefined}
    const { type } = node
    if (typeof type === 'string') {return type}
    if (Array.isArray(type)) {return type.join(' | ')}
    return undefined
  }
}
