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
  const d = (await r.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
  } | null;
  if (!r.ok || !d?.success)
    throw new Error(d?.message || "SMS илгээж чадсангүй.");
  return d;
}
