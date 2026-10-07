/**
 * 需求条目这一屏：某个项目下「要做的事」，一条条记着，连同模型在它上面留下的痕迹。
 *
 * ## 这一屏与旁边两屏的关系
 *
 * 迭代表板和消化检查报的是**这个插件自己的毛病**；这一屏报的是**使用者的活**。所以
 * 它读起来更像一本台账：一行是一件事，点开是这件事的全文与来龙去脉。
 *
 * ## 谁写什么
 *
 * 模型是这套结构的主要写作者（`requirement_*` 九个工具），这一屏是**人的入口**：在这里
 * 建条目、改状态、补一段标注、把条目废掉或删掉、把使用者给的原件归档进来。这些写动作里
 * 有两件**模型根本没有工具**——真删条目（`remove`）与归档原件（`importFile`）：一个会把
 * 已经记下的东西整份抹掉，另一个要把「这是他给的」写成事实，两件都不该由一个猜的人来做。
 * 归档那一件更彻底：它是通往 `user/` 的**唯一**入口（`requirement-tools.ts` 头注释）。
 *
 * ## 两个视图，不是一个长条
 *
 * 面板本体只有 450px 高的滚动区。列表、正文、追溯、动作行竖着堆进去，每块都只剩一条缝，
 * 所以做成列表 ↔ 详情两个视图（与需求设计文档 §十六 的结论一致）。
 *
 * ## 追溯为什么是单独一块
 *
 * 磁盘上只有一份 `entry.md`，但它是**两种读者两种渲染**：模型读的是剥掉删除线的那份，
 * 人读的是带着删除线的那份（`requirement-doc.ts` 头注释里那张图）。这一屏是人，所以取
 * `history: true`：正文按「标注」这个标题切开，上面是这件事本身、下面是每一次改动，划掉的
 * 旧说法留在原处——「一眼看出改过什么」是这一屏存在的理由之一。
 *
 * 切分**不在客户端做**：宿主把 `prose` 与 `notes` 分开给（见 `shared/types.ts` 那两个字段
 * 的注释），否则「标题长什么样」「空行分段」这两条规则就有了第二份。
 *
 * 这一屏不 fetch：每个调用都从格子的 inject face 进来，所以它不接宿主也能测。
 *
 * ## 附件那一块为什么按目录分，而不是一张大表
 *
 * 三个目录的**权限**不同（`user/` 模型写不进去，`generated/` 与 `patches/` 能），所以
 * 「这个文件是谁给的」这件事由它躺在哪个目录里回答，不需要谁自述。面板照这个结构画：
 * 三个文件夹各带一个数，点哪个看哪个。**空目录也要露脸**——`user/` 空着本身就是一句
 * 有用的话（他还没给东西），把它藏起来，读者会以为这一屏没做这件事。
 *
 * 「读」这一列与设计文档 §十三 同一条取舍：扩展名只给**预测**（这一行给不给「读」这个
 * 按钮），字节能读不能读要按下去才知道。所以 `.txt` 里装着 zip 也进得去，回的是「扩展名
 * 骗了人」；反过来 docx 连按钮都不给，只在行下写一句为什么——让人点一下再被告知「读不
 * 了」，是拿一次等待换一句他本来就看得到的话。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, MarkdownText, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  REQUIREMENT_DIRS,
  type ProjectSummary, type RequirementDir, type RequirementFileList,
  type RequirementFileRead, type RequirementStatus, type RequirementSummary, type RequirementView,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { ProjectApi } from '../project/api.ts'
import type { RequirementApi } from './api.ts'
import { DIR_LABEL_KEYS, STATUSES, STATUS_FILTERS, STATUS_LABEL_KEYS } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** 新建表单开着的时候它拿着的东西。 */
interface Draft {
  projectId: string
  name: string
  body: string
}

/** 一张空表。项目默认跟着当前的筛选，省一次选择。 */
function blankDraft(projectId = ''): Draft {
  return { projectId, name: '', body: '' }
}

/**
 * 状态格的配色。
 *
 * 只有「待验收」用告警色：那一条正等着人点头，是这一屏唯一需要读者动手的状态。已完成用
 * 成功色，其余四种（待开发、开发中、搁置、已废弃）共用中性色——它们都只是「定了」。
 * @param status - the row's status.
 * @returns the shared tag class for it.
 */
function statusTag(status: RequirementStatus): string | undefined {
  if (status === 'review') return base.tagFail
  if (status === 'done') return base.tagPass
  return base.tagMuted
}

