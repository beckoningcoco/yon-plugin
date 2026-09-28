/**
 * MDF 扩展脚本模板 - 字段联动
 * 文件名: {BillCode}_{VMCode}_VM.Extend.js
 */
cb.define(process.env.__DOMAINKEY__, ['common/common_VM.Extend.js'], function (common) {
  var {BillCode}_{VMCode}_VM_Extend = {

    doAction: function (name, viewmodel) {
      if (this[name]) this[name](viewmodel);
    },

    init: function (viewmodel) {
      var fieldA = viewmodel.get('fieldA');
      if (!fieldA) return;

      fieldA.on('afterValueChange', function (data) {
        var fieldB = viewmodel.get('fieldB');
        var fieldC = viewmodel.get('fieldC');

        if (!fieldB || !fieldC) return;

        // 枚举值判断
        if (data.value && data.value.value === 'TYPE_A') {
          // 联动赋值
          fieldB.setValue('defaultValue');
          // 清空其他字段
          fieldC.setValue(null);
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
