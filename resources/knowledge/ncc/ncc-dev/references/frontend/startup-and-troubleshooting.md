# NCC 前端脚手架 · 启动与排障

> **什么时候读我**：拿到一个 `hotwebs` 脚手架工程要**把它跑起来**（装依赖、配代理、起 dev server），或者它**起来了但页面不对**（白屏、走了不该走的后端、代理 404）。
> 工程"是什么、怎么编译、产物去哪"看 `scaffold-overview.md`；本篇只讲**启动流程 + 排查手法**。

**样本工程**：`E:\NCProject\NCC1909\shouchuang\NCC_1909_2005_hotwebs\hotwebs`（NCC1909-2005，客户"首创"）
**实测时间**：2026-10-14，全部结论均在本机跑通验证。

---

## 一、启动四步

### 1. 用对 Node 版本

工程是 2019 年的产物（webpack 4 / babel 6），本机实测用 **Node 14.21.3**（`E:\nvm\v14.21.3`）通过。
不切换到老 Node 时，先用 `node -v` 确认当前 shell 里生效的是哪个版本 —— nvm 的
`$env:PATH = "<版本目录>;" + $env:PATH` 只对当前进程链生效。

### 2. `npm install`：**不要用退出码判断装好没有**

首次安装可能中断在 rename 阶段，报的是这种错：

```
npm ERR! code ENOENT
npm ERR! syscall rename
npm ERR! path  ...\node_modules\bee-clipboard\node_modules\bee-modal
npm ERR! dest  ...\node_modules\bee-clipboard\node_modules\.bee-modal.DELETE
```

**直接重跑一次 `npm install` 即可**（实测第二次 `added 320 packages … moved 100 packages`，
1000+ 个包目录已就位）。注意两点：

- 重跑后**退出码仍可能是 1**（收尾阶段的同类告警），**别据此判定失败**；
- 真正的判据是**关键包在不在**：

  | 路径 | 实测版本 |
  | --- | --- |
  | `node_modules/webpack/bin/webpack.js` | 4.47.0 |
  | `node_modules/webpack-dev-server/bin/webpack-dev-server.js` | 3.11.3 |
  | `node_modules/webpack-cli` | 3.1.1 |
  | `node_modules/babel-loader` | 7.x |

  依赖表里那一长串 peer warning（`bee-*` 要 react 15/16）是**正常的**：react 在
  `webpack.common.js` 里是 externals，运行时从平台库取，本来就不装。

### 3. `config.json` 的 `proxy` 必须指向**本机正在跑的那个 NCC 后端**

```json
"proxy": "http://127.0.0.1:9009"
```

工程自带的 proxy 往往是一台远端环境（实测样本里是 `http://10.11.115.119:8080`，本机不可达），
**dev server 起来后所有平台库、登录页都靠它转发**，指错了页面就是白屏或 404。

怎么确认本机后端是哪个端口：

1. 找 Java 进程：命令行里出现 `ufmiddle.start.tomcat.StartDirectServer`，带
   `-Dnc.runMode=develop`、`-Duap.hotwebs=nccloud,fs`，`-Dnc.home.name=…` 指出用的是哪个 home；
2. 该进程的监听端口就是后端端口；
3. 两个探针确认它是活的：

   ```
   GET http://127.0.0.1:<port>/nccloud                        → 200（一段浏览器检测/跳转脚本）
   GET http://127.0.0.1:<port>/nccloud/resources/platform/react.js → 200（平台库可取）
   ```

   实测本机：`127.0.0.1:9009`，home = `…\shouchuang\home\ncc1909new`。

> 这同时也是**前端能离线开发的前提**：平台库不进业务 bundle（externals），dev 期间全靠这个后端提供。

### 4. `npm run dev`

`webpack-dev-server` + `webpack.dev.config.js`，编译成功即输出 `Compiled successfully.`，
监听 `0.0.0.0:<devPort>`（本工程 3006）。
`OpenBrowserPlugin` 会自动打开 `http://localhost:<port>/nccloud`（后端的登录页）——
**登录态只影响业务数据，不影响静态页面本身**。

---

## 二、起来之后的验证清单

按这个顺序点一遍，能一次定位是"本地没命中"还是"代理没通"：