/** Props of the surface: the injected APIs, the copy seat, and the close verb. */
export interface RequirementManagerProps extends RequirementApi {
  /**
   * 项目选择器的选项。
   *
   * 借的是项目 API 自己那一次调用，与数据源面板挑绑定项目同一个理由：再实现一遍就会多出
   * 第二份「哪些项目该出现在选择器里」的规则（归档的排不排除）。
   */
  listProjects: ProjectApi['listProjects']
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * 时间戳显示成本地短日期。
 *
 * 这一屏按本地日历读：标注上盖的日期是使用者过的那个日子（`requirement-doc.ts` 的
 * `localDate` 为此存在），台账里的 ISO 戳换算时也必须落到同一个日历上，否则同一次改动
 * 会在两处显示成不同的日子。
 * @param iso - the ISO stamp the host applied.
 * @returns `YYYY-MM-DD`, or the raw text when it is not a date.
 */
function shortDate(iso: string): string {
  if (iso === '') return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 一句失败的文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 一个字节数，说成人话：`812 字节` / `12.3 KB` / `2.1 MB`。
 *
 * 宿主那一半有一份一模一样的（`host/requirement-files.ts` 的 `sizeOf`），**不共用是
 * 有意的**：那个模块 import 了 `node:fs`，从这里引它会把文件系统拖进浏览器这一侧的产物。
 * 两份都会写错的话，错法也一定不一样——一份把 1 MB 说成 1024 KB 而另一份说成 1.0 MB，
 * 使用者看到的还是同一份清单里的同一个数，所以这条规则的两份实现是能被发现的。
 * @param bytes - the size.
 * @returns the size in the unit a person would say it in.
 */
function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} 字节`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 一个附件在这一屏里的身份：目录 + 名字。展开、两步删除、复制都按它比对。 */
function fileKey(dir: RequirementDir, name: string): string {
  return `${dir}/${name}`
}

/**
 * 空态与加载中那张纸的记号：一页折了一角、上面写着三行字。
 * @returns the decorative svg.
 */
function SheetMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2.2h5.3l3.1 3.2v8.4H4z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M9.3 2.2v3.2h3.1" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.1 8.1h4.2M6.1 10.5h2.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the requirement ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function RequirementManager({
  list, read, create, annotate, update, archive, remove,
  fileList, fileRead, importFile, removeFile,
  listProjects, onClose, t,
}: RequirementManagerProps) {
  const [rows, setRows] = useState<readonly RequirementSummary[]>([])
  const [root, setRoot] = useState('')
  /** 台账里列着、`entry.md` 却读不出来的那些 id。 */
  const [unreadable, setUnreadable] = useState<readonly string[]>([])
  /** 宿主自己报告的「台账在但读不出来」。 */
  const [indexError, setIndexError] = useState<string | undefined>(undefined)
  /** 一次调用失败，带重试。 */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState<'ok' | 'failed' | undefined>(undefined)

  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [projectFailure, setProjectFailure] = useState<string | undefined>(undefined)
  /** 空串 = 全部项目。 */
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<RequirementStatus | 'all'>('all')

  /** 打开的条目 id；没有就是列表视图。 */
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<RequirementView | undefined>(undefined)
  const [detailBusy, setDetailBusy] = useState(false)
  const [detailFailure, setDetailFailure] = useState<string | undefined>(undefined)
  const [traceOpen, setTraceOpen] = useState(true)

  const [confirm, setConfirm] = useState<'archive' | 'delete' | undefined>(undefined)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>(undefined)
  const [writing, setWriting] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => blankDraft())
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState(false)

  /** 三个目录连同里面的文件。`undefined` = 还没取到。 */
  const [files, setFiles] = useState<RequirementFileList | undefined>(undefined)
  const [filesBusy, setFilesBusy] = useState(false)
  const [filesFailure, setFilesFailure] = useState<string | undefined>(undefined)
  /** 正看着哪个目录。默认「他给的」——那一块空着，是使用者最该先看到的一句话。 */
  const [folder, setFolder] = useState<RequirementDir>('user')
  /** 展开着正文的那一个文件。同一刻只开一个：这一屏只有 450px，开两个就谁也读不了。 */
  const [openFile, setOpenFile] = useState<string | undefined>(undefined)
  const [fileText, setFileText] = useState<RequirementFileRead | undefined>(undefined)
  const [fileBusy, setFileBusy] = useState(false)
  const [fileFailure, setFileFailure] = useState<string | undefined>(undefined)
  const [fileCopied, setFileCopied] = useState<'ok' | 'failed' | undefined>(undefined)
  /** 正等着第二问的那个附件。 */
  const [confirmFile, setConfirmFile] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | undefined>(undefined)

  /**
   * 读台账。
   *
   * 过滤交给宿主（`?project=` / `?status=`），与迭代表板相反：那一屏的计数要数整份台账，
   * 所以必须全取回来自己筛；这一屏的「共 N 条」数的是**眼前这一屏**，被筛掉的本来就不该
   * 被数进来。
   */
  const load = useCallback(async () => {
    setBusy(true)
    try {
      const payload = await list({
        ...projectId === '' ? {} : { projectId },
        ...status === 'all' ? {} : { status },
      })
      setRows(payload.rows)
      setRoot(payload.root)
      setUnreadable(payload.unreadable)
      setIndexError(payload.error)
      setFailure(undefined)
    } catch (error: unknown) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }, [list, projectId, status])

  useEffect(() => { void load() }, [load])

  /**
   * 读项目清单，只为选择器。
   *
   * 失败**不算整屏失败**：选择器退化成只有「全部项目」，台账照样读得出来。所以它自己一个
   * 失败位，不挤进上面那条告警——那条告警的「重试」重读的是台账。
   */
  const loadProjects = useCallback(async () => {
    try {
      setProjects(await listProjects())
      setProjectFailure(undefined)
    } catch (error: unknown) {
      setProjectFailure(messageOf(error))
    }
  }, [listProjects])

  useEffect(() => { void loadProjects() }, [loadProjects])

  /**
   * 读这一条的三个附件目录。
   *
   * 三个一起取（`fileList` 不带 `dir`）：这一屏画的就是三块，分三次请求就是三次 `readdir`
   * 的等待，而切一下文件夹不该有一次网络往返。
   */
  const loadFiles = useCallback(async (id: string): Promise<void> => {
    setFilesBusy(true)
    try {
      setFiles(await fileList(id))
      setFilesFailure(undefined)
    } catch (error: unknown) {
      setFilesFailure(messageOf(error))
    } finally {
      setFilesBusy(false)
    }
  }, [fileList])

  /** 打开一条：正文、追溯、附件一起取（只有 `history: true` 才有 `prose` 与 `notes`）。 */
  const openEntry = useCallback(async (id: string) => {
    setOpenId(id)
    setDetail(undefined)
    setConfirm(undefined)
    setNote('')
    setNoteError(undefined)
    setTraceOpen(true)
    setDetailBusy(true)
    setDetailFailure(undefined)
    // 附件这一块的状态跟着条目走：换一条还留着上一条的展开与第二问，是在对着别人家的
    // 文件说「确认删除」。
    setFiles(undefined)
    setFilesFailure(undefined)
    setFolder('user')
    setOpenFile(undefined)
    setFileText(undefined)
    setFileFailure(undefined)
    setConfirmFile(undefined)
    setUploadError(undefined)
    setFileCopied(undefined)
    try {
      const [entry] = await Promise.all([read(id, { history: true }), loadFiles(id)])
      setDetail(entry)
    } catch (error: unknown) {
      setDetailFailure(messageOf(error))
    } finally {
      setDetailBusy(false)
    }
  }, [read, loadFiles])

  /**
   * 重取打开的那一条，**不清空**手上这一份。
   *
   * 与 {@link openEntry} 分开正是为了这一点：改一次状态不该让整块正文闪一下。
   */
  const reloadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await read(id, { history: true }))
      setDetailFailure(undefined)
    } catch (error: unknown) {
      setDetailFailure(messageOf(error))
    }
  }, [read])

  const backToList = useCallback(() => {
    setOpenId(undefined)
    setDetail(undefined)
    setDetailFailure(undefined)
  }, [])

  /**
   * 一次写动作之后把两处都刷一遍。
   *
   * 台账那一遍是必须的，不是保险：改状态可能让这一行**离开**当前的状态筛选，只改本地那一
   * 行就会留下一行不该在这的；新建也可能落在当前筛选之外。两遍并发发出去，屏幕上只闪一次。
   */
  const afterWrite = useCallback(async (id: string, done: string): Promise<void> => {
    await Promise.all([load(), reloadDetail(id)])
    setFlash(done)
    setFailure(undefined)
  }, [load, reloadDetail])

  /** 改状态。 */
  const changeStatus = async (next: RequirementStatus): Promise<void> => {
    if (detail === undefined || next === detail.status) return
    setFlash(undefined)
    setWriting(true)
    try {
      await update(detail.id, { status: next })
      await afterWrite(detail.id, t('requirement.saved'))
    } catch (error: unknown) {
      setFailure(messageOf(error))
    } finally {
      setWriting(false)
    }
  }

  /** 追加一段标注。 */
  const addNote = async (): Promise<void> => {
    if (detail === undefined) return
    const text = note.trim()
    if (text === '') {
      setNoteError(t('requirement.noteEmpty'))
      return
    }
    setWriting(true)
    try {
      await annotate(detail.id, text)
      setNote('')
      setNoteError(undefined)
      await afterWrite(detail.id, t('requirement.annotated'))
    } catch (error: unknown) {
      setNoteError(messageOf(error))
    } finally {
      setWriting(false)
    }
  }

  /** 废弃。 */
  const archiveNow = async (): Promise<void> => {
    if (detail === undefined) return
    setFlash(undefined)
    setWriting(true)
    try {
      await archive(detail.id)
      setConfirm(undefined)
      await afterWrite(detail.id, t('requirement.archived'))
    } catch (error: unknown) {
      setFailure(messageOf(error))
    } finally {
      setWriting(false)
    }
  }

  /** 真删：条目连同目录一起没，所以先退回列表再刷。 */
  const deleteNow = async (): Promise<void> => {
    if (detail === undefined) return
    const id = detail.id
    setFlash(undefined)
    setWriting(true)
    try {
      await remove(id)
      setConfirm(undefined)
      backToList()
      await load()
      setFlash(t('requirement.removed'))
    } catch (error: unknown) {
      setFailure(messageOf(error))
    } finally {
      setWriting(false)
    }
  }

  /** 人的入口建一条。 */
  const file = async (): Promise<void> => {
    const name = draft.name.trim()
    if (draft.projectId === '') {
      setFormError(t('requirement.formNeedProject'))
      return
    }
    if (name === '') {
      setFormError(t('requirement.formNeedName'))
      return
    }
    setCreating(true)
    try {
      const answer = await create({ projectId: draft.projectId, name, body: draft.body.trim() })
      if (!answer.created) {
        // 面板这条路不去重（`requirement-service.ts` 规则 3），所以正常走不到这一支；
        // 但这个判别联合是服务的形状，客户端按它收窄，不假装那一支不存在。
        setFormError(t('requirement.duplicate', { name: answer.conflict.name }))
        return
      }
      setDraft(blankDraft(draft.projectId))
      setFormOpen(false)
      setFormError(undefined)
      // 新条目可能落在当前筛选之外（正筛着「已完成」就是），所以重读而不是插到最前。
      await load()
      setFlash(t('requirement.created'))
      setFailure(undefined)
    } catch (error: unknown) {
      setFormError(messageOf(error))
    } finally {
      setCreating(false)
    }
  }

  /** 把库根复制走：面板里能点到的路径，比让人去翻一个隐藏目录有用。 */
  const copyRoot = async (): Promise<void> => {
    const ok = await writeClipboard(root)
    setCopied(ok ? 'ok' : 'failed')
  }

  /** 展开／收起一个附件的正文。再点同一个就是收起，省一个「收起」按钮的地方。 */
  const readAttachment = async (dir: RequirementDir, name: string): Promise<void> => {
    if (detail === undefined) return
    const key = fileKey(dir, name)
    if (openFile === key) {
      setOpenFile(undefined)
      setFileText(undefined)
      setFileFailure(undefined)
      return
    }
    setOpenFile(key)
    setFileText(undefined)
    setFileFailure(undefined)
    setFileBusy(true)
    try {
      setFileText(await fileRead(detail.id, dir, name))
    } catch (error: unknown) {
      setFileFailure(messageOf(error))
    } finally {
      setFileBusy(false)
    }
  }

  /**
   * 复制一个附件的完整路径。
   *
   * 草图这里是「打开」，本仓没有「用系统的文件管理器打开一个路径」这条现成的宿主能力
   * （与库根那个按钮同一条结论，§十九.6），所以退成复制——路径在剪贴板里，粘到资源管理器
   * 或编辑器里一样能开，而且不假装有一个没实现的动作。
   */
  const copyFilePath = async (dir: RequirementDir, name: string): Promise<void> => {
    const base = files?.dir ?? ''
    const ok = await writeClipboard(`${base}/${dir}/${name}`)
    setFileCopied(ok ? 'ok' : 'failed')
  }

  /** 删一个附件。与条目本身一样两步：删掉的东西不在回收站里。 */
  const removeFileNow = async (dir: RequirementDir, name: string): Promise<void> => {
    if (detail === undefined) return
    setWriting(true)
    try {
      await removeFile(detail.id, dir, name)
      setConfirmFile(undefined)
      if (openFile === fileKey(dir, name)) {
        setOpenFile(undefined)
        setFileText(undefined)
      }
      await loadFiles(detail.id)
      setFlash(t('requirement.fileRemoved'))
      setFileFailure(undefined)
    } catch (error: unknown) {
      setFileFailure(messageOf(error))
    } finally {
      setWriting(false)
    }
  }

  /**
   * 归档一件使用者原件。
   *
   * 一律进 `user/`：这个按钮存在的理由就是 §三 那一行「归档使用者提供的原件」，而
   * `generated/` 与 `patches/` 是模型写自己产物的地方。撞名由宿主加 `-2`，绝不覆盖——
   * 这是「他给的」那半边唯一不能出错的动作。
   */
  const uploadAttachment = async (picked: File): Promise<void> => {
    if (detail === undefined) return
    setUploading(true)
    setUploadError(undefined)
    try {
      const answer = await importFile(detail.id, 'user', picked)
      await loadFiles(detail.id)
      setFolder('user')
      setFlash(answer.renamedFrom === undefined
        ? t('requirement.uploaded', { name: answer.file.name })
        : t('requirement.uploadedRenamed', { from: answer.renamedFrom, name: answer.file.name }))
    } catch (error: unknown) {
      setUploadError(messageOf(error))
    } finally {
      setUploading(false)
    }
  }

  const markdownLabels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('requirement.copyCode'), copiedLabel: t('requirement.copied') },
    footnotes: t('requirement.footnotes'),
  }), [t])

  const loading = busy && rows.length === 0 && failure === undefined
  /** 追溯那几段。没取到（或没要历史）就是空的。 */
  const notes = detail?.notes ?? []
  /** 眼下这个文件夹里的文件。还没取到、或那个目录是空的，就是一张空表。 */
  const shown = files?.groups.find(group => group.dir === folder)?.files ?? []
  const countIn = (dir: RequirementDir): number =>
    files?.groups.find(group => group.dir === dir)?.files.length ?? 0
  const projectName = (id: string): string =>
    projects.find(candidate => candidate.projectId === id)?.name ?? id

  const emptyTitle = loading
    ? t('requirement.loadingList')
    : indexError !== undefined
      ? t('requirement.emptyUnreadable')
      : projectId === '' && status === 'all'
        ? t('requirement.empty')
        : t('requirement.emptyFiltered')

  return (
    <Modal
      open
      onClose={onClose}
      title={t('requirement.title')}
      closeLabel={t('requirement.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('requirement.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('requirement.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body, css.scrollBody)}>
        <section className={cn(base.detailPane)} aria-label={t('requirement.title')}>
          {openId === undefined && (
            <>
              <div className={css.toolbar}>
                <span className={css.picker}>
                  <label htmlFor="yon-rq-project">{t('requirement.project')}</label>
                  <select
                    id="yon-rq-project"
                    className={cn(css.select)}
                    value={projectId}
                    onChange={(event) => { setProjectId(event.target.value) }}
                  >
                    <option value="">{t('requirement.projectAll')}</option>
                    {projects.map(project => (
                      <option key={project.projectId} value={project.projectId}>{project.name}</option>
                    ))}
                  </select>
                </span>
                <span className={css.picker}>
                  <label htmlFor="yon-rq-status">{t('requirement.status')}</label>
                  <select
                    id="yon-rq-status"
                    className={cn(css.select)}
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value === 'all' ? 'all' : event.target.value as RequirementStatus)
                    }}
                  >
                    {STATUS_FILTERS.map(value => (
                      <option key={value} value={value}>
                        {value === 'all' ? t('requirement.statusAll') : t(STATUS_LABEL_KEYS[value])}
                      </option>
                    ))}
                  </select>
                </span>
                <div className={css.actions}>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={formOpen}
                    onClick={() => {
                      setFormOpen(value => !value)
                      setFormError(undefined)
                      setDraft(current => current.projectId === '' ? blankDraft(projectId) : current)
                    }}
                  >
                    {formOpen ? t('requirement.formClose') : t('requirement.new')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
                    {busy ? t('requirement.loading') : t('requirement.refresh')}
                  </Button>
                </div>
              </div>

              {/* 这一屏有两个词不是自明的：「需求条目」和「追溯」。一行说清就好。 */}
              <p className={css.sectionNote}>{t('requirement.intro')}</p>

              {flash !== undefined && <p className={css.sectionNote} role="status">{flash}</p>}
              {projectFailure !== undefined && (
                <p className={css.sectionNote}>{t('requirement.projectFailed', { message: projectFailure })}</p>
              )}
              {indexError !== undefined && (
                <p className={css.sectionNote}>{t('requirement.readFailed', { message: indexError })}</p>
              )}
              {unreadable.length > 0 && (
                <p className={css.sectionNote}>
                  {t('requirement.unreadableCount', { count: String(unreadable.length) })}
                  {' '}
                  <span className={css.footPath}>{unreadable.join('、')}</span>
                </p>
              )}

              {formOpen && (
                <div className={css.noteForm}>
                  <p className={css.noteFormHead}>{t('requirement.formTitle')}</p>
                  <div className={css.noteFormGrid}>
                    <div className={css.field}>
                      <label className={css.fieldLabel} htmlFor="yon-rq-new-project">
                        {t('requirement.project')}
                      </label>
                      <select
                        id="yon-rq-new-project"
                        value={draft.projectId}
                        onChange={(event) => { setDraft({ ...draft, projectId: event.target.value }) }}
                      >
                        <option value="">{t('requirement.formPickProject')}</option>
                        {projects.map(project => (
                          <option key={project.projectId} value={project.projectId}>{project.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={css.field}>
                      <label className={css.fieldLabel} htmlFor="yon-rq-new-name">
                        {t('requirement.formName')}
                      </label>
                      <Input
                        id="yon-rq-new-name"
                        className={cn(base.inputFill)}
                        value={draft.name}
                        placeholder={t('requirement.formNameHint')}
                        onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }}
                      />
                    </div>
                    <div className={cn(css.field, css.fieldWide)}>
                      <label className={css.fieldLabel} htmlFor="yon-rq-new-body">
                        {t('requirement.formBody')}
                      </label>
                      <textarea
                        id="yon-rq-new-body"
                        value={draft.body}
                        placeholder={t('requirement.formBodyHint')}
                        onChange={(event) => { setDraft({ ...draft, body: event.target.value }) }}
                      />
                    </div>
                  </div>
                  {formError !== undefined && <p className={css.noteFormError} role="alert">{formError}</p>}
                  <div className={css.noteFormActions}>
                    <Button size="sm" variant="primary" disabled={creating} onClick={() => { void file() }}>
                      {creating ? t('requirement.formSaving') : t('requirement.formSubmit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFormOpen(false)
                        setFormError(undefined)
                        setDraft(blankDraft(projectId))
                      }}
                    >
                      {t('requirement.formCancel')}
                    </Button>
                    <span className={css.sectionNote}>{t('requirement.formHint')}</span>
                  </div>
                </div>
              )}

              {loading || rows.length === 0
                ? (
                  <div className={cn(base.empty)}>
                    <span className={cn(base.emptyMark)} aria-hidden="true"><SheetMark /></span>
                    <p className={cn(base.emptyTitle)}>{emptyTitle}</p>
                    {/* 只有「压根还没记过」才解释这套东西是什么；筛没筛出结果、台账读不出来，
                        那两种情况下读者已经知道了。 */}
                    {!loading && indexError === undefined && rows.length === 0 && (
                      <>
                        <p className={cn(base.note)}>{t('requirement.emptyWhy')}</p>
                        <p className={cn(base.note)}>{t('requirement.emptyHow')}</p>
                      </>
                    )}
                  </div>
                )
                : (
                  <ul className={css.list}>
                    {rows.map(row => (
                      <li key={row.id} className={cn(css.row)}>
                        <button
                          type="button"
                          className={css.rowHead}
                          onClick={() => { void openEntry(row.id) }}
                        >
                          <span className={css.rowTags}>
                            <span className={css.rowName}>{row.name}</span>
                            <span className={cn(base.tag, statusTag(row.status))}>
                              {t(STATUS_LABEL_KEYS[row.status])}
                            </span>
                          </span>
                          <span className={css.rowMeta}>
                            {t('requirement.rowMeta', {
                              created: shortDate(row.createdAt),
                              updated: shortDate(row.updatedAt),
                            })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

              {root !== '' && (
                <p className={css.foot}>
                  <span>{t('requirement.count', { count: String(rows.length) })}</span>
                  <span className={css.footPath}>{t('requirement.rootAt', { path: root })}</span>
                  <button type="button" className={cn(css.copy)} onClick={() => { void copyRoot() }}>
                    {copied === 'ok' ? t('requirement.copied') : t('requirement.copyRoot')}
                  </button>
                  {copied === 'failed' && (
                    <span className={css.footPath}>{t('requirement.copyFailed')}</span>
                  )}
                </p>
              )}
            </>
          )}

          {openId !== undefined && (
            <>
              <div className={css.toolbar}>
                <Button size="sm" variant="ghost" onClick={backToList}>
                  {t('requirement.back')}
                </Button>
                <span className={css.detailHead}>
                  <span className={css.detailNameText}>{detail?.name ?? t('requirement.loading')}</span>
                  {detail !== undefined && (
                    <span className={cn(base.tag, statusTag(detail.status))}>
                      {t(STATUS_LABEL_KEYS[detail.status])}
                    </span>
                  )}
                </span>
              </div>

              {flash !== undefined && <p className={css.sectionNote} role="status">{flash}</p>}
              {detailBusy && detail === undefined && (
                <p className={css.sectionNote}>{t('requirement.loadingEntry')}</p>
              )}
              {detailFailure !== undefined && (
                <p className={css.sectionNote} role="alert">
                  {t('requirement.detailFailed', { message: detailFailure })}
                </p>
              )}

              {detail !== undefined && (
                <>
                  <p className={css.sectionNote}>
                    {t('requirement.entryMeta', {
                      project: projectName(detail.projectId),
                      created: shortDate(detail.createdAt),
                      id: detail.id,
                    })}
                  </p>

                  <p className={css.blockHead}>{t('requirement.prose')}</p>
                  {detail.prose === undefined || detail.prose === ''
                    ? <p className={css.sectionNote}>{t('requirement.proseEmpty')}</p>
                    : (
                      <div className={css.prose}>
                        <MarkdownText text={detail.prose} labels={markdownLabels} />
                      </div>
                    )}

                  <button
                    type="button"
                    className={css.traceHead}
                    aria-expanded={traceOpen}
                    onClick={() => { setTraceOpen(value => !value) }}
                  >
                    <span aria-hidden="true">{traceOpen ? '▾' : '▸'}</span>
                    {' '}
                    <span>{t('requirement.trace')}</span>
                    <span className={css.traceCount}>
                      {notes.length === 0
                        ? t('requirement.traceNone')
                        : t('requirement.traceCount', {
                          count: String(notes.length),
                          at: shortDate(detail.updatedAt),
                        })}
                    </span>
                  </button>
                  {traceOpen && (
                    notes.length === 0
                      ? <p className={css.sectionNote}>{t('requirement.traceEmpty')}</p>
                      : (
                        <ul className={css.traces}>
                          {notes.map((entry, index) => (
                            // 段没有 id，位置就是它的身份：标注只追加不改写，所以下标在两次
                            // 读取之间是稳定的。
                            <li key={index} className={css.trace}>
                              <MarkdownText text={entry} labels={markdownLabels} />
                            </li>
                          ))}
                        </ul>
                      )
                  )}

                  <p className={css.statusRow}>
                    <label htmlFor="yon-rq-detail-status">{t('requirement.status')}</label>
                    <select
                      id="yon-rq-detail-status"
                      className={cn(css.select)}
                      value={detail.status}
                      disabled={writing}
                      onChange={(event) => { void changeStatus(event.target.value as RequirementStatus) }}
                    >
                      {STATUSES.map(value => (
                        <option key={value} value={value}>{t(STATUS_LABEL_KEYS[value])}</option>
                      ))}
                    </select>
                  </p>

                  <div className={css.noteForm}>
                    <label className={css.fieldLabel} htmlFor="yon-rq-note">{t('requirement.note')}</label>
                    <textarea
                      id="yon-rq-note"
                      value={note}
                      placeholder={t('requirement.noteHint')}
                      onChange={(event) => { setNote(event.target.value) }}
                    />
                    {noteError !== undefined && <p className={css.noteFormError} role="alert">{noteError}</p>}
                    <div className={css.noteFormActions}>
                      <Button size="sm" variant="primary" disabled={writing} onClick={() => { void addNote() }}>
                        {writing ? t('requirement.noteSaving') : t('requirement.noteSubmit')}
                      </Button>
                      <span className={css.sectionNote}>{t('requirement.noteExplain')}</span>
                    </div>
                  </div>

                  {/* 附件：三个目录各带一个数，点哪个看哪个。文件本身不落进这一屏的状态里，
                      它就在磁盘上——这里画的每一行都来自一次 `readdir`。 */}
                  <div className={css.files}>
                    <p className={css.blockHead}>{t('requirement.files')}</p>
                    <p className={css.sectionNote}>{t('requirement.filesHint')}</p>
                    <div className={css.folderTabs} role="group" aria-label={t('requirement.files')}>
                      {REQUIREMENT_DIRS.map(dir => (
                        <button
                          key={dir}
                          type="button"
                          aria-pressed={folder === dir}
                          title={t(DIR_LABEL_KEYS[dir])}
                          className={cn(css.folderTab, folder === dir && css.folderTabOn)}
                          onClick={() => {
                            setFolder(dir)
                            // 换一格就把第二问收掉：那一问针对的是上一个目录里的某一行。
                            setConfirmFile(undefined)
                          }}
                        >
                          {`${dir}/`}
                          <span className={css.folderCount}>{countIn(dir)}</span>
                        </button>
                      ))}
                    </div>

                    {filesBusy && files === undefined && (
                      <p className={css.sectionNote}>{t('requirement.filesLoading')}</p>
                    )}
                    {filesFailure !== undefined && (
                      <p className={css.sectionNote} role="alert">
                        {t('requirement.filesFailed', { message: filesFailure })}
                      </p>
                    )}
                    {files !== undefined && shown.length === 0 && (
                      <p className={css.sectionNote}>{t('requirement.filesEmpty')}</p>
                    )}
                    {files !== undefined && shown.length > 0 && (
                      <ul className={css.fileList}>
                        {shown.map(entry => {
                          const key = fileKey(entry.dir, entry.name)
                          const open = openFile === key
                          return (
                            <li key={key} className={css.fileRow}>
                              <div className={css.fileHead}>
                                <span className={css.fileName}>{entry.name}</span>
                                <span className={css.fileMeta}>
                                  {sizeText(entry.bytes)}
                                  {' · '}
                                  {shortDate(entry.modifiedAt)}
                                </span>
                                <span className={css.fileActions}>
                                  {/* 预测说读不了的就不给这个按钮：点一下再被告知
                                      「读不了」，等于拿一次等待换一句本来就看得到的话。 */}
                                  {entry.readable && (
                                    <button
                                      type="button"
                                      className={css.fileAction}
                                      onClick={() => { void readAttachment(entry.dir, entry.name) }}
                                    >
                                      {open ? t('requirement.fileHide') : t('requirement.fileRead')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={css.fileAction}
                                    onClick={() => { void copyFilePath(entry.dir, entry.name) }}
                                  >
                                    {t('requirement.fileCopyPath')}
                                  </button>
                                  {confirmFile === key
                                    ? (
                                      <span className={css.ask}>
                                        {t('requirement.fileRemoveAsk')}
                                        <Button
                                          size="sm"
                                          variant="primary"
                                          disabled={writing}
                                          onClick={() => { void removeFileNow(entry.dir, entry.name) }}
                                        >
                                          {t('requirement.removeYes')}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => { setConfirmFile(undefined) }}>
                                          {t('requirement.removeNo')}
                                        </Button>
                                      </span>
                                    )
                                    : (
                                      <button
                                        type="button"
                                        className={css.fileAction}
                                        disabled={writing}
                                        onClick={() => { setConfirmFile(key) }}
                                      >
                                        {t('requirement.fileRemove')}
                                      </button>
                                    )}
                                </span>
                              </div>

                              {!entry.readable && entry.note !== undefined && (
                                <p className={css.fileNote}>{entry.note}</p>
                              )}

                              {open && (
                                <div className={css.fileText}>
                                  {fileBusy && <p className={css.sectionNote}>{t('requirement.fileReading')}</p>}
                                  {fileFailure !== undefined && (
                                    <p className={css.fileNote} role="alert">{fileFailure}</p>
                                  )}
                                  {fileText !== undefined && fileText.note !== undefined && (
                                    <p className={css.fileNote}>{fileText.note}</p>
                                  )}
                                  {fileText !== undefined && fileText.text !== '' && (
                                    <pre className={css.filePre}>{fileText.text}</pre>
                                  )}
                                  {fileText !== undefined && fileText.text === '' && fileText.note === undefined && (
                                    <p className={css.fileNote}>{t('requirement.fileNoText')}</p>
                                  )}
                                  {fileText !== undefined && fileText.text !== '' && (
                                    <p className={css.sectionNote}>
                                      {t('requirement.fileEncoding', { encoding: fileText.encoding })}
                                    </p>
                                  )}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {fileCopied === 'ok' && <p className={css.sectionNote}>{t('requirement.copied')}</p>}
                    {fileCopied === 'failed' && <p className={css.sectionNote}>{t('requirement.copyFailed')}</p>}
                    {uploadError !== undefined && (
                      <p className={css.noteFormError} role="alert">
                        {t('requirement.uploadFailed', { message: uploadError })}
                      </p>
                    )}
                    {/* 那句话说的是动作行里那个按钮的下场，所以挨着这一块说，而不是塞进
                        已经排满的按钮行。 */}
                    <p className={css.sectionNote}>{t('requirement.uploadHint')}</p>
                  </div>

                  {/* 动作行钉在本表自己的类上，不放宽共享那条 `:last-child`：这一屏的动作行
                      下面还有东西，共享那条够不到它（浏览器面板同一手法）。 */}
                  <div className={css.actionsDock}>
                    {/* 「归档附件」不是按钮而是套着一个文件选择的 label：宿主这套按钮原语
                        画的是一个 `<button>`，把 `<input type="file">` 塞进 button 里是不合法
                        的嵌套，点下去也不一定会开选择器。label 是这件事唯一标准的做法——
                        点文字即点控件，键盘与读屏都照旧。 */}
                    <label className={css.uploadLabel}>
                      {uploading ? t('requirement.uploading') : t('requirement.upload')}
                      <input
                        id="yon-rq-upload"
                        type="file"
                        className={css.uploadInput}
                        disabled={uploading}
                        onChange={(event) => {
                          const picked = event.target.files?.[0]
                          // 选完就清空 value：同一个文件连选两次不发第二次 change，而
                          // 「刚才那次没成功，再传同一个」正是最常见的下一步。
                          event.target.value = ''
                          if (picked !== undefined) void uploadAttachment(picked)
                        }}
                      />
                    </label>
                    {confirm === 'archive'
                      ? (
                        <span className={css.ask}>
                          {t('requirement.archiveAsk')}
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={writing}
                            onClick={() => { void archiveNow() }}
                          >
                            {t('requirement.archiveYes')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirm(undefined) }}>
                            {t('requirement.archiveNo')}
                          </Button>
                        </span>
                      )
                      : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={writing || detail.status === 'dropped'}
                          onClick={() => { setConfirm('archive') }}
                        >
                          {t('requirement.archive')}
                        </Button>
                      )}
                    {confirm === 'delete'
                      ? (
                        <span className={css.ask}>
                          {t('requirement.removeAsk')}
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={writing}
                            onClick={() => { void deleteNow() }}
                          >
                            {t('requirement.removeYes')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirm(undefined) }}>
                            {t('requirement.removeNo')}
                          </Button>
                        </span>
                      )
                      : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={writing}
                          onClick={() => { setConfirm('delete') }}
                        >
                          {t('requirement.remove')}
                        </Button>
                      )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}
