/**
 * The bmf parser's promises, each one a rule that a real file was measured to have.
 *
 * The fixtures here are written by hand rather than copied out of an installation: a
 * case that asserted against a real `.bmf` would be asserting against one vendor's
 * 2014 build, and the rules being checked are about the format, not about that file.
 * The measurements that justify each rule live in `src/host/meta-bmf.ts`'s header.
 */
import { describe, expect, it } from 'vitest'
import { parseBmf } from '../src/host/meta-bmf.ts'

/** One document, indented the way the real ones are: one element per line. */
function document(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\r\n' + body
}

/** A field element with the attributes the parser keeps. */
function attr(parts: Record<string, string>): string {
  const written = Object.entries(parts).map(([key, value]) => ` ${key}="${value}"`).join('')
  return `                <attribute${written}/>`
}

describe('parseBmf', () => {
  it('reads every entity in a file, not just the first', () => {
    const parsed = parseBmf(document(`
<component name="two" mainEntity="id-a">
    <celllist>
        <entity id="id-a" name="first" displayName="第一" tableName="t_first" fullClassName="nc.vo.FirstVO" isPrimary="true">
            <attributelist>
${attr({ fieldName: 'pk_first', displayName: '主键', dbtype: 'char', length: '20', isKey: 'true' })}
            </attributelist>
        </entity>
        <entity id="id-b" name="second" displayName="第二" tableName="t_second" fullClassName="nc.vo.SecondVO">
            <attributelist>
${attr({ fieldName: 'code', displayName: '编码' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'erm', 'two')

    expect(parsed.entities.map(entity => entity.name)).toEqual(['first', 'second'])
    expect(parsed.entities[0]?.primary).toBe(true)
    expect(parsed.entities[1]?.primary).toBe(false)
    expect(parsed.entities[0]?.tableName).toBe('t_first')
    expect(parsed.entities[1]?.fullClassName).toBe('nc.vo.SecondVO')
  })

  it('does not read a container as the element whose name it starts with', () => {
    const parsed = parseBmf(document(`
<component name="containers">
    <celllist>
        <entity id="x" name="only" tableName="t">
            <attributelist>
${attr({ fieldName: 'a', displayName: 'A' })}
            </attributelist>
            <enumitemlist/>
            <canzhaolist/>
        </entity>
    </celllist>
</component>`), 'm', 'containers')

    // `<attributelist>` and `<enumitemlist>` must not count as an element of their own,
    // and neither must `<canzhaolist>`. One entity, one field, nothing else.
    expect(parsed.entities).toHaveLength(1)
    expect(parsed.entities[0]?.fields).toHaveLength(1)
    expect(parsed.enums).toHaveLength(0)
  })

  it('keeps a field whose file gave no display name, with an empty label', () => {
    const parsed = parseBmf(document(`
<component name="bare">
    <celllist>
        <entity id="x" name="bare" tableName="t">
            <attributelist>
${attr({ fieldName: 'pk_bare' })}
${attr({ name: 'only_name_attr', displayName: '只有 name 属性' })}
${attr({ fieldName: 'labelled', displayName: '有名字' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'bare')

    const fields = parsed.entities[0]?.fields ?? []
    expect(fields.map(field => [field.name, field.label])).toEqual([
      ['pk_bare', ''],
      // `fieldName` wins when both are present; `name` is the fallback, which is how
      // the real files write it for the handful of attributes that carry only `name`.
      ['only_name_attr', '只有 name 属性'],
      ['labelled', '有名字'],
    ])
  })

  it('drops a field element that sits outside any entity', () => {
    const parsed = parseBmf(document(`
<component name="stray">
    <celllist>
${attr({ fieldName: 'orphan', displayName: '孤儿' })}
        <entity id="x" name="real" tableName="t">
            <attributelist>
${attr({ fieldName: 'kept', displayName: '保留' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'stray')

    expect(parsed.entities).toHaveLength(1)
    expect(parsed.entities[0]?.fields.map(field => field.name)).toEqual(['kept'])
  })

  it('falls back to the file name for an entity that declares none', () => {
    const parsed = parseBmf(document(`
<component name="nameless">
    <celllist>
        <entity id="x" tableName="t_nameless">
            <attributelist>
${attr({ fieldName: 'a' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'namelessfile')

    expect(parsed.entities[0]?.name).toBe('namelessfile')
    // The basename is kept separately as well, so the index can match either spelling
    // without having to know which one was the fallback.
    expect(parsed.entities[0]?.filename).toBe('namelessfile')
  })

  it('reads an enumeration and its items from enumValue/enumDisplay', () => {
    const parsed = parseBmf(document(`
<component name="withEnum">
    <celllist>
        <entity id="x" name="bill" tableName="t_bill">
            <attributelist>
${attr({ fieldName: 'status', displayName: '单据状态', dataType: 'uuid-status', typeName: 'billstatus' })}
            </attributelist>
        </entity>
        <Enumerate id="uuid-status" name="billstatus" displayName="单据状态" fullClassName="nc.vo.BillStatusEnum" typeName="Integer">
            <enumitemlist>
                <enumitem enumID="uuid-status" enumValue="1" enumDisplay="待审批" id="i1"/>
                <enumitem enumID="uuid-status" enumValue="2" enumDisplay="已审批" id="i2"/>
            </enumitemlist>
        </Enumerate>
    </celllist>
</component>`), 'erm', 'withEnum')

    expect(parsed.enums).toHaveLength(1)
    expect(parsed.enums[0]?.name).toBe('billstatus')
    expect(parsed.enums[0]?.id).toBe('uuid-status')
    expect(parsed.enums[0]?.fullClassName).toBe('nc.vo.BillStatusEnum')
    // The field reaches its enumeration by `dataType` matching the enumeration's `id` —
    // there is no `enumID` on `<attribute>` in the real format.
    expect(parsed.entities[0]?.fields[0]?.dataType).toBe(parsed.enums[0]?.id)
    expect(parsed.enums[0]?.items).toEqual([
      { value: '1', label: '待审批' },
      { value: '2', label: '已审批' },
    ])
  })

  it('reads the flags and numbers a data dictionary asks about', () => {
    const parsed = parseBmf(document(`
<component name="flags">
    <celllist>
        <entity id="x" name="f" tableName="t">
            <attributelist>
${attr({
  fieldName: 'amount', displayName: '金额', dbtype: 'decimal', fieldType: 'decimal',
  dataType: 'BS000010000100001005', typeName: 'Decimal', length: '20', precise: '8',
  isKey: 'false', isNullable: 'true', isReadOnly: 'false', isHide: 'true', defaultValue: '0',
})}
${attr({ fieldName: 'note', displayName: '备注', precise: '', length: 'not-a-number', isHide: 'false' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'flags')

    const amount = parsed.entities[0]?.fields[0]
    expect(amount).toMatchObject({
      dbtype: 'decimal',
      fieldType: 'decimal',
      typeName: 'Decimal',
      length: 20,
      precise: 8,
      isKey: false,
      isNullable: true,
      isReadOnly: false,
      isHide: true,
      defaultValue: '0',
    })
    // An empty number is zero and a malformed one is zero, rather than NaN reaching the
    // index — `precise=""` is how the real files write "not applicable".
    expect(parsed.entities[0]?.fields[1]?.precise).toBe(0)
    expect(parsed.entities[0]?.fields[1]?.length).toBe(0)
    expect(parsed.entities[0]?.fields[1]?.isHide).toBe(false)
  })

  it('reads an entity whose fields are not self-closing elements', () => {
    const parsed = parseBmf(document(`
<component name="paired">
    <celllist>
        <entity id="x" name="paired" tableName="t">
            <attributelist>
                <attribute fieldName="a" displayName="A"></attribute>
                <attribute fieldName="b" displayName="B"/>
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'paired')

    expect(parsed.entities[0]?.fields.map(field => field.name)).toEqual(['a', 'b'])
  })

  it('answers an empty or metadata-free document with nothing, not a throw', () => {
    expect(parseBmf('', 'm', 'empty').entities).toEqual([])
    expect(parseBmf(document('<component name="none"/>'), 'm', 'none').entities).toEqual([])
    // A file holding only an enumeration is real — `MetaColumn.bmf` is mostly one.
    const onlyEnum = parseBmf(document(`
<component name="e">
    <celllist>
        <Enumerate id="i" name="columntype" displayName="列类型">
            <enumitemlist><enumitem enumValue="1" enumDisplay="文本"/></enumitemlist>
        </Enumerate>
    </celllist>
</component>`), 'm', 'e')
    expect(onlyEnum.entities).toEqual([])
    expect(onlyEnum.enums).toHaveLength(1)
  })

  it('takes the module from its caller, never from the document', () => {
    // Measured: a file under `modules/riawf` declares `moduleName="uap"`. The path is
    // the truth, so the attribute is ignored and the caller's value is used.
    const parsed = parseBmf(document(`
<component name="lying">
    <celllist>
        <entity id="x" name="lying" tableName="t" moduleName="uap">
            <attributelist>
${attr({ fieldName: 'a' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'riawf', 'lying')

    expect(parsed.entities[0]?.module).toBe('riawf')
  })

  it('keeps a second entity that opens before the first one closed', () => {
    // Malformed nesting that does occur. Both entities are reported rather than the
    // first being lost to the second's open tag.
    const parsed = parseBmf(document(`
<component name="bad">
    <celllist>
        <entity id="x" name="one" tableName="t1">
            <attributelist>
${attr({ fieldName: 'a' })}
            </attributelist>
        <entity id="y" name="two" tableName="t2">
            <attributelist>
${attr({ fieldName: 'b' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'bad')

    expect(parsed.entities.map(entity => entity.name)).toEqual(['one', 'two'])
    expect(parsed.entities[0]?.fields.map(field => field.name)).toEqual(['a'])
    expect(parsed.entities[1]?.fields.map(field => field.name)).toEqual(['b'])
  })

  it('drops a field element that carries no name at all', () => {
    const parsed = parseBmf(document(`
<component name="anon">
    <celllist>
        <entity id="x" name="anon" tableName="t">
            <attributelist>
${attr({ displayName: '没有名字' })}
${attr({ fieldName: '', displayName: '空字符串' })}
${attr({ fieldName: 'real' })}
            </attributelist>
        </entity>
    </celllist>
</component>`), 'm', 'anon')

    // A field with no name cannot be looked up by name and cannot be a column, so it is
    // the one thing the parser drops. `name` is tried first, then `fieldName`.
    expect(parsed.entities[0]?.fields.map(field => field.name)).toEqual(['real'])
  })
})
