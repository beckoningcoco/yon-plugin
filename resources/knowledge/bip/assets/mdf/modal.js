/**
 * MDF 扩展脚本模板 - 模态框
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      // 打开选择弹窗按钮
      var btnSelect = viewmodel.get('btnSelectSupplier');
      if (btnSelect) {
        btnSelect.on('click', function () {
          viewmodel.communication({
            type: 'modal',
            payload: {
              url: '/page/supplier-select',
              params: {
                orgId: viewmodel.get('orgId').getValue(),
                multiSelect: false
              }
            },
            callback: function (data) {
              if (data) {
                // 回填数据
                viewmodel.get('supplierId').setValue(data.id);
                viewmodel.get('supplierName').setValue(data.name);
              }
            }
          });
        });
      }

      // 打开详情抽屉
      var btnDetail = viewmodel.get('btnDetail');
      if (btnDetail) {
        btnDetail.on('click', function () {
          var supplierId = viewmodel.get('supplierId').getValue();
          if (!supplierId) {
            cb.utils.alert('请先选择供应商', 'warning');
            return;
          }

          viewmodel.communication({
            type: 'drawer',
            payload: {
              url: '/page/supplier-detail',
              params: { id: supplierId }
            },
            callback: function (data) {
              if (data && data.refresh) {
                viewmodel.execute('refresh');
              }
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
