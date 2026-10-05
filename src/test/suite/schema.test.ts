import * as assert from 'assert'
import * as path from 'path'

import { SchemaIndex } from '../../schema'
import type { SchemaNode } from '../../schema/types'
import { KoishiYamlDocument, wordAt } from '../../yaml/document'

/** Cursor offset for the last character of `needle`. */
function offsetOf(text: string, needle: string): number {
  const at = text.indexOf(needle)
  assert.notStrictEqual(at, -1, `"${needle}" not found in fixture`)
  return at + needle.length - 1
}

const schema = SchemaIndex.fromFile(path.resolve(__dirname, '../../../schemata/koishi-yml.json'))

suite('SchemaIndex', () => {
  test('lists root fields in declaration order', () => {
    const names = schema.propertiesOf([]).map((p) => p.name)
    assert.ok(names.includes('host'))
    assert.ok(names.includes('delay'))
    assert.ok(names.indexOf('host') < names.indexOf('delay'))
  })

  test('resolves nested properties', () => {
    assert.strictEqual(schema.resolve(['delay', 'cancel'])?.type, 'integer')
    assert.strictEqual(schema.resolve(['i18n', 'locales'])?.type, 'array')
  })

  test('resolves through array items', () => {
    assert.strictEqual(schema.resolve(['prefix', 0])?.type, 'string')
    assert.strictEqual(schema.resolve(['i18n', 'locales', 0])?.type, 'string')
  })

  test('exposes enum values', () => {
    assert.deepStrictEqual(
      schema.enumAt(['prefixMode']).map((v) => v.value),
      ['auto', 'strict'],
    )
  })

  test('nested enum carries enumDescriptions', () => {
    const values = schema.enumAt(['i18n', 'output'])
    assert.deepStrictEqual(values.map((v) => v.value), ['prefer-user', 'prefer-channel'])
    assert.strictEqual(values[0].description, "Prefer the user's locale")
  })

  test('unknown path has no schema', () => {
    assert.strictEqual(schema.resolve(['nope', 'deeper']), undefined)
  })

  test('value shape drives the completion icon', () => {
    assert.strictEqual(schema.shapeAt(['autoAssign']), 'boolean')
    assert.strictEqual(schema.shapeAt(['port']), 'integer')
    assert.strictEqual(schema.shapeAt(['delay']), 'object')
    assert.strictEqual(schema.shapeAt(['prefix']), 'array')
  })
})

test('merging conflicting type keywords is order independent', () => {
  // Overlapping patternProperties both match one key, producing a bare string on
  // one branch and a list on the other. Merging must normalize rather than
  // concatenate onto a string, which would throw.
  const prefix = '^a'
  const suffix = 'c$'
  const variants: SchemaNode[][] = [
    [{ type: 'string' }, { type: ['string', 'null'] }],
    [{ type: ['string', 'null'] }, { type: 'string' }],
  ]

  for (const [prefixType, suffixType] of variants) {
    const patternProperties: Record<string, SchemaNode> = {}
    patternProperties[prefix] = prefixType
    patternProperties[suffix] = suffixType

    const schema = new SchemaIndex({
      type: 'object',
      properties: { x: { type: 'object', patternProperties } },
    })
    assert.deepStrictEqual(schema.resolve(['x', 'abc'])?.type, ['string', 'null'])
    assert.strictEqual(schema.shapeAt(['x', 'abc']), 'string')
  }
})

