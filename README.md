# AntMall CRM — Vercel хувилбар

Энэ хувилбар стандарт Next.js build ашиглаж `.next/routes-manifest.json` үүсгэнэ. Vercel дээр апп ажиллана, Turso дээр өгөгдөл хадгалагдана, Google аккаунтаар нэвтэрнэ. Өмнөх Cloudflare/Sites серверийг шаардахгүй.

**Суулгахын өмнө:** Turso өгөгдлийн сан, Google OAuth client, Vercel environment variables-аа тохируулна. Эдгээр account/secret нь ZIP-д байхгүй. Энэ багцыг production domain-д хараахан deploy хийгээгүй.

## 1. ZIP болон Vercel тохиргоо

ZIP-ийг задлаад `antmall-crm-vercel` хавтасны агуулгыг GitHub repository-д байрлуулна. `package.json` нь repository-ийн root-д байвал Vercel-ийн Root Directory-г хоосон үлдээнэ. Хэрэв бүх хавтсыг repository-д оруулсан бол Root Directory = `antmall-crm-vercel` гэж сонгоно.

Vercel → Add New Project → тухайн repository-г Import:

| Тохиргоо | Утга |
|---|---|
| Framework Preset | Next.js |
| Node.js Version | 24.x |
| Install Command | npm ci |
| Build Command | npm run build |
| Output Directory | Override унтраалттай, Next.js default |

`dist`, `out`, `.next/server` гэж Output Directory тохируулахгүй. Өмнөх төсөл дээр Override тавьсан бол арилгана. `vercel.json` build/install командыг агуулна. `node_modules` болон `.next` хавтас upload хийх шаардлагагүй; Vercel source-оос build хийнэ.

## 2. Turso өгөгдлийн сан бэлтгэх

Өөрийн Turso аккаунт дээр хоосон cloud database үүсгэж, URL (`libsql://...turso.io`) болон database token авна. Бодит харилцагчийн мэдээллийг локал SQLite файлд эсвэл Vercel-ийн түр filesystem-д хадгалахгүй.

Компьютерт Node.js 24 суулгаад төслийн хавтас дотор `.env.example` файлыг `.env.local` нэрээр хуулж, дор хаяж `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` утгаа бөглөнө. Дараах командыг ажиллуул:

```bash
npm ci
npm run db:migrate
```

Migration нь дөрвөн SQL файлыг дарааллаар хэрэгжүүлж, checksum/history хадгалдаг. Дахин ажиллуулахад өмнө хэрэгжсэн migration-ийг алгасана. Нэг migration алдаа гарвал тэр migration-ийн өөрчлөлтүүд rollback хийнэ. Өмнөх CRM хүснэгтүүдтэй боловч migration history-гүй санд зориуд зогсоно; хүчээр дахин ажиллуулахгүй.

`npm run build` нь DB migration ажиллуулахгүй. Production болон тусдаа Preview DB ашиглавал тус бүрт migration хэрэгжүүлнэ. Preview төслөө production харилцагчийн сантай автоматаар холбохгүй.

## 3. Google аккаунтаар нэвтрэх тохиргоо

Google Cloud Console → Google Auth Platform / OAuth consent screen тохируулж → OAuth Client ID → **Web application** үүсгэнэ.

Authorized redirect URI:

```text
https://YOUR-PROJECT.vercel.app/api/auth/callback/google
```

Өөрийн домэйн ашиглах үед тухайн домэйныг мөн нэмнэ:

```text
https://crm.example.mn/api/auth/callback/google
```

Google OAuth client ID/secret-ийг Vercel-д `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` нэрээр оруулна. Consent screen Testing горимтой бол хэрэглэх ажилтнуудыг Google-ийн Test users жагсаалтад нэмнэ, эсвэл байгууллагын тохирох publishing/internal access тохиргоог ашиглана.

Google нэвтрэлтийн OAuth client болон Google Sheets унших service account JSON нь **хоёр өөр зориулалттай түлхүүр**. Service account JSON-ийг `AUTH_GOOGLE_SECRET` дотор оруулж болохгүй.

## 4. Vercel Environment Variables

Vercel → Project → Settings → Environment Variables:

