/**
 * The subset of JSON Schema (draft-07) used by the bundled Koishi schemas.
 *
 * The schemata are authored in YAML and converted to JSON by `scripts/convert.ts`,
 * so everything here is plain JSON data with no runtime validation needed.
 */
export interface SchemaNode {
  type?: string | string[]
  title?: string
  description?: string
  markdownDescription?: string

  properties?: Record<string, SchemaNode>
  patternProperties?: Record<string, SchemaNode>
  additionalProperties?: boolean | SchemaNode
  required?: string[]

  items?: SchemaNode | SchemaNode[]
  enum?: unknown[]
  enumDescriptions?: string[]
  default?: unknown

  minimum?: number
  maximum?: number
  maxLength?: number

  allOf?: SchemaNode[]
  anyOf?: SchemaNode[]
  oneOf?: SchemaNode[]
  $ref?: string

  [keyword: string]: unknown
}

/** A single config path segment: an object key, or an array index. */
export type PathSegment = string | number

/** What a schema node allows as its value, used to rank completion candidates. */
export type ValueShape =
  | 'boolean'
  | 'number'
  | 'integer'
  | 'string'
  | 'array'
  | 'object'
  | 'null'
  | 'unknown'
