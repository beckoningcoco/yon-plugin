# 发票类型详细说明

## OCR发票类型 (OcrInvoiceType)

### 增值税类发票

| code | invoiceCode | description | isVatInvoice | class |
|------|------------|-------------|--------------|-------|
| S | 10100 | 增值税专用发票 | true | 1 |
| P | 10102 | 增值税电子普通发票 | true | 1 |
| C | 10101 | 增值税普通发票 | true | 1 |
| B | 10106 | 增值税电子专用发票 | true | 1 |
| R | 10103 | 增值税普通发票(卷式) | true | 1 |

### 数电票

| code | invoiceCode | description | isVatInvoice | class |
|------|------------|-------------|--------------|-------|
| BS | 31 | 数电专票(电子) | true | 1 |
| PC | 32 | 数电普票(电子) | true | 1 |
| ES | 33 | 数电专票(纸质) | true | 1 |
| EC | 34 | 数电普票(纸质) | true | 1 |
| HK | 35 | 数电票(航空) | true | 5 |
| FLIGHT | 10506 | 数电票(航空)行程单 | true | 55 |

### 机动车类发票

| code | invoiceCode | description | isVatInvoice | class |
|------|------------|-------------|--------------|-------|
| J | 10104 | 机动车销售统一发票 | true | 2 |
| U | 10105 | 二手车销售统一发票 | true | 3 |
| DU | 84 | 数电二手车(电子) | true | 3 |
| SU | 88 | 数电二手车(纸质) | true | 3 |
| DJ | 32 | 数电机动车发票(电子) | true | 2 |

### 交通类发票

| code | invoiceCode | description | isVatInvoice | class |
|------|------------|-------------|--------------|-------|
| HC | 10503 | 火车票 | false | 8 |
| QC | 10505 | 汽车票 | false | 6 |
| LJ/FJ | 10506 | 机票行程单 | false | 5 |
| CZ | 10500 | 出租车票 | false | 7 |
| TX | 10507 | 车辆通行费 | false | 11 |

### 其他发票

| code | invoiceCode | description | isVatInvoice | class |
|------|------------|-------------|--------------|-------|
| JD | 10400 | 通用机打发票 | false | 4 |
| DZ | 10108 | 通用电子发票 | false | 1 |
| DE | 10200 | 定额发票 | false | 9 |
| GJ | 20100 | 国际发票 | false | 10 |
| OTHER | 20105 | 电子非税收入一般缴款书 | false | 12 |
| NOTAX | 20105 | 电子非税收入一般缴款书 | false | 12 |

## 验真类型映射 (VerfityInvoiceType)

### 增值税发票

| code | baiwang | bip | description |
|------|--------|-----|-------------|
| INVOICETYPE01 | 01 | 10100 | 增值税专用发票 |
| INVOICETYPE03 | 03 | 10104 | 机动车销售统一发票 |
| INVOICETYPE04 | 04 | 10101 | 增值税普通发票 |
| INVOICETYPE07 | 08 | 10100D | 增值税电子专用发票 |
| INVOICETYPE10 | 10 | 10102 | 增值税电子普通发票 |
| INVOICETYPE11 | 11 | 10103 | 增值税普通发票(卷式) |
| INVOICETYPE14 | 14 | 10102TRANSIT | 增值税电子普通发票(通行费) |
| INVOICETYPE15 | 15 | 10105 | 二手车销售统一发票 |

### 数电票

| code | baiwang | bip | description |
|------|--------|-----|-------------|
| INVOICETYPE31 | 31 | ELE10100 | 电子发票(增值税专用发票) |
| INVOICETYPE32 | 32 | ELE10101 | 电子发票(增值税普通发票) |
| INVOICETYPE85 | 85 | PAP10100 | 数电纸质发票(增值税专用发票) |
| INVOICETYPE86 | 86 | PAP10101 | 数电纸质发票(增值税普通发票) |

### 交通票

| code | baiwang | bip | description |
|------|--------|-----|-------------|
| INVOICETYPE1002 | 1002 | 10503 | 火车票 |
| INVOICETYPE1003 | 1003 | 10506 | 航空电子客票行程单 |
| INVOICETYPE1004 | 1004 | 10500 | 出租车发票 |
| INVOICETYPE1005 | 1005 | 10200 | 通用定额发票 |
| INVOICETYPE1006 | 1006 | 10505 | 公路水路客运发票 |
| INVOICETYPE1007 | 1007 | 10400 | 通用机打发票 |
| INVOICETYPE1008 | 1008 | 10507 | 过路费发票 |

### 其他

| code | baiwang | bip | description |
|------|--------|-----|-------------|
| INVOICETYPE99 | 99 | 10900 | 其他发票 |
| INVOICETYPE9901 | 9901 | 20105 | 电子非税收入一般缴款书 |
| INVOICETYPE9902 | 9902 | 20102 | 医疗电子票据(门诊) |
| INVOICETYPE9903 | 9903 | 20101 | 医疗电子票据(住院) |
| INVOICETYPE9905 | 9905 | 20100 | 国际发票 |
| INVOICETYPE9906 | 9906 | 10902 | 其他 |

## 发票类型class含义

| class | description |
|-------|-------------|
| 1 | 增值税发票 |
| 2 | 机动车销售统一发票 |
| 3 | 二手车销售统一发票 |
| 4 | 通用机打发票 |
| 5 | 机票行程单 |
| 6 | 汽车票 |
| 7 | 出租车票 |
| 8 | 火车票 |
| 9 | 定额发票 |
| 10 | 国际发票 |
| 11 | 通行费 |
| 12 | 其他财政票据 |

## 特殊类型处理

### 数电票行程单 (flight_itinerary)

当invoiceLine为`flight_itinerary`时，使用AirInvoiceImageFactoryImpl进行特殊处理。

### 数电卷(航空) (hk)

当invoiceLine为`hk`时，使用AirFileFactoryImpl进行PDF解析。

### 验真参数选择逻辑

根据发票类型选择不同的optionField:

1. **使用校验码后6位**: 04, 10, 11, 14 (普通发票类)
2. **使用不含税金额**: 01, 03, 08, 15, 85, 86 (专用发票类)
3. **使用价税合计**: 其他 (数电票、火车票、机票等)