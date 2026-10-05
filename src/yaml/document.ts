import { parseDocument, Scalar, YAMLMap, YAMLSeq, type Document, type Node, type Pair } from 'yaml'

import type { PathSegment } from '../schema/types'

/** Context describing where the cursor sits inside a `koishi.yml` document. */
export interface CursorContext {
  /**
   * Config path the cursor resolves to.
   *
   * For a value this is the value's own path (`['delay', 'cancel']`); for a key
   * it is the path *of that key* (`['delay']` when sitting on `delay:`), which is
   * what lets hover document the field the cursor is on rather than its parent.
   */
  path: PathSegment[]
  /**
   * Path of the map whose keys are being completed.
   *
   * This is the mapping that directly contains the cursor, so it is where a new
   * key would be legal: `['delay']` inside `delay:`, and `[]` at the root.
   */
  parentPath: PathSegment[]
  /**
   * True when the cursor is on a key rather than a value.
   *
   * Decides whether suggestions are field names or enum values, and whether
   * `path` already includes the key the cursor is on.
   */
  onKey: boolean
  /** The partially typed word, used to filter and to place the caret. */
  word: { text: string; start: number; end: number }
}

const IDENTIFIER = /[A-Za-z0-9_$@-]/

/** The unquoted/plain text token surrounding `offset`, plus its range. */
export function wordAt(text: string, offset: number): CursorContext['word'] {
  let start = offset
  let end = offset
  while (start > 0 && IDENTIFIER.test(text[start - 1])) {start -= 1}
  while (end < text.length && IDENTIFIER.test(text[end])) {end += 1}
  return { text: text.slice(start, end), start, end }
}

function contains(node: Node | Pair, offset: number): boolean {
  if (!('range' in node) || !node.range) {return false}
  const [start, valueEnd, nodeEnd] = node.range
  return offset >= start && offset <= (nodeEnd ?? valueEnd ?? start)
}

/**
 * True when `offset` sits in the value slot of `key`, i.e. past the `:` that
 * terminates it.
 *
 * A pair whose value is still empty has no value node covering the text after
 * the colon, so without this check the cursor in `prefixMode: |` looks like it
 * is inside the pair but not inside the key — indistinguishable from a new
 * sibling key being typed. That distinction decides whether enum values or
 * field names should be offered.
 */
function inValueSlot(text: string, key: Scalar | null, offset: number): boolean {
  if (!key?.range) {return false}
  // A scalar's range includes the `: ` that terminates it, so step back over any
  // trailing colon before deciding whether the cursor has cleared the key.
  let keyEnd = key.range[1]
  while (keyEnd > 0 && (text[keyEnd - 1] === ':' || text[keyEnd - 1] === ' ')) {
    keyEnd -= 1
  }
  return offset > keyEnd
}

interface NodeLocation {
  /**
   * Config path the cursor resolves to — the value's path, or the key's own path
   * when the cursor is on a key.
   */
  path: PathSegment[]
  /** Config path of the map directly containing the cursor. */
  mapPath: PathSegment[]
  /** Whether the cursor landed on a key rather than a value. */
  onKey: boolean
}

/**
 * Walks the YAML AST to find the innermost node containing `offset`.
 *
 * `valuePrefix` is the config path of `node` itself; `mapPrefix` is the path of
 * the mapping that directly contains it. Descending into a container's children
 * always passes the container's own path as their `mapPrefix`, which is what
 * separates "the value under the cursor" (`['delay', 'cancel']`) from "the level
 * whose keys are legal here" (`['delay']`).
 */
function locate(
  text: string,
  node: Node | Pair | null,
  offset: number,
  valuePrefix: PathSegment[],
  mapPrefix: PathSegment[],
): NodeLocation | null {
  if (!node || !contains(node, offset)) {return null}

  if (node instanceof YAMLMap) {
    for (const item of node.items) {
      const key = item.key as Scalar | null
      const pairPath = [...valuePrefix, key ? String(key.value) : '']

      if (key && contains(key, offset)) {
        // On a key: `path` is that key's own path, so hovering `cancel:`
        // documents `cancel` rather than the `delay` map containing it.
        return { path: pairPath, mapPath: valuePrefix, onKey: true }
      }

      const inside = locate(text, item.value as Node | null, offset, pairPath, valuePrefix)
      if (inside) {return inside}

      // Inside the pair but not inside its value. This covers the `-` of a
      // sequence entry and the key slot itself. A cursor in the empty value
      // slot after `key:` is excluded so it keeps enum completion.
      if (contains(item, offset) && !inValueSlot(text, key, offset)) {
        return { path: pairPath, mapPath: valuePrefix, onKey: true }
      }
    }
    // Inside this mapping but not inside any pair: a new key is being typed here.
    return { path: valuePrefix, mapPath: valuePrefix, onKey: true }
      }

      if (node instanceof YAMLSeq) {
        for (const [index, item] of node.items.entries()) {
                  const inside = locate(text, item as Node | null, offset, [...valuePrefix, index], valuePrefix)
          if (inside) {return inside}
        }
        return { path: valuePrefix, mapPath: valuePrefix, onKey: false }
      }

      // Scalars, and pairs whose value is still empty (`key:` with nothing after it).
      return { path: valuePrefix, mapPath: mapPrefix, onKey: false }
    }

/**
 * The indentation of the line containing `offset`, ignoring blank lines.
 */
