# 工厂实现示例

## AbstractTransInvoiceFactory

抽象工厂基类，提供发票数据转换的统一接口:

```java
public abstract class AbstractTransInvoiceFactory {

    // OCR识别数据转换
    protected abstract IdentifyResult transInvoiceData(JSONObject json);
    public IdentifyResult transInvoice(JSONObject json) {
        return transInvoiceData(json);
    }

    // PDF解析数据转换
    protected abstract Datas transPdfInvoiceData(JSONObject json);
    public JSONObject transPdfInvoice(JSONObject json) {
        // 构建PdfParseRspVo响应
        PdfParseRspVo invoiceRspVo = new PdfParseRspVo();
        invoiceRspVo.setCode(BipContrast.S_SUCCESS);
        invoiceRspVo.setMsg("处理成功");
        Datas data = transPdfInvoiceData(json);
        invoiceRspVo.setDatas(data);
        return (JSONObject) JSONObject.toJSON(invoiceRspVo);
    }
}
```

## VatTransInvoiceFactoryImpl - 增值税发票

增值税发票的OCR识别转换:

```java
@Service("VatTransTools")
public class VatTransInvoiceFactoryImpl extends AbstractTransInvoiceFactory {

    @Override
    protected IdentifyResult transInvoiceData(JSONObject json) {
        // 1. 将JSON转换为VAT发票DTO
        VatInvoiceDTO vatInvoiceDTO = json.toJavaObject(VatInvoiceDTO.class);

        // 2. 构建识别结果
        IdentifyResult identifyResult = new IdentifyResult();
        identifyResult.setBill_type("invoice");
        
        // 3. 获取发票类型
        String invoiceLine = vatInvoiceDTO.getInvoiceLine();
        OcrInvoiceType invoiceType = OcrInvoiceType.fromCode(invoiceLine);
        identifyResult.setType(invoiceType.getInvoiceCode());
        identifyResult.setDesc(invoiceType.getDescription());

        // 4. 转换发票明细
        Details details = new Details();
        details.setCode(vatInvoiceDTO.getInvoiceCode());
        details.setNumber(vatInvoiceDTO.getInvoiceNumber());
        details.setInvoice_type(invoiceType.getInvoiceCode());
        details.setDate(vatInvoiceDTO.getInvoiceTime());
        
        // 金额转换
        if (vatInvoiceDTO.getTaxFreeAmountTotal() != null) {
            details.setPretax_amount(vatInvoiceDTO.getTaxFreeAmountTotal().toString());
        }
        if (vatInvoiceDTO.getTaxAmountTotal() != null) {
            details.setTotal(vatInvoiceDTO.getTaxAmountTotal().toString());
        }
        if (vatInvoiceDTO.getTaxTotal() != null) {
            details.setTax(vatInvoiceDTO.getTaxTotal().toString());
        }

        // 购买方信息
        details.setBuyer(vatInvoiceDTO.getBuyerName());
        details.setBuyer_tax_id(vatInvoiceDTO.getBuyerTaxnum());
        details.setBuyer_bank_account(vatInvoiceDTO.getBuyerBankAccount());
        details.setBuyer_addr_tel(vatInvoiceDTO.getBuyerAddressTel());

        // 销售方信息
        details.setSeller(vatInvoiceDTO.getSellerName());
        details.setSeller_tax_id(vatInvoiceDTO.getSellerTaxnum());
        details.setSeller_addr_tel(vatInvoiceDTO.getSellerAddressTel());
        details.setSeller_bank_account(vatInvoiceDTO.getSellerBankAccount());

        // 5. 转换发票明细项
        if (vatInvoiceDTO.getDetails() != null && !vatInvoiceDTO.getDetails().isEmpty()) {
            List<Items> itemsList = new ArrayList<>();
            StringBuilder itemNamesBuilder = new StringBuilder();
            
            for (InvoiceDetailDTO detail : vatInvoiceDTO.getDetails()) {
                Items item = new Items();
                item.setName(detail.getGoodsName());
                item.setSpecification(detail.getSpecType());
                item.setUnit(detail.getGoodsUnit());
                if (detail.getGoodsNum() != null) {
                    item.setQuantity(detail.getGoodsNum().toString());
                }
                if (detail.getGoodsPrice() != null) {
                    item.setPrice(detail.getGoodsPrice().toString());
                }
                if (detail.getTaxFreeAmount() != null) {
                    item.setTotal(detail.getTaxFreeAmount().toString());
                }
                if (detail.getTax() != null) {
                    item.setTax(detail.getTax().toString());
                }
                if (StringUtils.isNotBlank(detail.getTaxrate())) {
                    item.setTax_rate(detail.getTaxrate());
                }
                
                itemsList.add(item);
                
                // 收集品名
                if (StringUtils.isNotBlank(detail.getGoodsName())) {
                    if (itemNamesBuilder.length() > 0) {
                        itemNamesBuilder.append(",");
                    }
                    itemNamesBuilder.append(detail.getGoodsName());
                }
            }
            
            details.setItems(itemsList);
            details.setItem_names(itemNamesBuilder.toString());
        }
        
        identifyResult.setDetails(details);
        return identifyResult;
    }
}
```

