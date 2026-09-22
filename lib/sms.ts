const API_URL = "https://pn.unitel.mn/api/message/send/sms";
// Server-only secret. The existing environment variable now contains the Unitel enc key.
export async function sendSms(toNumber: string, message: string) {
  const key = process.env.ANTMALL_SMS_API_KEY?.trim();
  if (!key) throw new Error("SMS API түлхүүр тохируулаагүй.");
  const url = new URL(API_URL);
  url.searchParams.set("enc", key);
  let response: Response;
  let raw: string;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: toNumber, message }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
    raw = await response.text();
  } catch {
    // Do not expose the request URL (enc), recipient, message, or provider response.
    // A timeout may occur after acceptance: never automatically retry an SMS.
    throw new Error("Unitel SMS үйлчилгээний хариу ирсэнгүй. Дахин илгээхээс өмнө илгээлтийн түүхийг шалгана уу.");
  }
  if (!response.ok) throw new Error(`Unitel SMS илгээж чадсангүй (HTTP ${response.status}).`);
  const text = raw.trim();
  let result: unknown;
  if (text) {
    try { result = JSON.parse(text); } catch { result = text; }
    const acceptedText = (value: string) => /^(ok|success|accepted|sent)$/i.test(value.trim());
    if (typeof result === "string") {
      if (!acceptedText(result)) throw new Error("Unitel SMS илгээлтийн хариуг баталгаажуулж чадсангүй. Илгээлтийн түүхийг шалгана уу.");
    } else if (result && typeof result === "object" && !Array.isArray(result)) {
      const data = result as Record<string, unknown>;
      const failed = data.success === false || data.ok === false || !!data.error ||
        (Array.isArray(data.errors) && data.errors.length > 0) ||
        (typeof data.status === "string" && /^(error|failed|failure|rejected|unauthorized|forbidden)$/i.test(data.status));
      const code = data.code ?? data.statusCode ?? (typeof data.status === "number" ? data.status : undefined);
      const numericCode = typeof code === "number" ? code : typeof code === "string" && /^-?\d+$/.test(code) ? Number(code) : undefined;
      if (failed || (numericCode !== undefined && numericCode !== 0 && (numericCode < 200 || numericCode >= 300))) {
        throw new Error("Unitel SMS үйлчилгээ илгээлтийг зөвшөөрсөнгүй. Илгээлтийн түүхийг шалгана уу.");
      }
    } else if (result !== true) {
      throw new Error("Unitel SMS илгээлтийн хариуг баталгаажуулж чадсангүй. Илгээлтийн түүхийг шалгана уу.");
    }
  }
  // HTTP acceptance is not a handset delivery receipt. Never return raw provider data.
  return { success: true };
}
