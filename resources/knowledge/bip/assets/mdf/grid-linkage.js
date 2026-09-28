/**
 * MDF 扩展脚本模板 - 表格单元格联动
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

      // 单元格联动
      gridModel.on('afterCellValueChange', function (data) {
        var rowIndex = data.rowIndex;
        var cellName = data.cellName;
        var value = data.value;

        // 数量变化时，重新计算金额
        if (cellName === 'qty' || cellName === 'price') {
          var qty = gridModel.getCellValue(rowIndex, 'qty') || 0;
          var price = gridModel.getCellValue(rowIndex, 'price') || 0;
          var amount = qty * price;

          // 使用批量方法更新
          gridModel.setCellValues([
            { rowIndex: rowIndex, cellName: 'amount', value: amount }
          ]);
        }

        // 产品变化时，清空规格
        if (cellName === 'productRefer') {
          gridModel.setCellValues([
            { rowIndex: rowIndex, cellName: 'spec', value: null }
          ]);
        }
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
