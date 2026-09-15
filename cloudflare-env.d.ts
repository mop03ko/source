declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CRM_CONNECTION_ENCRYPTION_KEY?: string;
    CRM_GOOGLE_SERVICE_ACCOUNT_JSON?: string;
    BUCKET?: R2Bucket;
  }
}
