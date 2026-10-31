/**
 * NCC OpenAPI 的调用面板：左边环境列表，右边选中的环境与一次调用。
 *
 * 布局刻意照搬 datasource 面（`base.listPane` / `base.detailPane` / `base.props` /
 * `base.form`），因为面板里已经有一整套对话框样式；这里再发明一套，两个页面就会
 * 长得像两个产品。
 *
 * secret 只向内写：表单里的密码框永远是空的，提示语是"留空则保留原值"——
 * 一个空框如果被理解成"清空 secret"，那就不是编辑而是误删。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { NccApiApi, NccApiCallResult, NccApiEnvView } from './api.ts'
import { cn } from '../cn.ts'
import base from '../panel.module.css'
import css from './NccApiManager.module.css'

/** 组合后的 props。 */
export type NccApiManagerProps = {
  t: TranslateNS<'yonPanel'>
  onClose: () => void
} & NccApiApi

/** 表单里正在编辑的一条环境。 */
interface Draft {
  name: string
  host: string
  clientId: string
  bizCenter: string
  dsname: string
  version: 'new' | 'old'
  clientSecret: string
  pubkey: string
}

/** 空白表单，或从某一行灌入。 */
function draftOf(row?: NccApiEnvView): Draft {
  return {
    name: row?.name ?? '',
    host: row?.host ?? '',
    clientId: row?.clientId ?? '',
    bizCenter: row?.bizCenter ?? '',
    dsname: row?.dsname ?? '',
    version: row?.version === 'old' ? 'old' : 'new',
    clientSecret: '',
    pubkey: '',
  }
}

/**
 * The mark in front of every environment row.
 * @returns the decorative glyph.
 */
function BracesMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.4 2.8c-1.5 0-2 .7-2 2v1.4c0 .9-.4 1.4-1.2 1.4.8 0 1.2.5 1.2 1.4V11c0 1.3.5 2 2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.6 2.8c1.5 0 2 .7 2 2v1.4c0 .9.4 1.4 1.2 1.4-.8 0-1.2.5-1.2 1.4V11c0 1.3-.5 2-2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Render the surface.
 * @param props - the translate function, the close gesture and the API face.
 * @returns the dialog.
 */
