---
name: tesseract-ocr-path
description: 本地 Tesseract OCR 安装信息，用于在模型不支持直接读图时做 OCR 兜底
---

# Tesseract OCR 配置

- **安装路径**: `D:\ocr\tesseract.exe`
- **tessdata 目录**: `D:\ocr\tessdata\`
- **已安装语言包**: `chi_sim`, `chi_sim_vert`, `chi_tra`, `chi_tra_vert`, `eng`
- **pytesseract 调用方式**:

```python
import pytesseract
pytesseract.pytesseract.tesseract_cmd = 'D:/ocr/tesseract.exe'
from PIL import Image
text = pytesseract.image_to_string(img, lang='chi_sim+eng')
```

## 使用场景

消化知识时，当 Read 工具返回 `[Unsupported Image]`（当前模型不支持直接读图）时，用此 OCR 方案从截图中提取中文文字。

## 备注

- 中文 OCR 准确率取决于截图清晰度，对 UI 界面截图效果较好
- 输出可能有少量乱码/错位，但对用友社区的配置截图识别效果基本可用
- 大图建议先缩放再 OCR，提高速度
