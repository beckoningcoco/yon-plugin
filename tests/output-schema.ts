/**
 * 一个够用的 JSON Schema 检查器：只实现本仓库 `output.schema` 真正用到的那一小撮关键字。
 *
 * 为什么单有一层：工具的**返回值**和它**自己声明的 schema** 是两处手写的东西，而
 * TypeScript 不会替它们对账——结构类型允许「更宽的对象」赋给「更窄的接口」，多出来的
 * 字段在编译期完全合法。于是两边可以一直"看起来一致"，直到宿主按
 * `additionalProperties: false` 校验返回值，把整次调用丢掉，报的是
 * `"value.memories[0].projectId" is not a declared property`：一个字段名，而失败的是
 * 整个工具。真正跑起来只有宿主会校验，所以这里补一道，守恒的规矩是
 * 「每个工具的输出都必须落在它自己声明的 schema 里」。
 *
 * 只实现用到的关键字是刻意的：多实现的每一个，都是这个文件将来可能说谎的一处。没见过的
 * 关键字一律放行（例如 `FIELDS_SCHEMA` 的 `additionalProperties: true`），让它只回答
 * 「有没有违反」，不假装自己能证明合法性。
 */

/** 一份 schema，按本仓库的写法定（都是普通的 JSON 对象）。 */
export type OutputSchema = Record<string, unknown>

/** 一个对象值的视角，用来按键取值。 */
type Record_ = Record<string, unknown>

/**
 * 逐个列出 `value` 违反了 `schema` 的地方，路径写在每条里。
 * @param value - 工具返回的原始值。
 * @param schema - 该工具 `output.schema` 声明的形状。
 * @param path - 当前所在位置，用于让人一眼看到是哪一个字段。
 * @returns 违反项；空数组表示这个值落在它声明的形状里。
 */
export function schemaViolations(value: unknown, schema: OutputSchema, path = 'value'): string[] {
  const declared = schema.type

  if (declared === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [`${path} is not an object`]
    }
    const problems: string[] = []
    const record = value as Record_
    const properties = (schema.properties ?? {}) as Record<string, OutputSchema>
    for (const required of (schema.required as readonly string[] | undefined) ?? []) {
      if (!(required in record)) problems.push(`${path}.${required} is missing but required`)
    }
    for (const [key, entry] of Object.entries(record)) {
      const child = properties[key]
      if (child === undefined) {
        if (schema.additionalProperties === false) {
          problems.push(`${path}.${key} is not a declared property (additionalProperties: false)`)
        }
        continue
      }
      problems.push(...schemaViolations(entry, child, `${path}.${key}`))
    }
    return problems
  }

  if (declared === 'array') {
    if (!Array.isArray(value)) return [`${path} is not an array`]
    const items = schema.items as OutputSchema | undefined
    if (items === undefined) return []
    return value.flatMap((entry, index) => schemaViolations(entry, items, `${path}[${index}]`))
  }

  if (declared === 'string' && typeof value !== 'string') return [`${path} is not a string`]
  if (declared === 'number' && typeof value !== 'number') return [`${path} is not a number`]
  if (declared === 'integer' && !Number.isInteger(value)) return [`${path} is not an integer`]
  if (declared === 'boolean' && typeof value !== 'boolean') return [`${path} is not a boolean`]
  if (Array.isArray(schema.enum) && !(schema.enum as readonly unknown[]).includes(value)) {
    return [`${path} is not one of ${(schema.enum as readonly unknown[]).join(', ')}`]
  }
  return []
}
