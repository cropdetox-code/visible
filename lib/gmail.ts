import { google } from "googleapis";
import { createServiceClient } from "./supabase";

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  snippet: string;
}

/** Build an OAuth2 client with a user's stored tokens, refreshing if expired. */
export async function getGmailClient(userId: string) {
  const supabase = createServiceClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "google_access_token, google_refresh_token, google_token_expiry"
    )
    .eq("id", userId)
    .single();

  if (error || !profile?.google_access_token) {
    throw new Error(`No Google tokens for user ${userId}`);
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2.setCredentials({
    access_token: profile.google_access_token,
    refresh_token: profile.google_refresh_token ?? undefined,
  });

  // Refresh if token is expired or will expire within 5 minutes
  const expiry = profile.google_token_expiry
    ? new Date(profile.google_token_expiry).getTime()
    : 0;
  const fiveMinutes = 5 * 60 * 1000;

  if (Date.now() > expiry - fiveMinutes) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);

      // Persist refreshed tokens
      await supabase
        .from("profiles")
        .update({
          google_access_token: credentials.access_token,
          google_refresh_token:
            credentials.refresh_token ?? profile.google_refresh_token,
          google_token_expiry: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : null,
        })
        .eq("id", userId);
    } catch (refreshErr) {
      console.error(`Token refresh failed for user ${userId}:`, refreshErr);
      throw new Error(
        `Google token refresh failed for user ${userId}. They may need to re-authenticate.`
      );
    }
  }

  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Fetch emails from the last N hours (default 24). */
export async function fetchRecentEmails(
  userId: string,
  hoursBack = 24
): Promise<GmailMessage[]> {
  const gmail = await getGmailClient(userId);
  const afterTimestamp = Math.floor(
    (Date.now() - hoursBack * 60 * 60 * 1000) / 1000
  );

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `after:${afterTimestamp}`,
    maxResults: 50,
  });

  const messageIds = listRes.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const messages: GmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value ?? "";

      const body = extractBody(detail.data.payload);

      messages.push({
        id: msg.id,
        threadId: detail.data.threadId ?? "",
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        body: body.slice(0, 3000), // Cap body length for classifier
        date: getHeader("Date"),
        snippet: detail.data.snippet ?? "",
      });
    } catch (err) {
      console.error(`Failed to fetch message ${msg.id}:`, err);
    }
  }

  return messages;
}

/** Extract plaintext body from Gmail payload (handles multipart). */
function extractBody(
  payload: any // eslint-disable-line @typescript-eslint/no-explicit-any
): string {
  if (!payload) return "";

  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — prefer text/plain, fall back to text/html stripped
  if (payload.parts) {
    // Look for text/plain first
    const plainPart = payload.parts.find(
      (p: any) => p.mimeType === "text/plain" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    // Fall back to text/html, strip tags
    const htmlPart = payload.parts.find(
      (p: any) => p.mimeType === "text/html" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    if (htmlPart?.body?.data) {
      return stripHtml(decodeBase64Url(htmlPart.body.data));
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
