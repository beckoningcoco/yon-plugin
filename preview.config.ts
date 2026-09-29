/**
 * 预览专用配置（临时，不进仓库）。
 *
 * 与主配置的两点差别都是为了让截图可信：
 * - `classNameStrategy: 'non-scoped'` 让 CSS Modules 的类名保持原名。主配置不处理
 *   CSS，`css.tally` 在测试里是 undefined——**这就是我先前"验证过"却什么也没验证
 *   到的原因**：结构对了，类名全是空的。
 * - 单个 spec、jsdom、不 mock primitives，用真实的 Modal 与 Button。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['preview/**/*.spec.tsx'],
    environment: 'jsdom',
    css: {
      // 类名保持原名。vitest 处理 CSS 模块时用它自己的生成器（产出
      // `_tally_41d0f6` 这种名字），**不读 vite 顶层的 `css.modules`**——放在
      // 那里试了两回都没生效。而预览页拼进去的是未编译的 CSS 原文，两边对不上，
      // 整份样式表就等于没写：截图里看到的其实是浏览器对 ul/li/button 的默认
      // 样式。第一版就是这么骗过去的——我截了图，却以为看到的是自己的设计。
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
})
