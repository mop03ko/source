# Барааны нэрээр брэнд тодорхойлсон үр дүн

2026-09-21. Хэрэглэгчийн хүсэлтээр CSV-ийн ижил нэр, бүтээгдэхүүний нэрэнд бичигдсэн брэнд, нотолгоотой бүтээгдэхүүний цувралаар ангилсан.

Нийт 3,115 бараанаас 3,056-г 24 брэндэд ангилсан. 2,325 барааны брэнд өөрчлөгдсөн; 731 нь аль хэдийн зөв байсан. Эргэлзээтэй 59 барааны өмнөх утгыг хэвээр хадгалсан тул тэдгээрийн хуучин брэнд баталгаажсан гэсэн үг биш.

| Брэнд | Тодорхойлсон барааны тоо |
|---|---:|
| APPLE | 1,869 |
| DJI | 450 |
| DYSON | 251 |
| POUT | 160 |
| SAMSUNG | 135 |
| CUCKOO | 77 |
| DEERMA | 35 |
| TECNO | 20 |
| SONY | 18 |
| AIMA | 8 |
| DELL | 7 |
| BODYLABS | 5 |
| ACER, ASUS, BEATS, BELKIN, EPSON, HIKVISION, JBL, MAMIBOT, MOPHIE | тус бүр 2 |
| G.SKILL, HP, UGREEN | тус бүр 1 |

## Ангиллын үндэслэл

- Нэрийн эхэнд DJI, DYSON, CUCKOO гэх мэт брэнд бичигдсэн бол түүнийг ашигласан.
- iPhone, iPad, MacBook, AirPods зэрэг нь [Apple-ийн бүтээгдэхүүний нэрс](https://www.apple.com/legal/intellectual-property/trademark/appletmlist.html). Бүртгэлийн iWatch + S/SE/Series/Ultra загварыг Apple Watch нэршлийн хувилбар гэж үзсэн; энэ нь нэрээс хийсэн дүгнэлт.
- Galaxy болон S25 Ultra-г [Samsung](https://www.samsung.com/global/sustainability/landing_hub-file/AZUXQdtKImgALYMV/Galaxy_S25_Ultra_Environmental_Report_EN.pdf), Osmo/Avata/Mavic-г CSV болон [DJI-ийн бүтээгдэхүүний цуврал](https://www.dji.com/support)-тай тулгасан.
- EYES/HANDS-ийг [POUT-ийн албан ёсны бүтээгдэхүүнүүд](https://poutofficial.com/), TEKDEC/TEKDEK, PCH ширээний цувралыг CSV-тэй тулгасан.
- PS5-г [Sony](https://www.sony.com/en/SonyInfo/design/stories/PS5/), Mophie-г [тусдаа Mophie брэнд](https://www.zagg.com/brands/), Beats гэрийг [Beats бүтээгдэхүүн](https://www.beatsbydre.com/accessories/phone-cases/beats-iphone-17-pro-magsafe-case) гэж ангилсан.
- `[POUT] ... for Apple/Samsung` дагалдах хэрэгсэл POUT хэвээр. Брэнд нь бичигдээгүй `IPHONE ... CASE`, `NAALT`, `FILTER`, ерөнхий controller/SD card/tablet-ийг төхөөрөмжийн брэндээр таамаглаагүй.
- `AIPODS`, `XIAMI`, `YAHAMA` зэрэг алдаатай бичигдсэн нэрийг автоматаар засаж ангилаагүй.

Энэ нь барааны нэр, CSV-д үндэслэсэн ангилал болохоос үйлдвэрлэгчийн жинхэнэ бүтээгдэхүүн эсэхийг баталсан шалгалт биш.

## Хэрэгжүүлэлт ба нотолгоо

`scripts/classify-product-brands.mjs` эхлээд preview гаргана. `--apply` өгсөн үед өмнөх утга, нэр, нийлүүлэгч, шинэчилсэн огноог шалгаж transaction дотор зөвхөн брэндийг өөрчилнө.

Нийлүүлэгч, код, нэр, үнэ болон бусад бүтээгдэхүүний талбарууд, агуулахын хөдөлгөөн/тоо/өртөг өөрчлөгдөөгүйг бүх мөрөөр шалгасан. Өмнө нь DYSON нийлүүлэгчийг хоосолсон өөрчлөлт хэвээр.

Өмнөх бүх барааны snapshot, мөр бүрийн шийдвэр/үндэслэл, ангиллын CSV, шалгах 59 барааны CSV:
`artifacts/name-brand-classification/2026-09-21T08-09-47.019Z/`.

Шалгалт: брэндийн дүрэм, дагалдах хэрэгслийн брэнд, зөрчилтэй CSV, эргэлзээтэй нэр, нийлүүлэгч хадгалагдах тестүүд амжилттай. Давтан preview-д өөрчлөх мөр 0 байх ёстой.
