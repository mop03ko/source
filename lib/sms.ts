const API_URL = "https://new.antmall.mn/api/4.0/send_sms";
// Түлхүүрийг эх кодод хатуу бичихгүй; ANTMALL_SMS_API_KEY орчны хувьсагчаар өгнө (Vercel дээр тохируулна).
export async function sendSms(toNumber: string, message: string) {
  const key = process.env.ANTMALL_SMS_API_KEY;
  if (!key) throw new Error("SMS API түлхүүр тохируулаагүй.");
  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "storefront-api-access-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to_number: toNumber,
      template: "custom_message",
      variables: { message },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await r.text();
  let d: { success?: boolean; message?: string } | null = null;
  try {
    d = JSON.parse(raw);
  } catch {
    // Нийлүүлэгч JSON бус хариу өгсөн; доорх лог-оор шалтгааныг олно.
  }
  if (!r.ok || !d?.success) {
    // Vercel-ийн function log-д бодит хариуг бүтнээр нь үлдээж, шалтгааныг олоход туслана
    // (жишээ нь буруу дугаарын формат, template тохироогүй г.м нийлүүлэгчийн талын алдаа байж болно).
    console.error("SMS send failed", r.status, raw.slice(0, 500));
    throw new Error(
      d?.message ? `${d.message} (${r.status})` : `SMS илгээж чадсангүй (${r.status}).`,
    );
  }
  return d;
}