function indentOfLineAt(text: string, offset: number): number {
  const start = text.lastIndexOf('\n', offset - 1) + 1
  let indent = 0
  while (start + indent < text.length && text[start + indent] === ' ') {indent += 1}
  return indent
}

/**
 * The config key declared on `line`, if that line opens a block.
 *
 * Only lines with nothing but a key and a trailing `:` count, because a line
 * like `selfUrl: http://koishi.chat` is a scalar assignment, not a block. Treating
 * it as a block would make `selfUrl` look like the enclosing mapping of whatever
 * the user types next.
 */
function keyOnLine(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) {return undefined}
  if (!trimmed.endsWith(':')) {return undefined}

  const key = trimmed.slice(0, -1).trim()
  // A bare `- key:` still opens a block, but the dash is not part of the key.
  return key && !key.includes(':') ? key : undefined
}

/**
 * Resolves the cursor to a config path when the AST alone cannot.
 *
 * A key with an empty block (`delay:` followed by nothing, or by a blank line)
 * produces no YAML node covering the position where the next key will be typed,
 * so the AST walk gives up and the parent path comes back empty. That is exactly
 * the position where field completion matters most, so this falls back to
 * indentation: the nearest preceding key that is indented less than the cursor
 * line is the enclosing block.
 */
function pathFromIndentation(
  text: string,
  offset: number,
): PathSegment[] | undefined {
  const indent = indentOfLineAt(text, offset)
  const path: PathSegment[] = []
  // Running entry index per indentation, so sequence items keep their position.
  const counters = new Map<number, number>()

  // Walk backwards through the preceding lines, tracking the key stack so that
  // `plugins:\n  console:\n    <cursor>` resolves to `plugins.console`.
  const before = text.slice(0, offset).split('\n')
  const stack: Array<{ indent: number; segment: PathSegment }> = []

  for (const line of before) {
      const lineIndent = line.length - line.trimStart().length
      const entry = /^\s*-\s+/.exec(line)

      if (entry) {
        // A sequence entry: the path continues with an index, so
        // `plugins:` / `  - console` / `    <cursor>` yields `plugins[0]`.
        for (const key of [...counters.keys()]) {
          if (key >= lineIndent) {counters.delete(key)}
        }
        const index = counters.get(lineIndent) ?? 0
        counters.set(lineIndent, index + 1)

        while (stack.length && stack[stack.length - 1].indent >= lineIndent) {stack.pop()}
        stack.push({ indent: lineIndent, segment: index })
        continue
      }

      const key = keyOnLine(line)
      if (!key) {continue}
      while (stack.length && stack[stack.length - 1].indent >= lineIndent) {stack.pop()}
      stack.push({ indent: lineIndent, segment: key })
    }

    // Keep only the segments enclosing the cursor's own indentation level.
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].indent < indent) {path.unshift(stack[i].segment)}
    }
    return path.length ? path : undefined
  }

/**
 * A parsed `koishi.yml` plus the offset-to-path mapping used by all providers.
 *
 * The document is re-parsed on every request, which is cheap at the scale of a
 * config file and avoids having to track external edits ourselves.
 */
export class KoishiYamlDocument {
  private constructor(
    private readonly text: string,
    private readonly doc: Document.Parsed,
  ) {}

  static parse(text: string): KoishiYamlDocument {
    const doc = parseDocument(text, { keepSourceTokens: false })
    return new KoishiYamlDocument(text, doc)
  }

  /** Resolves the cursor position to a config path and the typed word. */
  cursorAt(offset: number): CursorContext {
    const word = wordAt(this.text, offset)
    const found = locate(this.text, this.doc.contents as Node | null, offset, [], [])
      const byIndent = pathFromIndentation(this.text, offset)

      // A bare word on its own line is ambiguous to the YAML parser: while a user
      // types `plugins:\n  ada`, `ada` parses as a *scalar value* of `plugins`
            // rather than the key it is about to become — and at the document root
            // (`delay`) it parses as a stray scalar with no parent at all.
            //
            // Neither form tells us a key is being typed, so treat any unterminated
            // word on its own line as a key. Without this, typing the very first field
            // of a file offers nothing at all.
            if (word.text && this.isKeyBeingTyped(word)) {
              const parentPath = byIndent ?? []
              // The key is not parsed yet, so build its path from the enclosing block.
              return { path: [...parentPath, word.text], parentPath, onKey: true, word }
            }

      if (!found) {
        const parentPath = byIndent ?? []
        return { path: parentPath, parentPath, onKey: true, word }
      }

      return {
        path: found.path,
        parentPath: found.mapPath,
        onKey: found.onKey,
        word,
      }
    }

    /**
     * Whether the cursor's word is an unterminated key rather than a value.
     *
         * True when no `:` precedes the word on its line, which is the shape of a key
         * the user has not finished typing. Only the text *before* the word matters:
         * a `:` typed after the cursor (`delay:`) terminates the key but does not make
         * the word a value, and a value like `http://a` must not be mistaken for a key
         * merely because it contains a colon.
         */
        private isKeyBeingTyped(word: { start: number; end: number }): boolean {
          const lineStart = this.text.lastIndexOf('\n', word.start - 1) + 1
          const before = this.text.slice(lineStart, word.start)
          // A sequence marker opens a new entry rather than continuing the parent map.
          return !before.includes(':')
        }

  /** Config path at `offset` — the value the cursor is on. */
  pathAt(offset: number): PathSegment[] {
    return this.cursorAt(offset).path
  }
}
