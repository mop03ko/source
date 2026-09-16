import { assignmentNotice, newLeadNotice } from "@/lib/notifications";
import { env } from "@/lib/runtime";
import { member, Failure } from "@/lib/access";
import { z } from "zod";
import {
  normalizePhone,
  normalizeRegistration,
  stages,
  closed,
  type Member,
  type Lead,
} from "@/lib/crm";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/sms";
export const dynamic = "force-dynamic";
const db = () => env.DB!;
const scope = (m: Member) =>
  m.role === "agent"
    ? { sql: " AND l.owner=?", args: [m.email] }
    : { sql: "", args: [] as string[] };
// Recycle хөтөлбөрийн гарын авлагын 4 бүлэг (Уулзалт товлосон/Материал/Шийдвэр хүлээж буй/Холбогдоогүй);
// GET (candidates таб) болон POST (bulk_recycle) хоёулаа ашигладаг тул модулийн түвшинд байна.
const candidateStatuses = [
  "appointment",
  "materials",
  "pending",
  "unreachable",
];
async function getLead(id: string, m: Member) {
  const s = scope(m);
  const l = await db()
    .prepare(
      `SELECT l.*,(SELECT COUNT(*) FROM suppressions WHERE phone=l.phone) blocked,(SELECT COUNT(*) FROM activities WHERE phone=l.phone AND kind='no_answer' AND created_at>=?) attempts FROM leads l WHERE l.id=? ${s.sql}`,
    )
    .bind(new Date(Date.now() - 14 * 86400000).toISOString(), id, ...s.args)
    .first<Lead>();
  if (!l) throw new Failure("Хүсэлт олдсонгүй эсвэл хандах эрхгүй.", 404);
  return l;
}
const bodySchema = z.object({
  action: z.enum([
    "create",
    "update",
    "activity",
    "recycle",
    "optout",
    "member",
    "import",
    "bulk_recycle",
  ]),
  id: z.string().max(80).optional(),
  version: z.number().int().positive().optional(),
  data: z.unknown(),
});
const leadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().transform((v, ctx) => {
    try {
      return normalizePhone(v);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "8 оронтой утасны дугаар оруулна уу.",
      });
      return z.NEVER;
    }
  }),
  registration: z
    .string()
    .max(40)
    .transform((v, ctx) => {
      try {
        return normalizeRegistration(v);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Регистрийн дугаар 2 кирилл үсэг, 8 цифртэй байна.",
        });
        return z.NEVER;
      }
    })
    .optional(),
  product: z.string().trim().min(1).max(160),
  source: z.string().min(1).max(60),
  owner: z.union([z.string().email(), z.literal("__sheet_unassigned__")]),
  status: z.string().refine((v) => Object.hasOwn(stages, v)),
  next_at: z.string().datetime().nullable(),
  next_action: z.string().trim().max(200),
});
function err(e: unknown) {
  if (e instanceof Failure)
    return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return Response.json(
      {
        error:
          "Мэдээллээ шалгана уу: " +
          e.issues.map((i) => i.path.join(".") + " " + i.message).join("; "),
      },
      { status: 400 },
    );
  console.error("CRM request failed", e instanceof Error ? e.message : "error");
  return Response.json(
    { error: "Хадгалж чадсангүй. Дахин оролдоно уу." },
    { status: 500 },
  );
}
async function validOwner(email: string, m: Member) {
  if (m.role === "agent" && email !== m.email)
    throw new Failure("Зөвхөн өөртөө хүсэлт хуваарилна.", 403);
  if (
    !(await db()
      .prepare("SELECT email FROM members WHERE email=? AND active=1")
      .bind(email)
      .first())
  )
    throw new Failure("Идэвхтэй хариуцагч сонгоно уу.");
}
export async function GET(req: Request) {
  try {
    const m = await member(),
      url = new URL(req.url),
      s = scope(m);
    const id = url.searchParams.get("id");
    if (id) {
      const lead = await getLead(id, m);
      const activities = await db()
        .prepare(
          "SELECT * FROM activities WHERE lead_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(id)
        .all();
      return Response.json(
        { lead, activities: activities.results },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const page = Math.max(
      1,
      Math.min(10000, Number(url.searchParams.get("page")) || 1),
    );
    const q = (url.searchParams.get("q") || "").slice(0, 100),
      status = url.searchParams.get("status") || "",
      view = url.searchParams.get("view") || "all";
    // Ижил утасны дугаартай хэд хэдэн lead-тэй бүлгүүдийг (голчлон хуучин Sheet синкийн улмаас) харуулна;
    // энд юуг ч өөрчлөхгүй, зөвхөн удирдлага/админд харагдуулж гараар нэгтгэх шийдвэр гаргахад нь тусална.
    if (view === "duplicates") {
      if (m.role === "agent")
        throw new Failure("Зөвхөн удирдлага, админ харна.", 403);
      const dpage = Math.max(
        1,
        Math.min(1000, Number(url.searchParams.get("page")) || 1),
      );
      const groupCount = await db()
        .prepare(
          "SELECT COUNT(*) n FROM (SELECT phone FROM leads GROUP BY phone HAVING COUNT(*)>1)",
        )
        .first<{ n: number }>();
      const phones = await db()
        .prepare(
          "SELECT phone,COUNT(*) n FROM leads GROUP BY phone HAVING COUNT(*)>1 ORDER BY n DESC,phone LIMIT 20 OFFSET ?",
        )
        .bind((dpage - 1) * 20)
        .all<{ phone: string; n: number }>();
      const phoneList = phones.results.map((p) => p.phone);
      const leadRows = phoneList.length
        ? await db()
            .prepare(
              `SELECT id,name,phone,owner,status,created_at,source FROM leads WHERE phone IN (${phoneList.map(() => "?").join(",")}) ORDER BY phone,created_at`,
            )
            .bind(...phoneList)
            .all<{
              id: string;
              name: string;
              phone: string;
              owner: string;
              status: string;
              created_at: string;
              source: string;
            }>()
        : {
            results: [] as {
              id: string;
              name: string;
              phone: string;
              owner: string;
              status: string;
              created_at: string;
              source: string;
            }[],
          };
      const groups = phones.results.map((p) => ({
        phone: p.phone,
        count: p.n,
        leads: leadRows.results.filter((l) => l.phone === p.phone),
      }));
      return Response.json(
        { groups, total: groupCount?.n || 0, page: dpage },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const owner = (url.searchParams.get("owner") || "")
        .trim()
        .toLowerCase()
        .slice(0, 120),
      dateFrom = (url.searchParams.get("from") || "").slice(0, 10),
      dateTo = (url.searchParams.get("to") || "").slice(0, 10);
    let where = "1=1" + s.sql,
      args: unknown[] = [...s.args];
    if (q) {
      where += " AND (l.name LIKE ? OR l.phone LIKE ? OR l.product LIKE ?)";
      args.push(...Array(3).fill("%" + q + "%"));
    }
    if (status && Object.hasOwn(stages, status)) {
      where += " AND l.status=?";
      args.push(status);
    }
    if (owner) {
      where += " AND l.owner=?";
      args.push(owner);
    }
    // Дараагийн тов биш, харилцагчийн ирсэн огноогоор шүүнэ (Улаанбаатар цагийн бүсээр).
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      const t = new Date(dateFrom + "T00:00:00+08:00");
      if (!Number.isNaN(t.getTime())) {
        where += " AND l.created_at>=?";
        args.push(t.toISOString());
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      const t = new Date(dateTo + "T23:59:59+08:00");
      if (!Number.isNaN(t.getTime())) {
        where += " AND l.created_at<=?";
        args.push(t.toISOString());
      }
    }
    // Улаанбаатарын өнөөдрийн хуанлийн өдрийн эхлэл/төгсгөл (сервер ямар цагийн бүст ажиллаж байсан ч адилхан гарна).
    const ubDateStr = new Date(Date.now() + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    const todayStartUB = new Date(ubDateStr + "T00:00:00+08:00").toISOString(),
      todayEndUB = new Date(ubDateStr + "T23:59:59+08:00").toISOString();
    // Зөвхөн хугацаа хэтэрснийг бус, өнөөдрийн үлдсэн товыг бүгдийг харуулж, клиент талд хугацаагаар (хэтэрсэн/1 цагийн дотор/үлдсэн цаг) бүлэглэнэ.
    if (view === "today") {
      where +=
        " AND l.status NOT IN ('won','lost','invalid') AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone) AND (l.recycle_at IS NULL OR l.connected=1 OR julianday(l.recycle_at)>=julianday('now','-14 days')) AND l.owner!='__sheet_unassigned__' AND l.next_at<=?";
      args.push(todayEndUB);
    }
    const isToday = view === "today";
    if (view === "recycle") {
      where +=
        " AND l.recycle_at IS NOT NULL AND l.next_at IS NOT NULL AND (l.connected=1 OR julianday(l.recycle_at)>=julianday('now','-14 days')) AND l.status NOT IN ('won','lost','invalid') AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone)";
    }
    // "Recycle эхлүүлэх"-ээр аль хэдийн мөчлөгт орсныг (recycle_at) давхар санал болгохгүй.
    const candidateCond = ` AND l.status IN (${candidateStatuses.map(() => "?").join(",")}) AND l.recycle_at IS NULL AND l.owner!='__sheet_unassigned__' AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone)`;
    if (view === "candidates") {
      where += candidateCond;
      args.push(...candidateStatuses);
    }
    const isCandidates = view === "candidates";
    // "Бүх хүсэлт" таб шинэ хүсэлтийг эхэнд харуулна; ажлын дараалалтай (today/recycle) табууд тов-оор эрэмбэлнэ.
    const order =
      view === "all"
        ? "l.created_at DESC"
        : "l.next_at IS NULL,l.next_at ASC,l.created_at DESC";
    // Тайлангийн хугацааны хүрээ нь жагсаалтын шүүлтээс тусдаа: ирсэн огноогоор (УБ цагийн бүсээр) хязгаарлана.
    const rFrom = (url.searchParams.get("rfrom") || "").slice(0, 10),
      rTo = (url.searchParams.get("rto") || "").slice(0, 10);
    let reportFromIso = "",
      reportToIso = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(rFrom)) {
      const t = new Date(rFrom + "T00:00:00+08:00");
      if (!Number.isNaN(t.getTime())) reportFromIso = t.toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(rTo)) {
      const t = new Date(rTo + "T23:59:59+08:00");
      if (!Number.isNaN(t.getTime())) reportToIso = t.toISOString();
    }
    let reportWhere = "1=1" + s.sql,
      reportArgs: unknown[] = [...s.args];
    if (reportFromIso) {
      reportWhere += " AND l.created_at>=?";
      reportArgs.push(reportFromIso);
    }
    if (reportToIso) {
      reportWhere += " AND l.created_at<=?";
      reportArgs.push(reportToIso);
    }
    // Дуудлага/тэмдэглэлийн тоог хариуцагчаар биш үйлдэл хийсэн ажилтнаар (actor) тоолно.
    const actorScope =
      m.role === "agent"
        ? { sql: " AND a.actor=?", args: [m.email] as unknown[] }
        : { sql: "", args: [] as unknown[] };
    let activityWhere = "1=1" + actorScope.sql,
      activityArgs: unknown[] = [...actorScope.args];
    if (reportFromIso) {
      activityWhere += " AND a.created_at>=?";
      activityArgs.push(reportFromIso);
    }
    if (reportToIso) {
      activityWhere += " AND a.created_at<=?";
      activityArgs.push(reportToIso);
    }
    // Тайлангийн 3 query (dist/byMember/byActivity) хямд биш тул зөвхөн "Тайлан" таб дээр л ажиллуулна;
    // бусад табанд (today/all/recycle) энэ өгөгдлийг клиент ашигладаггүй тул хоосон буцаана.
    const isReports = view === "reports";
    const empty = Promise.resolve({ results: [] as Record<string, unknown>[] });
    const [
      rows,
      count,
      stats,
      team,
      dist,
      byMember,
      byActivity,
      settings,
      candidateGroups,
      unreadMsg,
      unreadTeamMsg,
      myToday,
      directory,
    ] = await Promise.all([
      db()
        .prepare(
          `SELECT l.*,(SELECT COUNT(*) FROM suppressions WHERE phone=l.phone) blocked FROM leads l WHERE ${where} ORDER BY ${order} LIMIT 50 OFFSET ?`,
        )
        .bind(...args, (page - 1) * 50)
        .all(),
      db()
        .prepare(`SELECT COUNT(*) count FROM leads l WHERE ${where}`)
        .bind(...args)
        .first(),
      db()
        .prepare(
          `SELECT COUNT(*) total,COALESCE(SUM(status='won'),0) won,COALESCE(SUM(status NOT IN ('won','lost','invalid') AND (recycle_at IS NULL OR connected=1 OR julianday(recycle_at)>=julianday('now','-14 days')) AND owner!='__sheet_unassigned__' AND next_at<=? AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone)),0) due,COALESCE(SUM(recycle_at IS NOT NULL AND next_at IS NOT NULL AND (connected=1 OR julianday(recycle_at)>=julianday('now','-14 days')) AND status NOT IN ('won','lost','invalid') AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone)),0) recycled,COALESCE(SUM(recycle_at IS NOT NULL AND next_at IS NOT NULL AND next_at<=? AND (connected=1 OR julianday(recycle_at)>=julianday('now','-14 days')) AND status NOT IN ('won','lost','invalid') AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=l.phone)),0) recycle_overdue,COALESCE(SUM(status='review'),0) review,COALESCE(SUM(created_at>=? AND created_at<=?),0) today_new,COALESCE(SUM(status='won' AND updated_at>=? AND updated_at<=?),0) today_won FROM leads l WHERE 1=1 ${s.sql}`,
        )
        .bind(
          new Date().toISOString(),
          new Date().toISOString(),
          todayStartUB,
          todayEndUB,
          todayStartUB,
          todayEndUB,
          ...s.args,
        )
        .first(),
      db()
        .prepare(
          m.role === "agent"
            ? "SELECT email,name,role,active FROM members WHERE email=?"
            : "SELECT email,name,role,active FROM members ORDER BY active DESC,name",
        )
        .bind(...(m.role === "agent" ? [m.email] : []))
        .all(),
      isReports
        ? db()
            .prepare(
              `SELECT status,COUNT(*) count FROM leads l WHERE ${reportWhere} GROUP BY status`,
            )
            .bind(...reportArgs)
            .all()
        : empty,
      // '__sheet_unassigned__'-г цаашид тусад нь "Хуваарилаагүй" мөр болгож харуулах тул энд хассангүй;
      // эс бөгөөс тэдгээр (ялангуяа аль хэдийн "Худалдан авсан" статустай) хүсэлтүүд тайланд алга болно.
      isReports
        ? db()
            .prepare(
              `SELECT owner,COUNT(*) total,${Object.keys(stages)
                .map((k) => `COALESCE(SUM(status='${k}'),0) c_${k}`)
                .join(",")} FROM leads l WHERE ${reportWhere} GROUP BY owner`,
            )
            .bind(...reportArgs)
            .all()
        : empty,
      isReports
        ? db()
            .prepare(
              `SELECT a.actor,COUNT(*) count FROM activities a WHERE ${activityWhere} AND a.actor!='Google Sheets' GROUP BY a.actor`,
            )
            .bind(...activityArgs)
            .all()
        : empty,
      getSettings(),
      // 4 бүлгийн тоог одоогийн эрхийн хамрах хүрээгээр гаргана; статус/хайлт/хариуцагч шүүлтээс үл хамааран
      // тухайн таб дээрх ерөнхий эх суурийг харуулна (гарын авлагын "Эх тоо" баганатай адил).
      isCandidates
        ? db()
            .prepare(
              `SELECT status,COUNT(*) count FROM leads l WHERE 1=1${s.sql}${candidateCond} GROUP BY status`,
            )
            .bind(...s.args, ...candidateStatuses)
            .all()
        : empty,
      db()
        .prepare(
          "SELECT COUNT(*) total FROM messages WHERE recipient=? AND read_at IS NULL",
        )
        .bind(m.email)
        .first<{ total: number }>(),
      db()
        .prepare(
          `SELECT COUNT(*) total FROM team_messages WHERE sender!=? AND created_at>COALESCE((SELECT last_read_at FROM team_reads WHERE email=?),'')`,
        )
        .bind(m.email, m.email)
        .first<{ total: number }>(),
      // Чатын хамтрагчийн жагсаалт: role-оор хязгаарлагдаагүй, идэвхтэй бүх ажилтан (owner-ийн scoped members-ээс тусад нь).
      // last_seen нь онлайн төлөв харуулахад ашиглагдана (lib/access.ts-ийн member() бүр request тутамд шинэчилнэ).
      // Зөвхөн "Өнөөдрийн ажил" таб дээр л ажиллуулна: тухайн ажилтны (эсвэл удирдлагын хувьд бүх багийн) өнөөдөр
      // хийсэн үйлдлийн товч тойм (миний гүйцэтгэл), activity_actor индексээр хямд.
      isToday
        ? db()
            .prepare(
              `SELECT COUNT(*) total,COALESCE(SUM(kind='connected'),0) connected,COALESCE(SUM(kind='no_answer'),0) no_answer,COALESCE(SUM(kind='message'),0) message FROM activities WHERE actor=? AND created_at>=? AND created_at<=?`,
            )
            .bind(m.email, todayStartUB, todayEndUB)
            .first<{
              total: number;
              connected: number;
              no_answer: number;
              message: number;
            }>()
        : Promise.resolve(null),
      db()
        .prepare(
          "SELECT email,name,role,active,last_seen FROM members WHERE active=1 ORDER BY name",
        )
        .all(),
    ]);
    // Идэвхтэй гишүүн бүрийг тусад нь харуулна; тухайн хугацаанд хуваарилагдсан хүсэлтгүй байсан ч мөр нь гарч ирнэ.
    const byMemberMap = new Map(
      byMember.results.map((r: Record<string, unknown>) => [
        r.owner as string,
        r,
      ]),
    );
    const activityMap = new Map(
      byActivity.results.map((r: Record<string, unknown>) => [
        r.actor as string,
        r.count as number,
      ]),
    );
    // Тайлан зөвхөн борлуулалтын ажилтныг харьцуулна; удирдлага/админ хувийн үзүүлэлтгүй.
    const reportMembers = isReports
      ? (team.results as Member[])
          .filter(
            (t) => t.role === "agent" && (t.active || byMemberMap.has(t.email)),
          )
          .map((t) => {
            const b = byMemberMap.get(t.email) as
              | Record<string, number>
              | undefined;
            return {
              email: t.email,
              name: t.name,
              total: b?.total || 0,
              counts: Object.fromEntries(
                Object.keys(stages).map((k) => [k, b?.[`c_${k}`] || 0]),
              ),
              activities: activityMap.get(t.email) || 0,
            };
          })
      : [];
    // Sheet-ийн ажилтны нэр CRM-тэй таарч чадаагүй тул хариуцагчгүй үлдсэн (жишээ нь худалдан авсан ч холбогдох
    // ажилтангүй) хүсэлтийг тусад нь мөр болгож, тайлангийн нийт тоо ажилтнуудын нийлбэртэй зөрөхгүй байлгана.
    const unassignedReport = isReports
      ? (byMemberMap.get("__sheet_unassigned__") as
          | Record<string, number>
          | undefined)
      : undefined;
    if (isReports && unassignedReport?.total)
      reportMembers.push({
        email: "__sheet_unassigned__",
        name: "Хуваарилаагүй",
        total: unassignedReport.total || 0,
        counts: Object.fromEntries(
          Object.keys(stages).map((k) => [k, unassignedReport[`c_${k}`] || 0]),
        ),
        activities: 0,
      });
    return Response.json(
      {
        me: m,
        leads: rows.results,
        count: (count as { count: number }).count,
        stats,
        members: team.results,
        distribution: dist.results,
        byMember: reportMembers,
        settings,
        candidateGroups: candidateGroups.results,
        unreadMessages: unreadMsg?.total || 0,
        unreadTeam: unreadTeamMsg?.total || 0,
        directory: directory.results,
        myToday: myToday
          ? {
              total: myToday.total || 0,
              connected: myToday.connected || 0,
              no_answer: myToday.no_answer || 0,
              message: myToday.message || 0,
            }
          : null,
        page,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return err(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Failure("Хүсэлтийн эх сурвалж буруу.", 403);
    if (Number(req.headers.get("content-length") || 0) > 200000)
      throw new Failure("Файл хэт том.", 413);
    const m = await member(),
      raw = await req.text();
    if (raw.length > 200000) throw new Failure("Мэдээлэл хэт их.", 413);
    const b = bodySchema.parse(JSON.parse(raw)),
      now = new Date().toISOString();
    if (b.action === "member") {
      if (m.role !== "admin")
        throw new Failure("Зөвхөн админ гишүүний эрх өөрчилнө.", 403);
      const d = z
        .object({
          email: z
            .string()
            .email()
            .transform((v) => v.toLowerCase()),
          name: z.string().trim().min(1).max(100),
          role: z.enum(["admin", "manager", "agent"]),
          active: z.boolean(),
        })
        .parse(b.data);
      const owner = await db()
        .prepare("SELECT owner FROM organization WHERE id=1")
        .first<{ owner: string }>();
      const target = await db()
        .prepare("SELECT user_id FROM members WHERE email=?")
        .bind(d.email)
        .first<{ user_id: string }>();
      if (target?.user_id === owner?.owner && (!d.active || d.role !== "admin"))
        throw new Failure("Үндсэн эзэмшигчийн эрхийг бууруулах боломжгүй.");
      await db()
        .prepare(
          "INSERT INTO members(email,name,role,active) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active",
        )
        .bind(d.email, d.name, d.role, d.active ? 1 : 0)
        .run();
      return Response.json({ ok: true });
    }
    if (b.action === "create" || b.action === "import") {
      const incoming =
        b.action === "import"
          ? z.array(leadSchema).min(1).max(100).parse(b.data)
          : [leadSchema.parse(b.data)];
      const seen = new Set<string>();
      const valid: typeof incoming = [];
      let skipped = 0;
      for (const d of incoming) {
        await validOwner(d.owner, m);
        if (
          !closed.includes(d.status) &&
          d.status !== "review" &&
          (!d.next_at || !d.next_action)
        )
          throw new Failure(
            "Идэвхтэй хүсэлтэд дараагийн тов, үйлдэл заавал оруулна.",
          );
        if (
          await db()
            .prepare("SELECT 1 FROM suppressions WHERE phone=?")
            .bind(d.phone)
            .first()
        ) {
          if (b.action === "create")
            throw new Failure("Дахин холбогдохгүй дугаар байна: " + d.phone);
          skipped++;
          continue;
        }
        if (
          seen.has(d.phone) ||
          (await db()
            .prepare("SELECT 1 FROM leads WHERE phone=?")
            .bind(d.phone)
            .first())
        ) {
          if (b.action === "create")
            throw new Failure(
              "Энэ дугаараар хүсэлт бүртгэгдсэн. Одоо байгаа хүсэлтийг хайж нээнэ үү.",
              409,
            );
          skipped++;
          continue;
        }
        seen.add(d.phone);
        valid.push(d);
      }
      const statements = [];
      let firstId = "";
      for (const d of valid) {
        const id = crypto.randomUUID();
        firstId = id;
        statements.push(
          db()
            .prepare(
              "INSERT INTO leads(id,name,phone,product,source,owner,status,next_at,next_action,created_at,updated_at,op,registration,registration_manual) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM leads WHERE phone=?)",
            )
            .bind(
              id,
              d.name,
              d.phone,
              d.product,
              d.source,
              d.owner,
              d.status,
              closed.includes(d.status) || d.status === "review"
                ? null
                : d.next_at,
              d.next_action,
              now,
              now,
              id,
              d.registration || "",
              d.registration ? 1 : 0,
              d.phone,
            ),
        );
        statements.push(
          db()
            .prepare(
              "INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) SELECT ?,id,phone,'update','Хүсэлт бүртгэв',?,? FROM leads WHERE id=?",
            )
            .bind(crypto.randomUUID(), m.email, now, id),
        );
        statements.push(assignmentNotice(id, id, now));
        statements.push(newLeadNotice(id, id, now));
      }
      const results = statements.length ? await db().batch(statements) : [];
      const added = results
        .filter((_, i) => i % 4 === 0)
        .reduce((n, r) => n + r.meta.changes, 0);
      return Response.json({
        ok: true,
        id: firstId,
        added,
        skipped: incoming.length - added,
      });
    }
    if (b.action === "bulk_recycle") {
      if (m.role === "agent")
        throw new Failure(
          "Зөвхөн удирдлага, админ багцаар Recycle эхлүүлнэ.",
          403,
        );
      const s = scope(m);
      const d = z
        .object({
          status: z
            .string()
            .refine((v) => candidateStatuses.includes(v))
            .optional(),
          from: z.string().max(10).optional(),
          to: z.string().max(10).optional(),
        })
        .parse(b.data);
      const statuses = d.status ? [d.status] : candidateStatuses;
      let bwhere = "1=1" + s.sql,
        bargs: unknown[] = [...s.args];
      bwhere += ` AND status IN (${statuses.map(() => "?").join(",")}) AND recycle_at IS NULL AND owner!='__sheet_unassigned__' AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=leads.phone)`;
      bargs.push(...statuses);
      if (d.from && /^\d{4}-\d{2}-\d{2}$/.test(d.from)) {
        const t = new Date(d.from + "T00:00:00+08:00");
        if (!Number.isNaN(t.getTime())) {
          bwhere += " AND created_at>=?";
          bargs.push(t.toISOString());
        }
      }
      if (d.to && /^\d{4}-\d{2}-\d{2}$/.test(d.to)) {
        const t = new Date(d.to + "T23:59:59+08:00");
        if (!Number.isNaN(t.getTime())) {
          bwhere += " AND created_at<=?";
          bargs.push(t.toISOString());
        }
      }
      // Ганц хүсэлтийн Recycle-тэй ижил дүрэм: 14 хоногт 3 хариу аваагүй дуудлагатай бол багцад оруулахгүй.
      bwhere +=
        " AND (SELECT COUNT(*) FROM activities WHERE phone=leads.phone AND kind='no_answer' AND created_at>=?)<3";
      bargs.push(new Date(Date.now() - 14 * 86400000).toISOString());
      const rows = await db()
        .prepare(
          `SELECT id,phone,status,version FROM leads WHERE ${bwhere} LIMIT 1000`,
        )
        .bind(...bargs)
        .all<{ id: string; phone: string; status: string; version: number }>();
      let updated = 0;
      for (let i = 0; i < rows.results.length; i += 100) {
        const chunk = rows.results.slice(i, i + 100);
        const statements = [];
        for (const l of chunk) {
          const op = crypto.randomUUID();
          const note =
            "14 хоногийн Recycle мөчлөг эхлүүлэв. Эх бүлэг: " +
            (stages[l.status] || l.status);
          statements.push(
            db()
              .prepare(
                "UPDATE leads SET recycle_at=?,next_at=?,next_action=?,updated_at=?,version=version+1,op=? WHERE id=? AND version=? AND recycle_at IS NULL",
              )
              .bind(
                now,
                now,
                "Recycle • Эхний дуудлага",
                now,
                op,
                l.id,
                l.version,
              ),
          );
          statements.push(
            db()
              .prepare(
                "INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) SELECT ?,id,phone,'recycle',?,?,? FROM leads WHERE id=? AND op=?",
              )
              .bind(crypto.randomUUID(), note, m.email, now, l.id, op),
          );
        }
        const chunkResults = await db().batch(statements);
        updated += chunkResults
          .filter((_, idx) => idx % 2 === 0)
          .reduce((n, r) => n + r.meta.changes, 0);
      }
      return Response.json({ ok: true, matched: rows.results.length, updated });
    }
    if (!b.id || !b.version) throw new Failure("Хүсэлтийн хувилбар дутуу.");
    const l = await getLead(b.id, m);
    if (l.version !== b.version)
      throw new Failure(
        "Өөр ажилтан шинэчилсэн байна. Хүсэлтийг дахин нээнэ үү.",
        409,
      );
    let d = { ...l };
    let kind: string = b.action,
      note = "";
    if (b.action === "update") {
      const v = leadSchema.parse(b.data);
      if (v.phone !== l.phone)
        throw new Failure(
          "Дугаарыг өөрчлөх боломжгүй. Буруу дугаар төлөвийг сонгоно уу.",
        );
      if (
        v.owner !== l.owner &&
        m.role !== "admin" &&
        (await db()
          .prepare("SELECT 1 FROM sheet_links WHERE lead_id=?")
          .bind(l.id)
          .first())
      )
        throw new Failure(
          "Энэ хүсэлтийн ажилтныг Google Sheet дээр солино уу.",
        );
      if (v.owner !== "__sheet_unassigned__") await validOwner(v.owner, m);
      else if (
        !(await db()
          .prepare("SELECT 1 FROM sheet_links WHERE lead_id=?")
          .bind(l.id)
          .first())
      )
        throw new Failure("Хариуцагч сонгоно уу.");
      d = {
        ...d,
        ...v,
        registration: v.registration ?? l.registration ?? "",
        registration_manual:
          v.registration !== undefined &&
          v.registration !== (l.registration || "")
            ? 1
            : l.registration_manual || 0,
      };
      note = "Мэдээлэл шинэчилсэн: " + stages[d.status];
    }
    if (b.action === "recycle") {
      if (l.blocked || closed.includes(l.status) || l.recycle_at)
        throw new Failure("Энэ хүсэлтийг Recycle-д оруулах боломжгүй.");
      if ((l.attempts || 0) >= 3)
        throw new Failure(
          "14 хоногийн 3 хариу аваагүй дуудлагын хязгаарт хүрсэн.",
        );
      d.recycle_at = now;
      d.next_at = now;
      d.next_action = "Recycle • Эхний дуудлага";
      // Эх бүлгийг (recycle эхлэх мөчийн статус) түүхэнд хадгална; статус хожим өөрчлөгдсөн ч энэ тэмдэглэл хэвээр үлдэнэ.
      note =
        "14 хоногийн Recycle мөчлөг эхлүүлэв. Эх бүлэг: " +
        (stages[l.status] || l.status);
    }
    if (b.action === "activity") {
      const a = z
        .object({
          kind: z.enum(["connected", "no_answer", "message", "note"]),
          note: z.string().trim().min(1).max(2000),
          next_at: z.string().datetime().nullable(),
          next_action: z.string().trim().max(200),
        })
        .parse(b.data);
      kind = a.kind;
      note = a.note;
      if (kind !== "note" && (l.blocked || closed.includes(l.status)))
        throw new Failure("Хаагдсан хүсэлтэд холбоо барих үйлдэл бүртгэхгүй.");
      if (["no_answer", "message"].includes(kind) && (l.attempts || 0) >= 3)
        throw new Failure("14 хоногт 3 хариу аваагүй дуудлага бүртгэгдсэн.");
      if (
        ["no_answer", "message"].includes(kind) &&
        l.recycle_at &&
        !l.connected &&
        Date.now() > new Date(l.recycle_at).getTime() + 14 * 86400000
      )
        throw new Failure("Recycle-ийн 14 хоногийн мөчлөг дууссан.");
      if (kind === "connected") {
        d.connected = 1;
        d.status = "contacted";
      }
      if (kind === "no_answer") {
        d.status = "unreachable";
      }
      if (a.next_at && !a.next_action)
        throw new Failure("Товлосон ажлын тайлбар оруулна уу.");
      if (kind === "no_answer" && (l.attempts || 0) >= 2) {
        d.next_at = null;
        d.next_action = "Давтан холбоо барилтыг зогсоов";
      } else if (a.next_at) {
        if (new Date(a.next_at).getTime() <= Date.now())
          throw new Failure("Ирээдүйн тов сонгоно уу.");
        d.next_at = a.next_at;
        d.next_action = a.next_action;
      } else if (kind === "no_answer") {
        const n = (l.attempts || 0) + 1;
        d.next_at =
          n >= 3
            ? null
            : new Date(Date.now() + (n === 1 ? 2 : 3) * 86400000).toISOString();
        d.next_action =
          n >= 3 ? "Давтан холбоо барилтыг зогсоов" : "Давтан дуудлага";
      } else if (kind === "connected") {
        throw new Failure(
          "Холбогдсон бол тохиролцсон дараагийн товыг оруулна уу.",
        );
      }
    }
    if (b.action === "optout") {
      kind = "optout";
      note = z
        .object({ note: z.string().trim().min(1).max(1000) })
        .parse(b.data).note;
      d.next_at = null;
      d.next_action = "Дахин холбогдохгүй";
    }
    if (l.blocked) {
      d.next_at = null;
      d.next_action = "Дахин холбогдохгүй";
    }
    if (closed.includes(d.status)) {
      d.next_at = null;
      d.next_action = "Хаагдсан";
    }
    if (d.status === "review") {
      d.next_at = null;
      d.next_action = "Мэдээлэл шалгах";
    }
    if (
      b.action === "update" &&
      !closed.includes(d.status) &&
      d.status !== "review" &&
      d.owner !== "__sheet_unassigned__" &&
      !l.blocked &&
      (!d.next_at || !d.next_action)
    )
      throw new Failure("Дараагийн тов, үйлдэл заавал оруулна.");
    if (
      d.recycle_at &&
      d.next_at &&
      new Date(d.next_at).getTime() >
        new Date(d.recycle_at).getTime() + 14 * 86400000 &&
      kind === "no_answer"
    ) {
      d.next_at = null;
      d.next_action = "Recycle мөчлөг дууссан";
    }
    const op = crypto.randomUUID();
    const checks =
      kind === "no_answer"
        ? " AND (SELECT COUNT(*) FROM activities WHERE phone=leads.phone AND kind='no_answer' AND created_at>=?)<3 AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=leads.phone)"
        : ["connected", "message"].includes(kind)
          ? " AND NOT EXISTS(SELECT 1 FROM suppressions WHERE phone=leads.phone)"
          : "";
    const batch = [
      db()
        .prepare(
          `UPDATE leads SET registration=?,registration_manual=?,name=?,product=?,source=?,owner=?,status=?,next_at=?,next_action=?,recycle_at=?,connected=?,updated_at=?,version=version+1,op=? WHERE id=? AND version=? ${checks}`,
        )
        .bind(
          d.registration || "",
          d.registration_manual || 0,
          d.name,
          d.product,
          d.source,
          d.owner,
          d.status,
          d.next_at,
          d.next_action,
          d.recycle_at,
          d.connected,
          now,
          op,
          l.id,
          b.version,
          ...(kind === "no_answer"
            ? [new Date(Date.now() - 14 * 86400000).toISOString()]
            : []),
        ),
      db()
        .prepare(
          "INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) SELECT ?,id,phone,?,?,?,? FROM leads WHERE id=? AND op=?",
        )
        .bind(op, kind, note, m.email, now, l.id, op),
    ];
    if (b.action === "optout")
      batch.push(
        db()
          .prepare(
            "INSERT OR IGNORE INTO suppressions(phone,reason,actor,created_at) SELECT phone,?,?,? FROM leads WHERE id=? AND op=?",
          )
          .bind(note, m.email, now, l.id, op),
      );
    if (d.owner !== l.owner)
      batch.push(assignmentNotice(l.id, op, now, l.owner));
    const r = await db().batch(batch);
    if (!r[0].meta.changes)
      throw new Failure(
        "Хүсэлт шинэчлэгдсэн эсвэл холбоо барих хязгаар үйлчилж байна. Дахин нээнэ үү.",
        409,
      );
    // Худалдан авалт баталгаажих мөчид (won болох) харилцагч руу баталгаажуулах SMS илгээнэ; админ
    // Тохиргоо-с энэ функцийг унтраасан бол алгасана. SMS амжилтгүй болсон ч хүсэлтийн шинэчлэлт аль хэдийн
    // батлагдсан тул алдаа шидэхгүй, зөвхөн түүхэнд тэмдэглэнэ.
    if (d.status === "won" && l.status !== "won" && (await getSettings()).sms_enabled === "on") {
      try {
        await sendSms(l.phone, "Таны хүсэлт амжилттай баталгаажлаа.");
        await db()
          .prepare(
            "INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            l.id,
            l.phone,
            "note",
            "Худалдан авалт баталгаажсан тул харилцагч руу баталгаажуулах SMS илгээв.",
            "AntMall SMS",
            now,
          )
          .run();
      } catch (e) {
        await db()
          .prepare(
            "INSERT INTO activities(id,lead_id,phone,kind,note,actor,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            l.id,
            l.phone,
            "note",
            "SMS илгээхэд алдаа гарлаа: " + (e as Error).message.slice(0, 200),
            "AntMall SMS",
            now,
          )
          .run();
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return err(e);
  }
}
