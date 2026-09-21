export const productCategories=[
 'Гар утас','Чихэвч','Таблет','Зөөврийн компьютер','Суурин компьютер','Ухаалаг цаг',
 'Дрон','Камер','Микрофон','Гар утасны тогтворжуулагч','Чанга яригч','Тоглоомын төхөөрөмж',
 'Дэлгэц','Принтер','Компьютерийн эд анги','Сүлжээний төхөөрөмж','Хяналтын камер',
 'Гэр, хамгаалалт','Цэнэглэгч, кабель','Дагалдах хэрэгсэл','Ширээ, тавилга',
 'Тоос сорогч, цэвэрлэгээ','Агаар цэвэршүүлэгч','Чийгшүүлэгч, чийг хатаагч','Гал тогооны цахилгаан хэрэгсэл',
 'Үс арчилгааны төхөөрөмж','Массажны төхөөрөмж','Цахилгаан унаа','Сэнс',
] as const;

export function categoryFromName(name:string):string|null{
 const n=name.normalize('NFKC').toUpperCase().replace(/\s+/g,' ').trim();
 // Device compatibility words in accessories must never turn them into phones/tablets.
 if(/NAALT|НААЛТ|CASELOOP|HANDS 8|SILICON CASE|CASE-CN|PROMAXCASE|BEATS CASE|(?:IPHONE|IP \d|S25).*(?:CASE|COVER)|^CASE IP/.test(n))return 'Гэр, хамгаалалт';
 if(/TRANSCEIVER|TEKDE[CK] MAT|CHARGING HANDLE|SELFIE STICK|\bFILTER\b|BATTERY|TABLETOP WITH|ANTI.THE|ГАР$|BANDLOOP|STRAP|BRACKET|SHELF|CABLE MANAGEMENT|FOOT.?REST|FOOT REST|^EYES\s*\d|^\[POUT\] EYES|^PENCIL |APPLE PENCIL|MAGIC (?:MOUSE|KEYBOARD)|IPAD.*KEYBOARD|\bSD (?:CARD|CART)\b|MOP 4EA|^CVC |\bAIRTAG\b/.test(n))return 'Дагалдах хэрэгсэл';
 if(/ADAPTER|ELECTROBOOST|MAGPOWER|MOPHIE|\bCABLE\b|^\[POUT\] HANDS|^HANDS\s*\d/.test(n))return 'Цэнэглэгч, кабель';
 if(/AIRPODS|AIPODS|EARPODS|\bBUDS\s*\d|WF-1000XM|\bEARS\s*2\b/.test(n))return 'Чихэвч';
 if(/IWATCH|APPLE WATCH|GALAXY WATCH|TECNO WATCH/.test(n))return 'Ухаалаг цаг';
 if(/MACBOOK|LAPTOP|VIVOBOOK|LATTITUDE|LATITUDE|INSPIRON|PREDATOR|TUF GAMING|DELL GAMING|DELL PRO 16/.test(n))return 'Зөөврийн компьютер';
 if(/IPAD|GALAXY TAB|^TABLET$/.test(n))return 'Таблет';
 if(/IPHONE|GALAXY|^S25 ULTRA|SAMSUNG (?:FOLD|S26)|TECNO (?:SPARK|CAMON|POVA)/.test(n))return 'Гар утас';
 if(/OSMO MOBILE/.test(n))return 'Гар утасны тогтворжуулагч';
 if(/\bDJI MIC\b/.test(n))return 'Микрофон';
 if(/OSMO|DJI (?:ACTION|NANO)|WAYFARER.*CAMERA/.test(n))return 'Камер';
 if(/\b(?:MAVIC|AVATA|FLIP|NEO|LITO)\b|\bMINI [45] PRO|DJI AIR/.test(n))return 'Дрон';
 if(/HIKVISION/.test(n))return 'Хяналтын камер';
 if(/PS5|CONTROLLER/.test(n))return 'Тоглоомын төхөөрөмж';
 if(/PRINTER|EPSON|HP 108W/.test(n))return 'Принтер';
 if(/MAC MINI|OPTIPLEX|TOWER|PANO M110L/.test(n))return 'Суурин компьютер';
 if(/MONITOR/.test(n)&&!/(?:STAND|HUB|STATION)/.test(n))return 'Дэлгэц';
 if(/G.?SKILL|TRIDENT|SAMSUNG 9100/.test(n))return 'Компьютерийн эд анги';
 if(/RJ45|CAT6/.test(n))return 'Сүлжээний төхөөрөмж';
 if(/HOMEPOD|JBL|BLUETOOTH SPEAKER/.test(n))return 'Чанга яригч';
 if(/TABLETOP|TEKDE[CK]|GAME STATION/.test(n))return 'Ширээ, тавилга';
 if(/MASSAGE|MASSAGER|RECOVERY/.test(n))return 'Массажны төхөөрөмж';
 if(/AIRWRAP|AIRSTRAIT|CO.?ANDA|CO ANDA|HAIR STRAIGH/.test(n))return 'Үс арчилгааны төхөөрөмж';
 if(/HUMIDIFIER|DEHUMIDIFIER|NOSE\s*2/.test(n))return 'Чийгшүүлэгч, чийг хатаагч';
 if(/WATER PURIFIER|KETTLE|AIR FRYER|CUCKOO AF|CUCKOO R[CS] [SML]|CR-0675|COFFEE|DISH.?WASH|MICROWAVE|TOASTER/.test(n))return 'Гал тогооны цахилгаан хэрэгсэл';
 if(/PURIFIER|DYSON (?:BP04|PH05|PH04|HUSHJET)/.test(n))return 'Агаар цэвэршүүлэгч';
 if(/VACUUM|VAC|CLEANER|STEAM|DYSON (?:GEN\s*5|V\d+|WASH)|^V15S$|CUCKOO STICK GUN|MAMIBOT|SHOES DRYER/.test(n))return 'Тоос сорогч, цэвэрлэгээ';
 if(/СЭНС|\bFAN\b/.test(n))return 'Сэнс';
 if(/^AIMA\b/.test(n))return 'Цахилгаан унаа';
 return null;
}
