/**
 * MDF 扩展脚本模板 - 主表字段过滤
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      // 主表参照过滤
      var referField = viewmodel.get('referFieldName');
      if (referField) {
        referField.on('beforeBrowse', function () {
          var orgId = viewmodel.get('orgId').getValue();
          this.setFilter({
            isExtend: true,
            simpleVOs: [
              { field: 'orgId', op: 'eq', value1: orgId }
            ]
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
