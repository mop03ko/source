export class SmsError extends Error {
  constructor(message: string, public code: string, public status = 502, public providerStatus?: number) {
    super(message);
    this.name = "SmsError";
  }
}
const API_URL = "https://pn.unitel.mn/api/message/send/sms";
// Server-only secret. The existing environment variable now contains the Unitel enc key.
export async function sendSms(toNumber: string, message: string) {
  const key = process.env.ANTMALL_SMS_API_KEY?.trim();
  if (!key) throw new SmsError("SMS API түлхүүр тохируулаагүй.", "SMS_NOT_CONFIGURED", 503);
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
  } catch (error) {
    // Do not expose the request URL (enc), recipient, message, or provider response.
    // A timeout may occur after acceptance: never automatically retry an SMS.
    throw new SmsError("Unitel SMS үйлчилгээний хариу ирсэнгүй. Дахин илгээхээс өмнө илгээлтийн түүхийг шалгана уу.", "SMS_PROVIDER_UNREACHABLE", error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? 504 : 502);
  }
  if (!response.ok) {
    // Numeric status only: provider bodies can contain the key, recipient or message.
    console.warn("Unitel SMS rejected", { providerStatus: response.status });
    const detail = response.status === 403
      ? "Unitel хандалтыг хориглолоо (HTTP 403). API түлхүүрийн идэвх, SMS илгээх эрх болон Hosts/IP зөвшөөрлийг шалгана уу."
      : response.status === 401
      ? "Unitel API түлхүүрийг зөвшөөрсөнгүй (HTTP 401). Серверийн SMS түлхүүрийг шалгана уу."
      : response.status === 429
      ? "Unitel SMS илгээлтийн хязгаарт хүрлээ (HTTP 429). Илгээлтийн түүхийг шалгаад түр хүлээнэ үү."
      : `Unitel SMS хүсэлтийг хүлээж авсангүй (HTTP ${response.status}).`;
    throw new SmsError(detail, response.status === 403 ? "SMS_PROVIDER_FORBIDDEN" : response.status === 401 ? "SMS_PROVIDER_UNAUTHORIZED" : "SMS_PROVIDER_REJECTED", 502, response.status);
  }
  const text = raw.trim();
  let result: unknown;
  if (text) {
    try { result = JSON.parse(text); } catch { result = text; }
    const acceptedText = (value: string) => /^(ok|success|accepted|sent)$/i.test(value.trim());
    if (typeof result === "string") {
      if (!acceptedText(result)) throw new SmsError("Unitel SMS илгээлтийн хариуг баталгаажуулж чадсангүй. Илгээлтийн түүхийг шалгана уу.", "SMS_RESPONSE_UNCONFIRMED", 502, response.status);
    } else if (result && typeof result === "object" && !Array.isArray(result)) {
      const data = result as Record<string, unknown>;
      const failed = data.success === false || data.ok === false || !!data.error ||
        (Array.isArray(data.errors) && data.errors.length > 0) ||
        (typeof data.status === "string" && /^(error|failed|failure|rejected|unauthorized|forbidden)$/i.test(data.status));
      const code = data.code ?? data.statusCode ?? (typeof data.status === "number" ? data.status : undefined);
      const numericCode = typeof code === "number" ? code : typeof code === "string" && /^-?\d+$/.test(code) ? Number(code) : undefined;
      if (failed || (numericCode !== undefined && numericCode !== 0 && (numericCode < 200 || numericCode >= 300))) {
        throw new SmsError("Unitel SMS үйлчилгээ илгээлтийг зөвшөөрсөнгүй. Илгээлтийн түүхийг шалгана уу.", "SMS_PROVIDER_REJECTED", 502, response.status);
      }
    } else if (result !== true) {
      throw new SmsError("Unitel SMS илгээлтийн хариуг баталгаажуулж чадсангүй. Илгээлтийн түүхийг шалгана уу.", "SMS_RESPONSE_UNCONFIRMED", 502, response.status);
    }
  }
  // HTTP acceptance is not a handset delivery receipt. Never return raw provider data.
  return { success: true };
}
