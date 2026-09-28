# 常见陷阱

## 1. getCache vs getFilterViewModel

```
业务语料：getCache('FilterViewModel') 有 2,190 个文件
        getFilterViewModel() 只有 31 个文件

为什么危险：
- 按频率学会把兼容写法当标准写法

默认做法：
- 页面脚本默认用 viewModel.getFilterViewModel()
```

## 2. commonVOs vs simpleVOs

```
业务语料：simpleVOs 有 6,530 个文件
        commonVOs 有 1,916 个文件

为什么危险：
- 老项目里仍能看到旧格式残留

默认做法：
- 参照过滤统一用 simpleVOs 格式
```

## 3. 查询区不是默认第一页

```
业务语料：*list*_VM.Extend.js 有 5,315 个文件
        *_filter_VM.Extend.js 只有 260 个文件

为什么危险：
- 容易把查询区当主入口
- 但大量查询区逻辑其实嵌在页面VM脚本里

默认做法：
- 先按"页面脚本任务"判断
- 命中查询区场景时，再进入查询区分支
```

## 4. common/common_VM.Extend.js 是复用层

```
业务语料：引用 common/common_VM.Extend.js 的文件有 9,567 个

为什么危险：
- 容易把公共方法当成页面直接行为

默认做法：
- 先判断当前文件是"注入公共模块"还是"直接写页面逻辑"
- 公共模块更适合当复用层参考
```

## 5. getGridModel() 无参危险

```
为什么危险：
- 无参时只返回当前页面上"第一个/主 GridModel"
- 一旦页面上有多个子表，容易拿错对象

默认做法：
- 默认显式传 childrenField
- viewModel.getGridModel('childrenField')
- 只有明确"当前页面唯一子表"时，才把无参写法当兼容简写
```

## 6. 枚举字段值判断

```
需求给显示值如"VMI采购"时，不要直接拿中文做判断

为什么危险：
- afterValueChange 里拿到的通常是选中节点对象
- 容易把 data.value.value 误当成显示文本

默认做法：
1. 先确认字段是不是 select/radio/dropdown/checkbox 枚举字段
2. 如果需求给的是显示名称，先从枚举列表查出实际 key
3. 业务条件默认比较 data.value.value
4. data.value.text 只用于显示、日志，不作为主判断条件
```

## 7. 参照字段跳详情不要重做组件

```
为什么危险：
- 很多"可点击字段跳档案详情"的字段本身已经是 ReferModel
- 一上来就换自定义组件，容易绕开原生联查链

默认做法：
1. 先确认显示字段是不是 ReferModel
2. 再确认页面里是否已有可复用的隐藏 id 字段
3. 满足条件时，优先走 bJointQuery + referKeyItemName + jointQueryOpt
4. 只有字段不是 refer，或交互明显超出原生能力时，再考虑自定义组件
```

## 8. 自定义弹窗不要默认先引新依赖

```
为什么危险：
- 很多业务弹窗本质是"打开自定义 modal + 填表 + 确认后回填"
- 一上来就引新 UI 依赖，容易把问题从"业务逻辑"放大成三件事

默认做法：
1. 先用 viewModel.communication({ type: 'modal' }) 打开自定义 modal
2. 组件优先复用项目现有 modal 体系
3. 组件内优先使用 batchViewModel 直接回填父页字段
4. 确认和取消统一走注入的 close()
5. 只有项目里确实没有可复用 modal 体系时，再考虑新增 UI 依赖
```

## 9. afterOkClick 不是通用返回事件

```
为什么危险：
- 容易把"参照确认链"与"普通页面返回链"混为一谈

默认做法：
- 普通页面关闭/回传优先看 communication({ type: 'return' })
- 参照新增、参照回填再看 referback
- afterOkClick 更适合放在参照弹窗确认场景里理解
```

## 10. addProperty 是高级分支

```
业务语料：addProperty 有 646 个文件

为什么容易误判：
- 它不是幻觉，也不是极冷门
- 但也没高到值得放进每个任务的默认主链

默认做法：
- 把它作为高级扩展能力对待
- 进入该主题时再读对应 API 和案例
```

## 11. communication() 很常见不要当边缘能力

```
业务语料：communication( 有 3,566 个文件

为什么重要：
- 返回链、弹窗、抽屉、回传都依赖它
- 如果只被藏在深层文档，会低估这条链路的重要性

默认做法：
- 在"返回/弹窗/通信"任务里优先进入对应专题
```

## 12. YNF 页面用 MDF API 全部无效 🆕

```
为什么危险：
- YNF 页面虽然用 designerScripts 结构，但 viewModel/gridModel 都不是全局变量
- viewModel.execute('refresh') / gridModel.refresh() 在 YNF 中全部报错
- 已有多个项目踩坑（首创CSV导入按钮调试了 5+ 轮才找到正确写法）

YNF 正确写法：
- 页面根状态：rootStore（按钮参数，非全局变量）
- 刷新列表：rootStore.actions.list.doAction() 或 rootStore.actions.billReload.doAction()
- 表格数据：rootStore.tableStore（MobX store，没有 refresh/reload 方法）
- 执行动作：rootStore.actions.xxx.doAction()

误判场景：
- 看到 designerScripts 就当成 MDF 写 → 全部报错
- 看到 rootStore 就当成 viewModel → rootStore.execute() 不存在
- tableStore 当成 gridModel → tableStore 没有网络请求方法

👉 详见 references/旗舰版/前端扩展/patterns/ynf-reference.md
```

## 13. 行状态必须正确标记

```javascript
// 正确：insertRow 时标记 Insert 状态
gridModel.insertRow(0, {
  ...data,
  _status: cb.models.DataStates.Insert
});

// 正确：updateRow 时标记 Update 状态
if (row._status !== cb.models.DataStates.Insert) {
  row._status = cb.models.DataStates.Update;
}
gridModel.updateRow(index, row);

// 正确：deleteRow 区分新增和已有
if (row._status === cb.models.DataStates.Insert) {
  gridModel.deleteRow(index);
} else {
  row._status = cb.models.DataStates.Delete;
  gridModel.updateRow(index, row);
}
```
