# NCC 前端 · 从编译产物还原源码

> **什么时候读我**：手上只有**编译过的东西**——别人环境里的 chunk、线上部署目录里的 js、补丁包里的文件——要先弄清它原本写了什么。
> 结论先说：这套脚手架打出来的产物，**多数情况下不需要"反编译"**，源码是白送的，有三条路。

## 先按这个顺序找

| 顺序 | 找什么 | 命中就怎么做 |
| --- | --- | --- |
| ① | bundle 末尾有没有 `//# sourceMappingURL=xxx.js.map` | 抓同目录 `.map`，读它的 `sourcesContent` —— **原文，逐字** |
| ② | 同目录或上级有没有 `__SOURCE__CODE__/` | 直接读，那就是源码副本（打包时自动复制过去的） |
| ③ | 两样都没有 | 才轮到"逆向"：格式化 + 字符串分析（见最后一节） |

---

## 途径一：source map 的 `sourcesContent` 就是原始文件（已实测）

这个脚手架**开发态与测试态都带 source map**：

| 场景 | 命令 | 配置出处 | 有 map 吗 |
| --- | --- | --- | --- |
| 开发态 | `npm run dev` | `config/webpack.dev.config.js:43` `devtool: 'source-map'` | **有**（外部 `.map`） |
| 测试打包 | `npm run test` → `node ./config/index.js test` | 走 prod 配置（`config/index.js:69`），再命中 `config/webpack.prod.config.js:99` `mode === 'test' && (prodConfig.devtool = 'source-map')` | **有** |
| 生产打包 | `npm run build` | `config/webpack.prod.config.js:45` `devtool: false` | 无 map，但见途径二 |

**实测**（NCC1909-2005 首创工程的示例页）：bundle 42 022 字节、map 36 462 字节、`sources` 只有 6 项，
其中业务模块是 `webpack://[name]/./src/domain/module/node/page/index.js`，
它的 `sourcesContent` 就是**原始文件本身**：注释、中文、**JSX**、缩进全在。还原出来的文件 1383 字节
（UTF-8 无 BOM、35 行、含 `通用脚手架` 与 `<div`），与源文件一致。

把 map 还原成目录树，一个脚本就够（放在工程外跑，不污染工程）：

```js
// unmap.js <bundle.js.map> <outDir>
const fs = require('fs'), path = require('path');
const m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let n = 0;
m.sources.forEach((s, i) => {
  const c = m.sourcesContent && m.sourcesContent[i];
  if (c == null) return;                       // 有些构建会剥掉 sourcesContent
  let rel = s.replace(/^webpack:\/\/[^/]*\//, '');
  if (rel.startsWith('webpack/') || rel.startsWith('external')) return;  // 运行时壳与 externals 不是业务代码
  rel = rel.split('?')[0].replace(/^\.\//, '');
  const f = path.join(process.argv[3], rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, c, 'utf8');
  n++; console.log('restored:', rel, '(' + c.length + ' chars)');
});
console.log('total files:', n);
```

用法：`node unmap.js ./dist/index.js.map ./restored`。

**两条边界**：

- 若 `sourcesContent` 为空（有的构建会剥掉，只留 mappings），就只能按行列去查映射，**无法整文件还原**；
- `react` / `react-dom` / `nc-lightapp-front` 是 externals，map 里只有一行外部声明 —— **平台库的源码永远拿不到**（也不需要，那是平台的东西）。

> 顺带说：排查线上页面白屏时，如果 chunk 带 map，就不用 `new Function(code)` 重跑抓栈了，
> 直接把报错行号喂给 map 就能看到源码那一行（做法见 `startup-and-troubleshooting.md` 第四节）。

---

## 途径二：生产产物里自带源码副本（`__SOURCE__CODE__`）

`config/webpack.prod.config.js:67` 注册了自定义插件：

```js
new OutputSourcePlugin({ output: '__SOURCE__CODE__' }),
```

`config/OutputSourcePlugin.js:22-34` 在 `done` 钩子里，把 `compilation.fileDependencies` 中
所有**不含 node_modules** 的文件，按"相对工程根目录"的路径复制到：

```
<outputPath>/__SOURCE__CODE__/src/…        ← 就是源码原文
<outputPath>/__SOURCE__CODE__/config.json  ← 连同二开配置一起
```

推论（**客开排查里很值钱**）：拿到别人环境的部署目录，**先找 `__SOURCE__CODE__`**，
常常不用逆；`npm run build` / `npm run test` 都会产出它。
（本条由打包脚本源码读出，本工程尚未跑过 build，未现场验证。）

---

## 途径三：只有压缩过的 bundle 时，能恢复什么

Terser 把生产包压过之后（`config/webpack.prod.config.js:70-90`），信息是有损的，但**损耗得很有规律**：

| 类别 | 能不能拿回来 | 说明 |
| --- | --- | --- |
| 控制流、函数结构、调用顺序 | 能 | 格式化（prettier / js-beautify）后即可读 |
| 字符串常量 | 能 | 中文提示、接口 URL、字段名、`pagecode` / `appcode`、参照 id 都在 |
| 模块边界与依赖图 | 能 | 数 `__webpack_require__(n)` 的出现，画出模块引用关系 |
| 导出名 | 能 | UMD 导出用字符串属性键，mangle 压不掉 |
| JSX | 部分 | `React.createElement(...)` 可用 babel 插件转回 JSX，但类组件 / 闭包 / HOC 转不完美 |
| 变量名、函数名 | **不能** | mangle 不可逆，只能靠上下文猜（看它被赋值给什么、传给了谁） |
| 注释 | **不能** | 除 `@ncctag` 之外全被删 |
| 被 tree-shaking / DCE 删掉的代码 | **不能** | 分支里没走到、没被引用的，产物里根本没有 |

**客开场景下通常够用**：要回答的多半是"它调了哪个接口、用了哪张表、判断条件是什么、弹了什么提示"，
这些全是字符串和字面量。

---

## 一眼看出版本来源：`@ncctag`

`config/webpack.prod.config.js:49-60` 用 BannerPlugin 给产物打头注，
Terser 里又用 `comments: /@ncctag/i` 把它保住（`config/webpack.prod.config.js:85`）：

```
@ncctag {"project":"…","branch":"…","provider":"…","date":"…"}
```

拿到一个来源不明的 js，先看这行 —— 项目、分支、打包人、打包时间都在，
比对着 `config.json` 的 `patch` 配置就能判断它是谁、哪一版打出来的。
