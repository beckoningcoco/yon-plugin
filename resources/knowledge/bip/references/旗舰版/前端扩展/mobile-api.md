# MDF App 移动端 API 规范

## 概述

本文档提供 MDF 移动端（mtl.*）API 规范，按业务领域分类。

**平台兼容性**：
- 📱 iOS - iOS 移动端
- 🤖 Android - Android 移动端
- 🌐 Web - Web 端

---

## API 分类索引

| 分类 | API | 平台 | 说明 |
|------|-----|------|------|
| [音频管理](#一音频管理) | startRecord/stopRecord/playVoice | 📱🤖🌐 | 录音播放 |
| [数据缓存](#二数据缓存) | setStorage/getStorage | 📱🤖🌐 | 本地存储 |
| [设备能力](#三设备能力) | getMac/dail | 📱🤖 | 设备信息 |
| [图像文件](#四图像与文件) | chooseImage/uploadFile | 📱🤖🌐 | 图片上传 |
| [系统交互](#五系统交互) | openShare/scanQRCode | 📱🤖🌐 | 分享扫码 |
| [网络请求](#六网络请求) | request/getOAuthCode | 📱🤖🌐 | HTTP请求 |

---

## 一、音频管理

### 1.1 录音

#### 开始录音

```javascript
mtl.startRecord({
  success: function(res) {
    var localId = res.localId; // 录音本地ID（BASE64编码）
  },
  fail: function(err) {
    var message = err.message; // 错误信息
  }
});
```

#### 结束录音

```javascript
mtl.stopRecord({
  success: function(res) {
    var localId = res.localId; // 录音本地ID
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 监听录音自动停止

```javascript
mtl.onVoiceRecordEnd({
  success: function(res) {
    var localId = res.localId;
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 1.2 播放

#### 播放录音

```javascript
mtl.playVoice({
  localId: '录音本地ID',
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 暂停播放

```javascript
mtl.pauseVoice({
  localId: '录音本地ID',
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 停止播放

```javascript
mtl.stopVoice({
  localId: '录音本地ID',
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 监听播放完毕

```javascript
mtl.onVoicePlayEnd({
  success: function(res) {
    var localId = res.localId;
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 1.3 语音识别

#### 语音转文字

```javascript
mtl.voiceToText({
  success: function(res) {
    var text = res.text; // 识别结果
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 语音文件转文字

```javascript
mtl.translateVoice({
  success: function(res) {
    var translateResult = res.translateResult;
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 1.4 语音合成

#### 开始语音合成

```javascript
mtl.startSpeechSyn({
  success: function(res) {
    // 合成成功
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 停止语音合成

```javascript
mtl.stopSpeechSyn({
  success: function(res) {
    // 停止成功
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 二、数据缓存

### 存储数据

```javascript
mtl.setStorage({
  domain: 'a',           // 域标识
  key: 'key',            // 键名
  data: 'value',         // 数据值
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 获取数据

```javascript
mtl.getStorage({
  domain: 'a',
  key: 'key',
  success: function(res) {
    var value = res.data; // 没取到值时为 null
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 移除数据

```javascript
mtl.removeStorage({
  domain: 'a',
  key: 'key',
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 清除所有数据

```javascript
mtl.clearStorage({
  domain: 'a',
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 三、设备能力

### 3.1 屏幕方向

#### 强制横竖屏

```javascript
mtl.changeScreenOrientation({
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 恢复默认

```javascript
mtl.restoreScreenOrientation({
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 3.2 设备信息

#### 获取 MAC 地址

```javascript
mtl.getMac({
  success: function(res) {
    var macAddress = res.macAddress;
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 获取网络状态

```javascript
mtl.getNetworkType({
  success: function(res) {
    var networkType = res.networkType; // wifi/2g/3g/4g/unknown/none
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 获取平台

```javascript
var platform = mtl.platform;
// 'ios' | 'android' | 'web'
```

### 3.3 拨打电话

```javascript
mtl.dail({
  number: '123456',
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 四、图像与文件

### 4.1 选择图片

#### 调用相机/相册

```javascript
mtl.chooseImage({
  count: 1,                       // 选择数量
  sourceType: ['album', 'camera'], // 来源
  success: function(res) {
    var localIds = res.localIds;   // 本地ID列表
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 选择并上传

```javascript
mtl.chooseImageToServer({
  count: 1,
  sourceType: ['album', 'camera'],
  watermark: {
    text: '水印内容',
    position: '0',
    font: 0,
    color: '#ffffff',
    alpha: 0.5
  },
  success: function(res) {
    var pictures = res.pictures;
    var picture = pictures[0];
    var thumbUrl = picture.thumbUrl;       // 缩略图地址
    var originalUrl = picture.originalUrl; // 原始图片地址
    var originalSize = picture.originalSize; // 原始文件大小
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 4.2 图片处理

#### 获取图片 Base64

```javascript
mtl.getLocalImgData({
  localId: '本地图片ID',
  success: function(res) {
    var localData = res.localData; // Base64数据
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 4.3 文件上传

```javascript
mtl.uploadFile({
  url: '上传地址',
  filePath: '文件路径',
  header: {
    'content-type': 'multipart/form-data'
  },
  formData: {},
  success: function(res) {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 五、系统交互

### 5.1 分享

#### 打开分享面板

```javascript
mtl.openShare({
  title: '分享标题',
  desc: '分享描述',
  imgUrl: '图片地址',
  link: '链接地址',
  success: function(res) {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 直接分享

```javascript
mtl.doShare({
  type: '分享类型',
  title: '分享标题',
  desc: '分享描述',
  imgUrl: '图片地址',
  link: '链接地址',
  success: function(res) {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 5.2 二维码

#### 扫码

```javascript
mtl.scanQRCode({
  scanType: ['qrCode', 'barCode'], // 扫码类型
  needResult: 1,                     // 返回结果
  success: function(res) {
    var result = res.resultStr; // 扫码结果
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 生成二维码

```javascript
mtl.generateQRCode({
  str: '二维码内容',
  size: 200, // 生成图片大小，默认 100x100
  success: function(res) {
    var src = res.imgSrc; // Base64 图片
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 5.3 地理位置

#### 打开地图

```javascript
mtl.openLocation({
  latitude: 40.068928,    // 纬度
  longitude: 116.236847,  // 经度
  name: '用友软件园',
  address: '北清路68号',
  scale: 28,             // 缩放级别
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 获取位置

```javascript
mtl.getLocation({
  type: 'wgs84', // 坐标系类型
  success: function(res) {
    var latitude = res.latitude;  // 纬度
    var longitude = res.longitude; // 经度
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

### 5.4 WebView

#### 是否可返回

```javascript
mtl.isWebviewCanGoBack({
  success: function(res) {
    var result = res.result; // true/false
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

#### 返回上一级

```javascript
mtl.onWebviewGoBack({
  success: function() {
    // 成功回调
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 六、网络请求

### 6.1 OAuth 授权

```javascript
mtl.getOAuthCode({
  url: '授权地址',
  accessToken: '访问令牌',
  tenantId: '租户ID',
  success: function(res) {
    var code = res.access_code;
  },
  fail: function(err) {
    var message = err.message;
  },
  complete: function(res) {
    if (res.code == 200) {
      var data = res.data;
    } else {
      var message = res.message;
    }
  }
});
```

### 6.2 HTTP 请求

```javascript
mtl.request({
  url: 'https://some-domain.com/api/user',
  method: 'get',           // get/post/put/delete
  headers: {
    'X-Requested-With': 'XMLHttpRequest'
  },
  params: {
    ID: 12345
  },
  success: function(res) {
    var data = res.data;
  },
  fail: function(err) {
    var message = err.message;
  }
});
```

---

## 七、业务场景示例

### 7.1 语音录入场景

```javascript
// 开始录音
mtl.startRecord({
  success: function(res) {
    var localId = res.localId;
    console.log('开始录音:', localId);
  }
});

// 停止录音并转文字
mtl.stopRecord({
  success: function(res) {
    var localId = res.localId;
    mtl.voiceToText({
      success: function(result) {
        var text = result.text;
        viewModel.get('remark').setValue(text);
      }
    });
  }
});
```

### 7.2 图片上传场景

```javascript
// 选择图片并上传
mtl.chooseImageToServer({
  count: 1,
  sourceType: ['album', 'camera'],
  success: function(res) {
    var picture = res.pictures[0];
    // 保存图片地址
    viewModel.get('imageUrl').setValue(picture.originalUrl);
  }
});
```

### 7.3 扫码录入场景

```javascript
// 扫码录入
mtl.scanQRCode({
  scanType: ['qrCode'],
  needResult: 1,
  success: function(res) {
    var code = res.resultStr;
    // 根据扫码结果查询数据
    var proxy = viewModel.getProxy('queryByCode');
    proxy.ensure({ code: code }, function(resp) {
      if (resp.success) {
        viewModel.get('productCode').setValue(resp.data.code);
        viewModel.get('productName').setValue(resp.data.name);
      }
    });
  }
});
```

### 7.4 位置签到场景

```javascript
// 获取位置并签到
mtl.getLocation({
  type: 'wgs84',
  success: function(res) {
    var latitude = res.latitude;
    var longitude = res.longitude;

    // 校验是否在指定范围内
    var distance = calculateDistance(
      latitude, longitude,
      targetLatitude, targetLongitude
    );

    if (distance <= 100) { // 100米范围内
      mtl.getLocation({
        success: function(locateRes) {
          viewModel.get('latitude').setValue(locateRes.latitude);
          viewModel.get('longitude').setValue(locateRes.longitude);
          viewModel.execute('save');
        }
      });
    } else {
      cb.utils.alert('当前位置距离签到点过远', 'warning');
    }
  }
});
```

---

## 八、注意事项

### 8.1 平台差异

| API | iOS | Android | Web |
|-----|-----|---------|-----|
| 录音/播放 | ✅ | ✅ | ✅ |
| 语音识别 | ✅ | ✅ | ⚠️ 需授权 |
| 图片上传 | ✅ | ✅ | ⚠️ 限制 |
| 拨打电话 | ✅ | ✅ | ❌ |
| 设备MAC | ⚠️ | ✅ | ❌ |

### 8.2 权限要求

部分 API 需要用户授权：
- 录音：麦克风权限
- 位置：定位权限
- 相机：摄像头权限
- 相册：存储权限

### 8.3 错误处理

所有 API 都应包含 fail 回调：

```javascript
mtl.someApi({
  success: function(res) { /* 成功处理 */ },
  fail: function(err) {
    cb.utils.alert(err.message || '操作失败', 'error');
  }
});
```
