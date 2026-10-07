/**
 * 附件这一层的三条规则：一个名字能不能读、一段字节到底是不是文本、撞名时叫什么。
 *
 * 这里全是纯函数，所以这一份是把规则**钉死**的地方——清单上的「可读」、读取时的
 * 拒绝、以及 `-2` 后缀，都是使用者一眼看得见的行为，而它们各自的实现都短到看起来
 * 不可能出错。
 *
 * 两处细节值得点名：
 *
 * - 编码走的是 `home-files.ts` 的 `decodeText`（BOM / XML 声明 / 严格 utf-8 / gb18030），
 *   这一份只验证「它确实被用上了」，不重复测那一份的每一项。中文 Windows 上的资料
 *   大多是 GBK，这条路径不是边角料。
 * - 按行截断有一条**破例**：第一行就超过额度时按字符硬切，而不是回一句「没有内容」。
 *   一行 JSON、压缩过的 js、一条 SQL 导出都会走到这条路上。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_READ_CHARS,
  attachmentText,
  classifyFile,
  extensionOf,
  freeName,
  sizeOf,
} from '../src/host/requirement-files.ts'

describe('extensionOf', () => {
  it('reads the last extension, lower-cased', () => {
    expect(extensionOf('方案.md')).toBe('md')
    expect(extensionOf('接口文档.TXT')).toBe('txt')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('a.b.c.D')).toBe('d')
  })

  it('treats a name with no extension as having none', () => {
    expect(extensionOf('Makefile')).toBe('')
    // A leading dot is a hidden file, not an extension — `.gitignore` is not a
    // "gitignore" file.
    expect(extensionOf('.gitignore')).toBe('')
    expect(extensionOf('a.')).toBe('')
    expect(extensionOf('')).toBe('')
  })
})

describe('classifyFile', () => {
  it('lets the workhorse text extensions through, including ones not on any list', () => {
    for (const name of ['说明.txt', '方案.md', 'Patch.java', 'fix.patch', 'schema.sql', 'a.yaml', 'README']) {
      expect(classifyFile(name)).toEqual({ readable: true })
    }
  })

  it('says the office archive formats are not read yet, and points at the batch', () => {
    for (const name of ['接口文档.docx', '清单.xlsx', '讲稿.pptx']) {
      const verdict = classifyFile(name)
      expect(verdict.readable).toBe(false)
      expect(verdict.note).toContain('压缩包')
      // "还没做" not "不支持": the operator should not conclude it will never work.
      expect(verdict.note).toContain('还读不了')
    }
    expect(classifyFile('接口文档.pdf').note).toContain('python')
  })

  it('says the old office formats are never coming, differently from the new ones', () => {
    const verdict = classifyFile('老文档.doc')
    expect(verdict.readable).toBe(false)
    expect(verdict.note).toContain('不打算支持')
    expect(verdict.note).toContain('另存为')
  })

  it('tells images and archives apart from documents in the reason it gives', () => {
    expect(classifyFile('截图.png').note).toContain('图片')
    expect(classifyFile('录屏.mp4').note).toContain('影音')
    expect(classifyFile('打包.zip').note).toContain('二进制')
    // An svg IS text and must not be swept up with the images.
    expect(classifyFile('图.svg')).toEqual({ readable: true })
  })
})

describe('attachmentText', () => {
  it('reads utf-8 and says so', () => {
    const read = attachmentText(Buffer.from('要接三个接口。\n第二行。', 'utf8'))
    expect(read.text).toBe('要接三个接口。\n第二行。')
    expect(read.encoding).toBe('utf-8')
    expect(read.truncated).toBe(false)
    expect(read.note).toBeUndefined()
  })

  it('reads GBK as GBK, which is what most operator documents on Windows are', () => {
    // 「接口」 in GBK. These are the GBK bytes themselves, not a utf-8 re-encoding of
    // the two characters — that would be four different bytes and prove nothing.
    const read = attachmentText(Buffer.from([0xbd, 0xd3, 0xbf, 0xda]))
    expect(read.text).toBe('接口')
    expect(read.encoding).toBe('gb18030')
  })

  it('honours a BOM rather than guessing from the first bytes', () => {
    const read = attachmentText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('接口', 'utf8')]))
    expect(read.text).toBe('接口')
    expect(read.encoding).toBe('utf-8')
  })

  it('refuses a binary and says which byte made it one', () => {
    const read = attachmentText(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x41]))
    expect(read.text).toBe('')
    expect(read.encoding).toBe('')
    expect(read.note).toContain('NUL')
  })

  it('cuts on a line boundary and says how many lines survived', () => {
    const text = Array.from({ length: 200 }, (_, index) => `第 ${index} 行`).join('\n')
    const read = attachmentText(Buffer.from(text, 'utf8'), 40)
    expect(read.truncated).toBe(true)
    expect(read.text.length).toBeLessThanOrEqual(40)
    expect(read.text).not.toContain('\n第 199 行')
    // Every line in the answer is a whole line.
    for (const line of read.text.split('\n')) expect(line).toMatch(/^第 \d+ 行$/)
    expect(read.note).toContain('前 ')
  })

  it('gives the head of a file whose FIRST line is longer than the whole budget', () => {
    // One line of 100k characters: a minified bundle, a one-line JSON, a SQL dump.
    // The rule about line boundaries is a preference, not a promise — returning
    // nothing here would answer "it has no text" about a file that is nothing but text.
    const oneLine = 'x'.repeat(100_000)
    const read = attachmentText(Buffer.from(oneLine, 'utf8'), 500)
    expect(read.text).toHaveLength(500)
    expect(read.text).toBe('x'.repeat(500))
    expect(read.truncated).toBe(true)
    expect(read.note).toContain('第一行就比这长')
  })

  it('defaults to the shipped character cap', () => {
    const read = attachmentText(Buffer.from('y'.repeat(MAX_FILE_READ_CHARS + 10), 'utf8'))
    expect(read.text).toHaveLength(MAX_FILE_READ_CHARS)
    expect(read.truncated).toBe(true)
  })
})

describe('freeName', () => {
  it('keeps the name when nothing is in the way', () => {
    expect(freeName('方案.md', [])).toBe('方案.md')
    expect(freeName('方案.md', ['别的.md'])).toBe('方案.md')
  })

  it('numbers the new one, before the extension so it still opens', () => {
    expect(freeName('方案.md', ['方案.md'])).toBe('方案-2.md')
    expect(freeName('方案.md', ['方案.md', '方案-2.md'])).toBe('方案-3.md')
    expect(freeName('fix.patch', ['fix.patch'])).toBe('fix-2.patch')
    expect(freeName('archive.tar.gz', ['archive.tar.gz'])).toBe('archive.tar-2.gz')
  })

  it('appends the number as-is for a name with no extension', () => {
    expect(freeName('Makefile', ['Makefile'])).toBe('Makefile-2')
    expect(freeName('.gitignore', ['.gitignore'])).toBe('.gitignore-2')
  })

  it('gives up rather than handing back a name that is taken', () => {
    const taken = ['方案.md', ...Array.from({ length: 98 }, (_, index) => `方案-${index + 2}.md`)]
    expect(freeName('方案.md', taken)).toBeUndefined()
  })
})

describe('sizeOf', () => {
  it('speaks bytes, KB and MB', () => {
    expect(sizeOf(0)).toBe('0 字节')
    expect(sizeOf(1023)).toBe('1023 字节')
    expect(sizeOf(1024)).toBe('1.0 KB')
    expect(sizeOf(1024 * 1024)).toBe('1.0 MB')
    expect(sizeOf(MAX_ATTACHMENT_BYTES)).toBe('50.0 MB')
  })
})