| Нэр | Утга / зориулалт |
|---|---|
| AUTH_URL | Нэвтрэх үндсэн хаяг: `https://YOUR-PROJECT.vercel.app` эсвэл өөрийн CRM домэйн |
| AUTH_SECRET | Санамсаргүй, нууц session encryption утга |
| AUTH_GOOGLE_ID | Google OAuth Web client ID |
| AUTH_GOOGLE_SECRET | Google OAuth Web client secret |
| CRM_OWNER_EMAIL | Анхны админы **Google аккаунтын и-мэйл** |
| TURSO_DATABASE_URL | Turso cloud database URL |
| TURSO_AUTH_TOKEN | Turso database token |
| CRM_CONNECTION_ENCRYPTION_KEY | Google Sheets түлхүүрийг шифрлэх 32-byte base64 утга |
| CRM_GOOGLE_SERVICE_ACCOUNT_JSON | Сонголтоор: Sheets унших service account-ийн бүрэн JSON |

`AUTH_SECRET` болон `CRM_CONNECTION_ENCRYPTION_KEY` тус бүрт энэ командыг **тусад нь** ажиллуулж ялгаатай утга үүсгэнэ:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Утгуудыг Vercel environment variables-д оруулна. GitHub, frontend код, зураг, нийтийн чатад нийтлэхгүй. `NEXT_PUBLIC_` угтвар нэмэхгүй. Тохиргоо өөрчилсний дараа Redeploy хийнэ. Vercel орчинд Auth.js trusted-host тохиргоогоо танина; localhost хөгжүүлэлтэд шаардлагатай бол `AUTH_TRUST_HOST=true`-г зөвхөн локал `.env.local`-д нэмнэ.

Домэйн өөрчилбөл AUTH_URL болон Google callback URI хоёрыг тааруулж, дахин нэвтэрнэ. Анхны build хийхийн өмнө дээрх тохиргоог хийхийг зөвлөе; тохиргоо дутуу бол login дэлгэц мэдээлэл харуулна.

## 5. Анхны нэвтрэлт ба ажилтны эрх

1. `CRM_OWNER_EMAIL` дээр заасан Google аккаунтаар нэвтэрнэ. Google баталгаажуулсан и-мэйл ашиглана.
2. Тэр эзэмшигч CRM-ийг анх нээхэд админы бүртгэл үүснэ. Дурын анхны зочин админ болохгүй.
3. Багийн гишүүн хэсэгт ажилтны Google и-мэйл, нэр, үүрэг, идэвхтэй төлөвийг бүртгэнэ.
4. Ажилтан яг тэр Google аккаунтаар нэвтэрнэ. Agent өөрт хуваарилсан хүсэлтийг; manager бүх хүсэлтийг; admin гишүүн болон Sheets тохиргоог удирдана.
5. Идэвхгүй болгосон ажилтан өмнөх session-тэй байсан ч дараагийн API хүсэлт дээр мэдээлэл авах эрхгүй болно.

CRM_OWNER_EMAIL-ийг дараа нь солих нь DB-ийн эзэмшигчийг автоматаар шилжүүлэхгүй. Эзэмшигч шилжүүлэх эсвэл өмнөх Sites-ийн user_id-уудыг Google identity-д шилжүүлэх нь тусдаа өгөгдлийн migration шаарддаг.

## 6. Google Sheets холбох

Өмнөх Sheets импортын боломж хадгалагдсан. Google Sheets API-г идэвхжүүлж, шаардлагатай хүснэгтийг service account-ийн и-мэйлд Viewer эрхээр share хийнэ. CRM-ийн Google Sheets тохиргоонд өөрийн spreadsheet ID, tab, баганын mapping-ийг шалгаж, JSON түлхүүр оруулах эсвэл environment variable-аар нийлүүлнэ. Дараа нь Test connection, ажилтны нэр холбох, импорт идэвхжүүлэх алхмуудыг хийнэ.

- Хүсэлтийн огноо, утас, регистр, бүтээгдэхүүн, ажилтны хуваарилалт импортлогдоно.
- Огноо + утас нь эх хүсэлтийн identity; нэг эх хүсэлт давхар импортлогдохгүй.
- Түүхэн огноог хамруулах горим, регистрийн backfill, гараар зассан регистрийг хамгаалах ажиллагаа хадгалагдсан.
- Ажилтантай холбогдоогүй нэрийн тоог `Ажилтантай холбоогүй: N` гэж харуулна.
- CRM нээлттэй үед 30 секунд тутам polling хийнэ; нэг sync 80 хүртэл өөрчлөлт боловсруулна. Анхны их хэмжээний импорт олон sync шаардана.
- Бүх CRM цонх хаалттай үед ажиллах scheduler, хаалттай browser руу push, автомат SMS/email энэ хувилбарт байхгүй.
- Sheets API route-ийн Vercel maxDuration = 300 секунд. Ашиглаж буй Vercel тохиргоо/plan энэ хугацааг зөвшөөрөх эсэхийг deploy үед шалгана.

