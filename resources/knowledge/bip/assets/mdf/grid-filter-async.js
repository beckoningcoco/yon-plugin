/**
 * MDF 扩展脚本模板 - 子表参照过滤（异步获取条件）
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

      // 定义获取过滤条件的接口
      viewmodel.setProxy({
        getFilterCondition: {
          url: '/api/getFilterCondition',
          method: 'POST',
          options: { mask: true }
        }
      });

      gridModel.on('afterCellValueChange', function (data) {
        if (data.cellName !== 'productRefer') return;

        var editRowModel = gridModel.getEditRowModel();
        if (!editRowModel) return;

        var supplierRefer = editRowModel.get('supplierRefer');
        if (!supplierRefer) return;

        var productId = editRowModel.get('productId').getValue();

        supplierRefer.on('beforeBrowse', function () {
          var proxy = viewmodel.getProxy('getFilterCondition');
          proxy.ensure({ productId: productId }, function (resp) {
            if (resp.success) {
              this.setFilter({
                isExtend: true,
                simpleVOs: resp.data.simpleVOs || []
              });
            }
          }.bind(this));
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