suite('KoishiYamlDocument', () => {
  test('a key position resolves to that key, with its parent mapping', () => {
    const text = 'delay:\n  cancel: 0\n'
    const cursor = KoishiYamlDocument.parse(text).cursorAt(offsetOf(text, 'cancel'))
      assert.deepStrictEqual(cursor.path, ['delay', 'cancel'])
    assert.deepStrictEqual(cursor.parentPath, ['delay'])
      assert.strictEqual(cursor.onKey, true)
    })

    test('a root key has no parent mapping', () => {
      const text = 'delay:\n  cancel: 0\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(offsetOf(text, 'delay'))
      assert.deepStrictEqual(cursor.path, ['delay'])
      assert.deepStrictEqual(cursor.parentPath, [])
    })

  test('a scalar resolves to its own path, with the enclosing mapping', () => {
    const text = 'delay:\n  cancel: 0\n'
    const cursor = KoishiYamlDocument.parse(text).cursorAt(offsetOf(text, ' 0') + 1)
    assert.deepStrictEqual(cursor.path, ['delay', 'cancel'])
    // `delay` is where keys are legal, not the scalar itself.
    assert.deepStrictEqual(cursor.parentPath, ['delay'])
      assert.strictEqual(cursor.onKey, false)
    })

    test('locates a plugin key position', () => {
      const text = 'plugins:\n  console:\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(offsetOf(text, 'console'))
      assert.deepStrictEqual(cursor.path, ['plugins', 'console'])
      assert.deepStrictEqual(cursor.parentPath, ['plugins'])
      assert.strictEqual(cursor.onKey, true)
    })

    test('locates a plugin option inside its own block', () => {
      const text = 'plugins:\n  console:\n    show: true\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(offsetOf(text, 'show'))
      assert.deepStrictEqual(cursor.path, ['plugins', 'console', 'show'])
      assert.deepStrictEqual(cursor.parentPath, ['plugins', 'console'])
    })

  test('array elements are indexed by number', () => {
    const text = "prefix:\n  - '#'\n  - '/'\n"
    const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf("'/'") + 2)
    assert.deepStrictEqual(cursor.path, ['prefix', 1])
  })

  test('reports the partially typed word', () => {
    const word = wordAt('prefix: pre', 11)
    assert.strictEqual(word.text, 'pre')
    assert.strictEqual(word.start, 8)
    assert.strictEqual(word.end, 11)
  })

  test('an empty document resolves to the root', () => {
    const cursor = KoishiYamlDocument.parse('').cursorAt(0)
    assert.deepStrictEqual(cursor.path, [])
    assert.strictEqual(cursor.word.text, '')
  })

  test('a blank line inside a block resolves to that block', () => {
    const text = 'delay:\n  \n'
    const cursor = KoishiYamlDocument.parse(text).cursorAt(text.length - 1)
    assert.deepStrictEqual(cursor.parentPath, ['delay'])
  })

  test('a root blank line resolves to the root', () => {
      const text = 'host: localhost\n\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(text.length)
      assert.deepStrictEqual(cursor.parentPath, [])
    })

    test('an unterminated key resolves as a key of the enclosing block', () => {
      // Mid-edit, `ada` is not yet a key: the parser reads it as a scalar value of
      // `plugins`. Indentation is what marks it as a key being typed.
      const text = 'plugins:\n  ada\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('ada') + 1)
      assert.strictEqual(cursor.onKey, true)
      assert.deepStrictEqual(cursor.parentPath, ['plugins'])
      assert.deepStrictEqual(cursor.path, ['plugins', 'ada'])
    })

    test('a value after a colon is not treated as a key', () => {
      const text = 'host: localhost\n'
      const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('localhost') + 2)
      assert.strictEqual(cursor.onKey, false)
      assert.deepStrictEqual(cursor.path, ['host'])
    })

    test('an empty value slot stays on the value side', () => {
        // The cursor right after `prefixMode: ` must be able to receive enum values.
        const text = 'prefixMode: \n'
        const cursor = KoishiYamlDocument.parse(text).cursorAt('prefixMode: '.length)
        assert.strictEqual(cursor.onKey, false)
        assert.deepStrictEqual(cursor.path, ['prefixMode'])
      })

      test('an unterminated key at the root is still a key', () => {
        // Typing the very first field of a file: there is no enclosing block, so the
        // indentation fallback has nothing to offer and the word must still read as a
        // key, or no suggestion is ever shown.
        for (const text of ['d', 'delay', 'del']) {
          const cursor = KoishiYamlDocument.parse(text).cursorAt(text.length)
          assert.strictEqual(cursor.onKey, true, `failed for ${JSON.stringify(text)}`)
          assert.deepStrictEqual(cursor.parentPath, [])
        }
      })

      test('a key followed by a newline is still a key', () => {
        // The cursor sits on the word itself, not past the line break.
        const text = 'delay\n'
        const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('delay') + 2)
        assert.strictEqual(cursor.onKey, true)
      })

      test('a value containing a colon is not read as a key', () => {
        const text = 'selfUrl: http://koishi.chat\n'
        const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('koishi'))
        assert.strictEqual(cursor.onKey, false)
        assert.deepStrictEqual(cursor.parentPath, [])
      })

      test('a sequence entry keeps its index', () => {
        const text = 'plugins:\n  - console\n    show\n'
        const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('show') + 1)
        assert.deepStrictEqual(cursor.parentPath, ['plugins', 0])
      })

      test('an array item under a config field is indexed', () => {
        const text = 'prefix:\n  - \'#\'\n  - \'/\'\n'
        const cursor = KoishiYamlDocument.parse(text).cursorAt(text.indexOf('\'/\'') + 2)
        assert.deepStrictEqual(cursor.path, ['prefix', 1])
      })
    })