| 请求 | 期望 | 说明 |
| --- | --- | --- |
| `/nccloud/resources/{入口路径}/index.html` | 200，内容是**本地模板**（含 `<div id="app">`、引 `/…/index.js`） | bypass 判成"本地"才对 |
| `/nccloud/resources/{入口路径}/index.js` | 200 | 本地编译产物（UMD，react 等走 externals） |
| `/nccloud/resources/platform/react.js` | 200 | 由 proxy 转发到后端 → 代理通了 |
| 浏览器打开该地址 | `#app` 里有内容 | 端到端通了 |

**本地页面地址怎么拼**（容易记错，就一条公式）：

```
/nccloud/resources/ + <buildEntryPath 去掉 ./src/ 前缀、去掉 /index.js 后缀> + /index.html
```

例：`./src/domain/module/node/page/index.js`
→ `http://localhost:3006/nccloud/resources/domain/module/node/page/index.html`

---

## 三、dev 的代理分流规则（`config/proxyLocation.js`）

理解它，才不会把"看到后端的旧页面"当成没热更新：

- 只对 `/nccloud` 生效（`/spr` 一律直通后端）；
- 拿请求路径与 `config.json.buildEntryPath` 的每一项比**目录段**：段数相同、逐段相等才命中（`*` 可通配）；
- 命中 → 返回 `req.url.replace('/nccloud/resources', '')`，交给 dev server 的本地资源；
- 未命中 → 继续代理到 `configJSON.proxy`。

推论：**`buildEntryPath` 写死了哪些页面，就只有那些页面走本地**。改动别的目录下的文件不会有任何反应
（"改了没生效"第一嫌疑），本工程当前只指向 `./src/domain/module/node/page/index.js`。

---

## 四、白屏排查：资源全 200、`#app` 却是空的

这是最容易卡住的一类。先把"平台/链路坏"和"业务代码坏"分开：

**① 抓 bundle 的真实错误**（工具里读不到 console 时最有效的一招）——取回 bundle 源码重跑一遍：

```js
fetch('/domain/module/node/page/index.js').then(r=>r.text()).then(code=>{
  try { new Function(code).call(window); return 'ok'; }
  catch(e){ return e.message + ' || ' + (e.stack||'').split('\n').slice(0,6).join(' >> '); }
})
```

实测拿到的原话：
`TypeError: Super expression must either be null or a function, not undefined`
（抛在 `_inherits`，即 `class X extends Page` 里的 `Page` 是 `undefined`）。

**② 反查平台到底导出了什么**：

```js
Object.keys(window['nc-lightapp-front'])
```

NCC1909 实测 62 个键，含 `createPage` / `base` / `high` / `shell` / `viewModel` / `ESAPI` / `ajax` /
`toast` / `cardCache` / `getMultiLang` …，**没有 `Page`**，`base.Page` / `high.Page` 也都是 `undefined`；
**本地后端与线上环境（10.10.10.71:9003）完全一致**。

**③ 用平台库直接渲染一个最小组件**，判断东家是谁：

```js
const P = window['nc-lightapp-front'], R = window.React, RD = window.ReactDOM;
const W = P.createPage({})(class extends R.Component {
  render(){ return R.createElement('div', {style:{padding:'24px'}}, 'createPage 渲染成功'); }
});
RD.render(R.createElement(W), document.getElementById('app'));
```

- 能渲染出来 → 平台库、externals、代理链路**全都正常**，问题在业务代码（典型就是用了不存在的导出）；
- 渲染不出来 → 往平台库加载 / 代理方向查。

> 结论：**1909 的页面必须用 `createPage(...)(Component)` 包装**，`class X extends Page` 是前身版本的写法，
> 详见 `scaffold-overview.md` 第七节第 5 条。示例页白屏就属于这一条。

---

## 五、下一步去哪儿

| 想做的事 | 去处 |
| --- | --- |
| 加自己的页面 / 改入口范围 | `scaffold-overview.md` 第三节（入口约定）+ 本篇第三节（buildEntryPath 决定本地命中） |
| 页面怎么写（范式、`this.props`） | `page-patterns.md`、`list-page-template.md`、`card-page-template.md` |
| 生产构建产物落哪、怎么打补丁 | `scaffold-overview.md` 第四节、第五节 |
| 改文件前的编码纪律（GBK） | `encoding-and-tools.md` |
