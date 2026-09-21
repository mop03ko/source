# Үлдэгдлийн тайлангийн шинэчлэл

- Нэгдсэн, график, жагсаалт гэсэн гурван харагдац.
- Эхний үлдэгдэл, орлого, зарлага, эцсийн үлдэгдлийн тоо болон өртөг.
- Тоо ширхэг эсвэл өртгөөр харуулах баганан график, ангиллын бүтэц. Долоон гол ангиллын дараахыг Бусад болгон нэгтгэнэ.
- Дууссан, нөхөн татах барааг нэг даралтаар шүүх; сөрөг үлдэгдэл болон ойролцоо өртгийн мэдээлэл.
- Өнөөдөр, энэ сар, энэ жил гэсэн хугацаа; гараар огнооны хүрээ сонгох боломж хэвээр.
- Жагсаалтыг нэр, өртөг, үлдэгдэл, зарлагаар эрэмбэлэх; бүх хуудасны нийлбэр, барааны ангилал, эцсийн үлдэгдлийн төлөв харагдана.
- Бараа/ангилал/брэнд/нийлүүлэгчийн тайлан болон CSV сонгосон ижил шүүлтүүрээр тооцогдоно.

## Тооцоолол

Үндсэн ledger тооцоолол өөрчлөгдөөгүй. Өдөр эхлэх, дуусах хязгаар UTC+08, дуусах өдрийн бүх хөдөлгөөн багтана. График, үзүүлэлтүүд эхний 50 мөрөөс биш бүх тохирох бараанаас сервер дээр тооцогдоно. Орлого, зарлагад шилжүүлэг, буцаалт, тооллогын тохируулга ордог. Тоо өөрчлөхгүй өртгийн тохируулга байвал тусад нь тайлбарлана. Худалдах үнэ биш агуулахын өртгийг ашиглана. Барааны дэлгэрэнгүй нь одоогийн үлдэгдэл харуулдаг болохыг жагсаалтын тайлбарт тэмдэглэв.

## Баталгаажуулалт

Автомат тестээр 51 барааны хуудаслалт, графикийн нийлбэр, CSV/жагсаалт/бүлэглэл ижил дүнтэй эсэх, хугацаа, агуулах, ангилал, хоосон үр дүн, эрэмбэлэлтийг шалгав. Browser audit нь гурван харагдац, хэмжүүр солих, хоосон үлдэгдлийн шүүлтүүр, desktop/mobile хэмжээ болон графикийг шалгана. Зургийн нотолгоо `artifacts/inventory-audit/balance-charts*.png`.

Бараа, үнэ, үлдэгдлийн өгөгдөлд бичилт хийгээгүй; migration шаардлагагүй. Графикийн код тайланг нээхэд ачаалагдана.


## Clarity update
- Unified Ant Design table for individual records and category/brand/supplier groups; same opening, incoming, outgoing, closing order and all-page totals.
- Separate quantity and warehouse-cost typography; closing balance highlighted, negative stock and estimated cost labels, per-record zero-quantity cost adjustments exposed.
- Mobile cards use a two-column breakdown with totals, avoiding a wide financial table on phones.
- KPI cards explain opening and closing timestamps. Expandable reading guide explains valuation, transfers, returns, adjustments and current metadata grouping. Category bars explicitly represent comparison with the largest category, not percentage shares.
- Summary is hidden during refresh/errors to avoid showing stale figures under changed filters. Grouping controls are expanded in the balance report.
- Validation: production build, scoped ESLint, existing inventory API balance reconciliation tests; isolated Chrome audit across 390/768/1440px with totals, supplier grouping and chart/list switching.

## Breakdown dimensions
The closing-balance chart supports category, brand, supplier and warehouse. The selection persists in the URL. Clicking a group opens its filtered item list. Blank brand/supplier groups can be drilled into. Warehouse quantities and costs come from dated ledger entries for the filtered item set; an item in multiple warehouses is counted once per warehouse, so item counts are not additive. API regression tests reconcile all four dimensions with summary totals under date, warehouse, brand and stock filters. Chrome audit checks dimension switching, mobile layout and warehouse drill-down.
