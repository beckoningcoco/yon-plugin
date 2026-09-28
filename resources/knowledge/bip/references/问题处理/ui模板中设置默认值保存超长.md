---
name: ui模板中设置默认值保存超长
description: >
  用友 BIP 客开技能。当用户在 UI 模板设计器中设置字段默认值保存时报错 "Data too long for column 'cDefaultValue'"，默认值超过 45 个字符无法保存，需要通过扩展脚本实现时，参考该文档内容。
---

# ui模板中设置默认值保存超长

## 问题场景

在 UI 模板的设计器中，将字段备注设置默认值，保存设计器时报错：

```
模板统一存储服务异常！接口调用失败，执行服务域：domain:znbzbx,
sql异常，异常信息:执行sql出现异常:
Data truncation: Data too long for column 'cDefaultValue' at row 1 null
```

原因是后台数据库表的 `cDefaultValue` 长度只有 45，超过 45 个字符无法保存成功。

## 解决方案

通过扩展脚本在 `afterLoadData` 中设置默认值：

```js
viewModel.on('afterLoadData', function(data) {
  //页面初始化
  if(viewModel.getParams().mode == 'add'){
    // 新增状态设置默认值
    viewModel.get('vmemo').setValue('新增差旅单时，必须确保[长途交通票](动车票、机票、长途客运票)完整，采集的发票全选生成差旅报销单;若是已保存单据，再次编辑单据添加[长途交通票](动车票、机票、长途客运票)行程或者天数没有计算正确，请点击一下【AI帮我计算】，可进行重新算计(注意:一旦点击了【AI帮我计算】，之前手工填写的内容会清空，要重新填写一次)，采集电子发罩时可直接上传PDF文档。')
  }
});
```
