/**
 * MDF 扩展脚本模板 - 行内过滤（子表行编辑时过滤）
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      var gridModel = viewmodel.getGridModel('childrenField');
      if (!gridModel) return;

      // 行内参照过滤 - 使用 editRowModel
      gridModel.on('afterCellValueChange', function (data) {
        if (data.cellName !== 'productRefer') return;

        var editRowModel = gridModel.getEditRowModel();
        if (!editRowModel) return;

        var supplierRefer = editRowModel.get('supplierRefer');
        if (!supplierRefer) return;

        // 每次打开前重新设置过滤
        supplierRefer.on('beforeBrowse', function () {
          var productId = editRowModel.get('productId').getValue();
          var orgId = viewmodel.get('orgId').getValue();

          this.setFilter({
            isExtend: true,
            simpleVOs: [
              { field: 'productId', op: 'eq', value1: productId },
              { field: 'orgId', op: 'eq', value1: orgId }
            ]
          });
        });
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
