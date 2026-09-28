# BIP 旗舰版 Save 请求报文乱码问题

## 问题

在 Chrome DevTools Network 面板查看 BIP 旗舰版的 save 请求，请求体（Request Payload）显示为乱码。

## 原因

BIP 前端框架默认对 save 请求体做 **LZ4 压缩**，二进制数据在 DevTools 中按 UTF-8 解码显示为乱码。属于正常行为，非 BUG。

## 解决办法

在浏览器控制台（Console）输入：

```javascript
cb.debug=true
```

然后刷新页面或重新保存单据，请求体就会以明文 JSON 形式发送，不再压缩。

## 适用场景

- 前后端联调时查看完整的 save 请求报文
- 排查保存数据错误
- 分析前端传给后端的字段结构

## 注意事项

- 仅用于开发调试，**生产环境不要开启**
- `cb.debug=true` 会关闭请求压缩，请求体积会变大，但不影响功能
- 调试完成后可设置 `cb.debug=false` 恢复压缩