## 7. Өмнөх өгөгдөл

ZIP нь **кодын багц**; бодит харилцагчийн мэдээлэл, өмнөх DB backup, Google хувийн түлхүүр агуулаагүй. Шинэ Turso DB хоосон эхэлнэ. Sheets-ээс дахин импортлоход өмнөх CRM дээр хийсэн тэмдэглэл, Recycle түүх, уншсан мэдэгдэл автоматаар шилжихгүй.

Бүх түүхийг шилжүүлэх шаардлагатай бол өмнөх орчноос бүрэн өгөгдлийн export авч, staging Turso сан руу баталгаажуулсан migration хийнэ. Үүнд organization owner, member user_id (Sites identity → Google identity), encrypted sheet credential, source links зэргийг тусгайлан тааруулна. Хуучин DB dump-ийг шинэ сан дээр шууд давхар ажиллуулахгүй.

## 8. Алдаа гарвал

| Алдаа | Шалгах зүйл |
|---|---|
| routes-manifest.json олдохгүй | Энэ шинэ багц мөн эсэх; зөв Root Directory; Framework = Next.js; Output override унтраалттай; npm run build дууссан эсэх |
| redirect_uri_mismatch | Google OAuth callback URL ба AUTH_URL яг тохирсон эсэх |
| Нэвтрэх боломжгүй / AccessDenied | CRM_OWNER_EMAIL эсвэл идэвхтэй ажилтны и-мэйл; Google test-user эрх |
| no such table | Зөв Turso DB дээр npm run db:migrate ажилласан эсэх |
| Database холбоогүй | TURSO URL/token, environment scope болон Redeploy |
| Sheets decrypt алдаа | CRM_CONNECTION_ENCRYPTION_KEY өмнөх шифрлэсэн мэдээллийн түлхүүртэй ижил эсэх; үгүй бол холболтыг дахин тохируулах |

## 9. Шалгалт

Энэ багц дээр дараах шалгалтууд амжилттай дууссан:

```bash
npm test
npm run build
npm run test:production
```

- CRM/Sheets regression: эрх, хүсэлт, регистр, огноо, давхардалгүй импорт, ажилтан солилт, мэдэгдэл, Recycle хязгаар.
- Бодит libSQL драйвертай локал тест: migration дахин ажиллуулах, transaction rollback, параметрүүд, RETURNING.
- Production HTTP: нэвтрэх redirect, зөвшөөрөлгүй API, хуурамч identity header болон session татгалзах, зөв гарын үсэгтэй туршилтын session, админы bootstrap, гаднын origin-оос бичих хүсэлт татгалзах.
- Next.js production build болон routes-manifest.json үүсэлт.

Google-ийн бодит OAuth consent/callback, амьд Turso cloud холболт, хэрэглэгчийн Google Sheets болон Vercel account/domain дээр deploy хийхийг туршаагүй. Production HTTP тест зөвхөн тусгаарласан түр DB, туршилтын session ашигласан. Browser-ийн харагдац болон OS notification popup-ийг энэ хөрвүүлэлтийн үед дахин шалгаагүй.

## Эх сурвалж

- Vercel Next.js: https://vercel.com/docs/frameworks/full-stack/nextjs
- Auth.js тохиргоо: https://authjs.dev/getting-started/installation
- Google provider: https://authjs.dev/getting-started/providers/google
- Turso TypeScript SDK / atomic batch: https://docs.turso.tech/sdk/ts/reference

Auth.js 5.0.0-beta.32 хувилбарыг албан зааврын дагуу тогтоосон; beta dependency гэдгийг хөгжүүлэгч анхаарч шинэчлэхдээ нэвтрэлтийн тестүүдийг дахин ажиллуулна. Бүх dependency-ийн яг суулгасан хувилбар package-lock.json-д хадгалагдсан.