## TrainInvoiceFactoryImpl - 火车票

火车票的OCR识别转换:

```java
@Service("trainTransTools")
public class TrainInvoiceFactoryImpl extends AbstractTransInvoiceFactory {

    @Override
    protected IdentifyResult transInvoiceData(JSONObject json) {
        TrainTicketDTO trainTicketDTO = json.toJavaObject(TrainTicketDTO.class);

        IdentifyResult identifyResult = new IdentifyResult();
        identifyResult.setBill_type("train");
        
        String invoiceLine = trainTicketDTO.getInvoiceLine();
        OcrInvoiceType invoiceType = OcrInvoiceType.fromCode(invoiceLine);
        identifyResult.setType(invoiceType.getInvoiceCode());
        identifyResult.setDesc(invoiceType.getDescription());

        TrainParse trainParse = new TrainParse();
        trainParse.setId(trainTicketDTO.getTicketId());
        trainParse.setTrainNum(trainTicketDTO.getTrainNum());
        trainParse.setName(trainTicketDTO.getPassengerName());
        trainParse.setOrigin(trainTicketDTO.getDepartureStation());
        trainParse.setDestination(trainTicketDTO.getTerminus());
        trainParse.setNumber(trainTicketDTO.getTicketNum());
        trainParse.setTotalAmount(trainTicketDTO.getPrice());
        trainParse.setSeatNo(trainTicketDTO.getSeatNum());

        // 从出发时间中提取日期和时间部分
        if (trainTicketDTO.getDepartureTime() != null) {
            String departureTime = trainTicketDTO.getDepartureTime();
            if (departureTime.contains(" ")) {
                String[] parts = departureTime.split(" ");
                trainParse.setDate(parts[0]); // 日期部分
                trainParse.setTime(parts[1]); // 时间部分
            } else {
                trainParse.setDate(departureTime);
            }
        }
        trainParse.setKind(trainTicketDTO.getInvoiceLine());

        identifyResult.setTrainParse(trainParse);
        return identifyResult;
    }
}
```

## AirInvoiceFactoryImpl - 机票行程单

机票行程单的OCR识别转换:

