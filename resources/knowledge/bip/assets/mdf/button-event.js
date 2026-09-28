/**
 * MDF 扩展脚本模板 - 按钮事件
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      // 定义代理
      viewmodel.setProxy({
        queryData: {
          url: '/api/query',
          method: 'POST',
          options: { mask: true, uniform: true }
        },
        saveData: {
          url: '/api/save',
          method: 'POST',
          options: { mask: true }
        }
      });

      // 自定义按钮事件
      var btnCustom = viewmodel.get('btnCustom');
      if (btnCustom) {
        btnCustom.on('click', function () {
          var fieldA = viewmodel.get('fieldA').getValue();

          if (!fieldA) {
            cb.utils.alert('请先选择字段A', 'warning');
            return;
          }

          var proxy = viewmodel.getProxy('queryData');
          proxy.ensure({ fieldA: fieldA }, function (resp) {
            if (resp.success) {
              cb.utils.alert('操作成功', 'success');
              viewmodel.execute('refresh');
            }
          });
        });
      }
    }
  };

  try {
    module.exports = {BillCode}_{VMCode}_VM_Extend;
  } catch (e) {
    console.error(e);
  }
  return {BillCode}_{VMCode}_VM_Extend;
});
