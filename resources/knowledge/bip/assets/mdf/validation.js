/**
 * MDF 扩展脚本模板 - 保存校验
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      // 保存前校验
      viewmodel.on('beforeSave', function () {
        var fieldA = viewmodel.get('fieldA').getValue();
        var fieldB = viewmodel.get('fieldB').getValue();

        if (!fieldA) {
          cb.utils.alert('字段A不能为空', 'error');
          return false;
        }

        if (fieldA > fieldB) {
          cb.utils.alert('字段A不能大于字段B', 'error');
          return false;
        }

        // 子表校验
        var gridModel = viewmodel.getGridModel('childrenField');
        if (gridModel) {
          var rows = gridModel.getRows();
          if (rows.length === 0) {
            cb.utils.alert('明细不能为空', 'error');
            return false;
          }
        }

        return true;
      });
    }
  };

  try {
    module.exports = {BillCode}_{VMCode}_VM_Extend;
  } catch (e) {
    console.error(e);
  }
  return {BillCode}_{VMCode}_VM_Extend;
});
