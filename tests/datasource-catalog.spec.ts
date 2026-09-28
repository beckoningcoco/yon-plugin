/**
 * The datasource catalog's two promises: the secrets never leave, and the
 * stored shape is read structurally rather than by a hard-coded key list.
 */
import { describe, expect, it } from 'vitest'
import {
  PROBEABLE_TYPES, connectionOf, environmentNames, toViews,
} from '../src/host/datasource-catalog.ts'

/** A value that must never appear in anything this module returns. */
const SECRET = 'sup3r-s3cret-value'

/** A document shaped exactly as `db_query.py` stores it. */
const CONFIG = {
  projects: {
    '天九(NCC2312)': {
      type: 'postgresql',
      test: {
        host: 'pc-2zek8f77996c0g6zz.o.polarb.rds.aliyuncs.com',
        port: 1521,
        service_name: 'biptestdb3',
        users: { bipuser: SECRET },
      },
      prod: {
        host: 'pc-2zek8f77996c0g6zz.o.polarb.rds.aliyuncs.com',
        port: 1521,
        service_name: 'bipdb',
        users: { bipuser: SECRET },
      },
    },
    '东软载波(BIP)': {
      type: 'oceanbase',
      test: { host: '192.168.242.100', port: 2881, service_name: '', users: { 'root@obmysql': SECRET } },
    },
  },
}

describe('toViews', () => {
  it('produces one row per connection and environment', () => {
    const rows = toViews(CONFIG, () => undefined)
    // Compared as a set: the display order is Chinese collation, which is a
    // property of the surface rather than of this contract.
    expect(rows.map(row => row.key).sort()).toEqual([
      '东软载波(BIP)::test',
      '天九(NCC2312)::prod',
      '天九(NCC2312)::test',
    ].sort())
  })

  it('orders environments test, prod and never invents a branch', () => {
    const rows = toViews(CONFIG, () => undefined).filter(row => row.configKey === '天九(NCC2312)')
    expect(rows.map(row => row.env)).toEqual(['test', 'prod'])
  })

  it('never carries a secret, and reports only that one exists', () => {
    const rows = toViews(CONFIG, () => undefined)
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain(SECRET)
    // Not even the member name: the type has no such field to leak.
    expect(serialized).not.toContain('password')
    expect(rows.every(row => row.hasPassword)).toBe(true)
    expect(rows.find(row => row.dbType === 'oceanbase')?.userNames).toEqual(['root@obmysql'])
  })

  it('marks a type the script cannot connect with as not probeable', () => {
    const rows = toViews(CONFIG, () => undefined)
    const oceanbase = rows.find(row => row.dbType === 'oceanbase')
    const postgres = rows.find(row => row.dbType === 'postgresql')
    expect(oceanbase?.probeable).toBe(false)
    expect(postgres?.probeable).toBe(true)
    expect(PROBEABLE_TYPES).not.toContain('oceanbase')
  })

  it('reads a branch structurally, so a new environment needs no code change', () => {
    const rows = toViews({
      projects: { X: { type: 'dm', staging: { host: 'h', port: 5236, users: { U: SECRET } } } },
    }, () => undefined)
    expect(rows.map(row => row.env)).toEqual(['staging'])
  })

  it('resolves a binding through the lookup it is given', () => {
    const rows = toViews({
      projects: { X: { type: 'oracle', projectId: 'p1', test: { host: 'h', port: 1521, users: { U: SECRET } } } },
    }, projectId => (projectId === 'p1' ? { name: '天九' } : undefined))
    expect(rows[0]?.binding).toEqual({ projectId: 'p1', projectName: '天九' })
  })

  it('leaves a dangling binding off rather than inventing a name', () => {
    const rows = toViews({
      projects: { X: { type: 'oracle', projectId: 'gone', test: { host: 'h', port: 1521, users: { U: SECRET } } } },
    }, () => undefined)
    expect(rows[0]?.binding).toBeUndefined()
  })

  it('survives a document that is not shaped as expected', () => {
    expect(toViews({}, () => undefined)).toEqual([])
    expect(toViews({ projects: { X: 'not-an-object' } } as never, () => undefined)).toEqual([])
    expect(toViews({ projects: { X: { type: 'oracle' } } }, () => undefined)).toEqual([])
  })

  it('reports a login-less branch instead of failing on it', () => {
    const rows = toViews({
      projects: { X: { type: 'mysql', test: { host: 'h', port: 3306, users: {} } } },
    }, () => undefined)
    expect(rows[0]?.userNames).toEqual([])
    expect(rows[0]?.hasPassword).toBe(false)
  })
})

describe('environmentNames', () => {
  it('ignores connection-level metadata', () => {
    expect(environmentNames({
      type: 'oracle',
      projectId: 'p1',
      thick_mode: true,
      thick_lib_dir: './x',
      prod: { host: 'h', port: 1521 },
    })).toEqual(['prod'])
  })

  it('orders the known environments first and the rest after them', () => {
    expect(environmentNames({
      analysis: { host: 'h' },
      prod: { host: 'h' },
      test: { host: 'h' },
      dev: { host: 'h' },
      zebra: { host: 'h' },
    })).toEqual(['test', 'dev', 'prod', 'analysis', 'zebra'])
  })
})

describe('connectionOf', () => {
  it('finds a connection by its exact key', () => {
    expect(connectionOf(CONFIG, '天九(NCC2312)')?.type).toBe('postgresql')
    expect(connectionOf(CONFIG, '天九')?.type).toBeUndefined()
  })

  it('answers undefined for anything that is not a connection', () => {
    expect(connectionOf(CONFIG, 'missing')).toBeUndefined()
    expect(connectionOf({ projects: { X: 42 } } as never, 'X')).toBeUndefined()
    expect(connectionOf({}, 'X')).toBeUndefined()
  })
})