export function NccApiManager({ t, onClose, ...api }: NccApiManagerProps) {
  const [envs, setEnvs] = useState<readonly NccApiEnvView[]>([])
  const [active, setActive] = useState('')
  const [selected, setSelected] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const [apiPath, setApiPath] = useState('/nccloud/api/uapbd/newproject/query')
  const [body, setBody] = useState('{\n  "project_code": "HWTEST20261021001"\n}')
  const [result, setResult] = useState<NccApiCallResult | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.listEnvs()
      setEnvs(payload.envs)
      setActive(payload.active)
      setConfigPath(payload.path)
      setSelected((current) => {
        if (current !== '' && payload.envs.some(env => env.name === current)) return current
        if (payload.active !== '' && payload.envs.some(env => env.name === payload.active)) return payload.active
        return payload.envs[0]?.name ?? ''
      })
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const current = envs.find(env => env.name === selected)

  const save = async (): Promise<void> => {
    if (draft === undefined) return
    setBusy(true)
    try {
      await api.saveEnv({
        name: draft.name.trim(),
        host: draft.host.trim(),
        clientId: draft.clientId.trim(),
        bizCenter: draft.bizCenter.trim(),
        dsname: draft.dsname.trim(),
        version: draft.version,
        ...draft.clientSecret === '' ? {} : { clientSecret: draft.clientSecret },
        ...draft.pubkey === '' ? {} : { pubkey: draft.pubkey },
      })
      setDraft(undefined)
      await load()
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (current === undefined) return
    setBusy(true)
    try {
      await api.removeEnv(current.name)
      await load()
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const send = async (): Promise<void> => {
    if (selected === '') return
    setBusy(true)
    setResult(undefined)
    try {
      const answer = await api.call({ env: selected, apiPath: apiPath.trim(), body })
      setResult(answer)
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  /** Pretty-print the body; leaves it alone when it is not JSON. */
  const format = (): void => {
    try {
      setBody(JSON.stringify(JSON.parse(body) as unknown, null, 2))
    } catch {
      // Not JSON yet: typing is still in progress, so nothing is rewritten.
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('nccApi.title')}
      closeLabel={t('nccApi.close')}
      className={cn(css.dialog)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{failure}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('nccApi.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body, css.body)}>
        <section className={cn(base.listPane, css.listPane)} aria-label={t('nccApi.env')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('nccApi.env')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => { setDraft(draftOf()); setResult(undefined) }}
            >
              {t('nccApi.new')}
            </Button>
          </div>

          {envs.length === 0 && <p className={cn(base.note)}>{t('nccApi.noEnv')}</p>}

          <ul className={cn(base.projects)} role="listbox" aria-label={t('nccApi.env')}>
            {envs.map(env => (
              <li key={env.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={env.name === selected}
                  className={cn(base.projectRow)}
                  onClick={() => {
                    setSelected(env.name)
                    setDraft(undefined)
                    setResult(undefined)
                  }}
                >
                  <span className={cn(base.projectMark)} aria-hidden="true"><BracesMark /></span>
                  <span className={cn(base.projectName)} title={env.name}>{env.name}</span>
                  {env.name === active && (
                    <span className={cn(base.tag, base.tagMuted)}>{t('nccApi.defaultTag')}</span>
                  )}
                  <span className={cn(base.projectMeta)}>{env.host}</span>
                </button>
              </li>
            ))}
          </ul>

          {configPath !== '' && (
            <p className={cn(base.note)} title={configPath}>{configPath}</p>
          )}
        </section>

        <section className={cn(base.detailPane)}>
          {draft !== undefined
            ? (
              <form
                className={cn(base.form)}
                onSubmit={(event) => { event.preventDefault(); void save() }}
              >
                <h3 className={cn(css.title)}>
                  {draft.name === '' ? t('nccApi.new') : t('nccApi.editTitle', { name: draft.name })}
                </h3>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-name">{t('nccApi.field.name')}</label>
                  <Input
                    id="yon-ncc-name"
                    className={cn(base.inputFill)}
                    value={draft.name}
                    placeholder="环卫2111_本地"
                    onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-host">{t('nccApi.field.host')}</label>
                  <Input
                    id="yon-ncc-host"
                    className={cn(base.inputFill)}
                    value={draft.host}
                    placeholder="47.93.224.130:917"
                    onChange={(event) => { setDraft({ ...draft, host: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-cid">{t('nccApi.field.clientId')}</label>
                  <Input
                    id="yon-ncc-cid"
                    className={cn(base.inputFill)}
                    value={draft.clientId}
                    placeholder="NineStar"
                    onChange={(event) => { setDraft({ ...draft, clientId: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-bc">{t('nccApi.field.bizCenter')}</label>
                  <Input
                    id="yon-ncc-bc"
                    className={cn(base.inputFill)}
                    value={draft.bizCenter}
                    placeholder="HW001"
                    onChange={(event) => { setDraft({ ...draft, bizCenter: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-ds">{t('nccApi.field.dsname')}</label>
                  <Input
                    id="yon-ncc-ds"
                    className={cn(base.inputFill)}
                    value={draft.dsname}
                    placeholder="NCCHW"
                    onChange={(event) => { setDraft({ ...draft, dsname: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-secret">{t('nccApi.field.secret')}</label>
                  <Input
                    id="yon-ncc-secret"
                    type="password"
                    className={cn(base.inputFill)}
                    value={draft.clientSecret}
                    placeholder={t('nccApi.field.keep')}
                    onChange={(event) => { setDraft({ ...draft, clientSecret: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.formRow)}>
                  <label className={cn(base.formLabel)} htmlFor="yon-ncc-pub">{t('nccApi.field.pubkey')}</label>
                  <Input
                    id="yon-ncc-pub"
                    className={cn(base.inputFill)}
                    value={draft.pubkey}
                    placeholder={t('nccApi.field.keep')}
                    onChange={(event) => { setDraft({ ...draft, pubkey: event.target.value }) }}
                  />
                </div>

                <div className={cn(base.detailActions)}>
                  <Button type="submit" size="sm" disabled={busy}>
                    {busy ? t('nccApi.saving') : t('nccApi.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => { setDraft(undefined) }}
                  >
                    {t('nccApi.cancel')}
                  </Button>
                </div>
              </form>
            )
            : current === undefined
              ? (
                <div className={cn(base.empty)}>
                  <span className={cn(base.emptyMark)} aria-hidden="true"><BracesMark /></span>
                  <p className={cn(base.emptyTitle)}>{t('nccApi.noEnv')}</p>
                  <p className={cn(base.note)}>{t('nccApi.emptyHint')}</p>
                </div>
              )
              : (
                <div className={cn(css.detail)}>
                  <h3 className={cn(css.title)}>{current.name}</h3>
                  <dl className={cn(base.props)}>
                    <dt className={cn(base.propLabel)}>host</dt>
                    <dd className={cn(base.propValue)}>{current.host}</dd>
                    <dt className={cn(base.propLabel)}>client_id</dt>
                    <dd className={cn(base.propValue)}>{current.clientId}</dd>
                    <dt className={cn(base.propLabel)}>biz_center</dt>
                    <dd className={cn(base.propValue)}>{current.bizCenter}</dd>
                    <dt className={cn(base.propLabel)}>dsname</dt>
                    <dd className={cn(base.propValue)}>{current.dsname === '' ? '—' : current.dsname}</dd>
                    <dt className={cn(base.propLabel)}>{t('nccApi.prop.version')}</dt>
                    <dd className={cn(base.propValue)}>{current.version === 'old' ? 'old' : 'new'}</dd>
                    <dt className={cn(base.propLabel)}>{t('nccApi.prop.secret')}</dt>
                    <dd className={cn(base.propValue)}>
                      {current.hasSecret ? t('nccApi.secretStored') : t('nccApi.secretMissing')}
                    </dd>
                  </dl>

                  <div className={cn(base.detailActions)}>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft(draftOf(current)) }}>
                      {t('nccApi.edit')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { void remove() }}>
                      {t('nccApi.remove')}
                    </Button>
                  </div>

                  <div className={cn(base.rule)} />

                  <h4 className={cn(css.callTitle)}>{t('nccApi.callTitle')}</h4>

                  <div className={cn(base.formRow)}>
                    <label className={cn(base.formLabel)} htmlFor="yon-ncc-path">{t('nccApi.path')}</label>
                    <Input
                      id="yon-ncc-path"
                      className={cn(base.inputFill)}
                      value={apiPath}
                      onChange={(event) => { setApiPath(event.target.value) }}
                    />
                  </div>

                  <textarea
                    className={cn(css.textarea)}
                    aria-label={t('nccApi.body')}
                    spellCheck={false}
                    value={body}
                    onChange={(event) => { setBody(event.target.value) }}
                  />

                  <div className={cn(css.toolbar)}>
                    <Button size="sm" disabled={busy} onClick={() => { void send() }}>
                      {busy ? t('nccApi.sending') : t('nccApi.send')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={format}>
                      {t('nccApi.format')}
                    </Button>
                    {result !== undefined && (
                      <span className={cn(css.status, result.ok ? css.statusOk : css.statusBad)}>
                        {t('nccApi.status', { status: String(result.status), ms: String(result.tokenCostMs) })}
                      </span>
                    )}
                  </div>

                  {result !== undefined && (
                    <pre className={cn(css.response)}>{result.body}</pre>
                  )}
                </div>
              )}
        </section>
      </div>
    </Modal>
  )
}
