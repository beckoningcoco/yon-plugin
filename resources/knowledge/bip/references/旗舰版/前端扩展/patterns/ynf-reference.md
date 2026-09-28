# YNF 前端开发参考

> YNF（YonBuilder New Framework）是 BIP 的新一代前端框架，采用 MobX 状态管理。虽然页面脚本仍然使用 `designerScripts` 结构，但 API 与 MDF 有显著差异。

## YNF vs MDF API 对照

| 概念 | MDF 写法 | YNF 写法 |
|------|----------|----------|
| 页面根状态 | `viewModel`（全局变量） | `rootStore`（按钮参数 / 闭包内可用） |
| 执行动作 | `viewModel.execute('refresh')` | `rootStore.actions.xxx.doAction()` |
| 表格数据 | `gridModel`（全局变量） | `rootStore.tableStore` |
| 刷新列表 | `gridModel.refresh()` 或 `viewModel.execute('refresh')` | **`rootStore.actions.billReload.doAction()`** |
| 表单数据 | `simpleModel` | `rootStore.formStore` |
| 过滤条件 | `viewModel.getFilterViewModel()` | `rootStore.filterStore` |
| 页面级 store | `viewModel.getCache('xxx')` | `rootStore.xxxStore` |

## YNF 特有陷阱

### ❌ 这些在 YNF 中都不可用

```javascript
viewModel           // ReferenceError: viewModel is not defined
gridModel           // ReferenceError: gridModel is not defined
rootStore.execute() // TypeError: rootStore.execute is not a function
rootStore.get()     // 不一定存在，取决于 store 类型
```

### ❌ 列表页没有 `search` action

YNF 列表查询刷新 action 叫 **`billReload`**，不是 `search`。`list` 是初始查询需要 filter 参数，刷新复用当前条件用 `billReload`。

### ❌ tableStore 没有网络请求方法

`rootStore.tableStore` 是 MobX 内存 store，只有数据操作方法（`setData`/`getRows`/`addRow` 等），没有 `refresh()`/`reload()`/`load()`。刷新列表只能通过 action。

## 如何找到正确的 action

在按钮点击事件的 `debugger` 处，控制台执行：

```js
// 列出页面所有 action
Object.keys(rootStore.actions)
```

常见的 YNF 列表页 action：

| action 名 | 作用 |
|-----------|------|
| `list` | 初始查询（需要 filter 参数） |
| `billReload` | 刷新列表（复用当前查询条件） |
| `openBill` | 打开卡片页 |
| `editByRow` | 编辑行 |
| `copyByRow` | 复制行 |
| `batchDeleteByRow` | 批量删除 |
| `exportList` | 导出列表 |
| `batchAudit` / `batchUnAudit` | 审批/弃审 |
| `batchSubmit` / `batchUnSubmit` | 提交/收回 |

## 列表页文件上传刷新 — 完整模板

> 适用场景：YNF 列表页按钮点击 → 选文件 → upload → 刷新列表
> 项目来源：首创（机械总院）BIP 旗舰版，CSV 国资委导入

```javascript
rootStore.designerScripts = {
  Button1wIGonClick: function (rootStore, alias, event, rowStore) {
    // CSV导入——单击事件
    debugger;
    document.getElementById('file_input_info')?.click();

    function createInput() {
      const inputId = 'file_input_info';
      let fileInput = document.getElementById(inputId);
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.id = inputId;
        fileInput.type = 'file';
        fileInput.accept = '.xlsx,.xls,.csv';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', function (e) {
          const files = e.target.files;
          if (files.length === 0) return;

          const file = files[0];
          const formData = new FormData();
          formData.append('file', file); // key 需要和后端 @RequestParam("file") 对应

          const baseurl = cb.env.getMainOriginUrl();
          const url = baseurl + '/your-service/your-controller/your-endpoint';

          fetch(url, {
            method: 'POST',
            body: formData,
          })
            .then(function (res) { return res.json(); })
            .then(function (result) {
              debugger;
              if (!result || result.status === 0) {
                cb.utils.alert('上传失败：' + JSON.stringify(result), 'error');
                return;
              }
              if (result.asynchronized === 'true') {
                cb.utils.alert(result.msg || '已提交处理，请稍后查看结果', 'info');
                // 异步：等 3 秒再刷新
                setTimeout(function () {
                  rootStore.actions.billReload.doAction();
                }, 3000);
              } else {
                cb.utils.alert(result.msg || '上传成功', 'success');
                // 同步：500ms 等数据库提交
                setTimeout(function () {
                  rootStore.actions.billReload.doAction();
                }, 500);
              }
            })
            .catch(function (err) {
              cb.utils.alert(err.message, 'error');
            });

          e.target.value = ''; // 允许重复选同一个文件
        });
        fileInput.click();
      }
    }
  },
};
// disabled-row-code [designerScripts-end]
function ExtendStore() {}
function ExtendAction() {}
function ExtendReaction() {}
function ExtendRootStore() {}
return {
  ExtendStore,
  ExtendAction,
  ExtendReaction,
  ExtendRootStore,
};
```

## 调试技巧

在 `debugger` 断点处，浏览器控制台可以直接调用 action 快速验证：

```js
rootStore.actions.billReload.doAction() // 刷新列表（复用当前查询条件）
```

不需要每次都改代码 → 保存 → 部署，试出能用的再改脚本。