```java
@Service("airTransTools")
public class AirInvoiceFactoryImpl extends AbstractTransInvoiceFactory {

    @Override
    protected IdentifyResult transInvoiceData(JSONObject json) {
        AirTransportInvoice airInvoice = json.toJavaObject(AirTransportInvoice.class);

        IdentifyResult identifyResult = new IdentifyResult();
        identifyResult.setBill_type("air");
        
        String invoiceLine = airInvoice.getInvoiceLine();
        OcrInvoiceType invoiceType = OcrInvoiceType.fromCode(invoiceLine);
        identifyResult.setType(invoiceType.getInvoiceCode());
        identifyResult.setDesc(invoiceType.getDescription());

        AirParse airParse = new AirParse();
        // 基本信息
        airParse.setInvoiceNo(airInvoice.getInvoiceNo());
        airParse.setInvoiceCode(airInvoice.getInvoiceCode());
        airParse.setInvoiceDate(airInvoice.getInvoiceDate());
        
        // 金额信息
        airParse.setExTaxAmount(airInvoice.getExTaxAmount());
        airParse.setTaxAmount(airInvoice.getTaxAmount());
        airParse.setSumAmount(airInvoice.getSumAmount());
        
        // 购买方信息
        airParse.setPayerName(airInvoice.getPayerName());
        airParse.setPayerTaxNo(airInvoice.getPayerTaxNo());
        
        // 乘客信息
        if (airInvoice.getAirTransportSpecialDetails() != null) {
            List<AirItem> airItems = new ArrayList<>();
            for (AirTransportSpecialDetail detail : airInvoice.getAirTransportSpecialDetails()) {
                AirItem item = new AirItem();
                item.setPassengerName(detail.getPassengerName());
                item.setTicketNum(detail.getTicketNum());
                item.setValidIdNum(detail.getValidIdNum());
                item.setDepartureStation(detail.getDepartureStation());
                item.setDestinationStation(detail.getDestinationStation());
                item.setFlight(detail.getFlight());
                item.setCarrier(detail.getCarrier());
                item.setSeatClass(detail.getSeatClass());
                item.setDepartureTime(detail.getDepartureTime());
                item.setDepartureDate(detail.getDepartureDate());
                
                airItems.add(item);
            }
            airParse.setAirItems(airItems);
        }

        identifyResult.setAirParse(airParse);
        return identifyResult;
    }
}
```

## BusTicketFactoryImpl - 汽车票

```java
@Service("busTransTools")
public class BusTicketFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换BusTicketDTO到BusTicket
}
```

## TaxiFactoryImpl - 出租车票

```java
@Service("taxiTransTools")
public class TaxitFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换TaxiInvoiceDTO到TaxiTicket
}
```

## QuotaFactoryImpl - 定额发票

```java
@Service("quotaTransTools")
public class QuotaFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换QuotaInvoiceDTO到QuotaInvoice
}
```

## TollInvoiceFactoryImpl - 通行费

```java
@Service("tollTransTools")
public class TollInvoiceFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换VehicleTollInvoiceDTO到TollInvoice
}
```

## MotorVehicleFactoryImpl - 机动车销售统一发票

```java
@Service("motorVehicleTransTools")
public class MotorVehicleFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换MotorVehicleInvoiceDTO到MotorVehicleInvoice
}
```

## UsedMotorVehicleFactoryImpl - 二手车销售统一发票

```java
@Service("usedMotorTransTools")
public class UsedMotorVehicleFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换UsedMotorVehicleInvoiceDTO到UsedMotorInvoice
}
```

## MachineInvoiceFactoryImpl - 通用机打发票

```java
@Service("machineTransTools")
public class MachineInvoiceFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换MachineInvoiceDTO到MachineInvoice
}
```

## GjdpFactoryImpl - 国际发票

```java
@Service("gjdpTransTools")
public class GjdpFactoryImpl extends AbstractTransInvoiceFactory {
    // 类似结构，转换GjdpInvoiceDTO到GjdpInvoice
}
```

## 新增发票类型支持

如需添加新的发票类型支持:

1. 在`OcrInvoiceType`枚举中添加新类型
2. 在`InvoiceType`枚举中添加新类型
3. 在`VerfityInvoiceType`枚举中添加验真映射(如需验真)
4. 创建新的Factory实现类继承`AbstractTransInvoiceFactory`
5. 在`InvoiceTransFactory`中添加映射

### 示例: 添加区块链发票支持

```java
// 1. OcrInvoiceType添加
BC("bc", "10109", "区块链电子发票", false, "1"),

// 2. 创建工厂实现
@Service("bcTransTools")
public class BcInvoiceFactoryImpl extends AbstractTransInvoiceFactory {
    @Override
    protected IdentifyResult transInvoiceData(JSONObject json) {
        // 实现转换逻辑
    }
}
```