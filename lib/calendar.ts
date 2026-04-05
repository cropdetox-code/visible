import { google } from "googleapis";
import { createServiceClient } from "./supabase";
import type { ExtractedDate } from "./classifier";

/** Build an authenticated Google Calendar client for a user. */
async function getCalendarClient(userId: string) {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("google_access_token, google_refresh_token, google_token_expiry")
    .eq("id", userId)
    .single();

  if (!profile?.google_access_token) {
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

  return google.calendar({ version: "v3", auth: oauth2 });
}

/** Create a Google Calendar event and store it in family_events. */
export async function createCalendarEvent(opts: {
  userId: string;
  householdId: string;
  title: string;
  description?: string;
  date: ExtractedDate;
  category?: string;
  location?: string | null;
  sourceEmailId?: string;
}) {
  const supabase = createServiceClient();

  // Build start/end for Google Calendar
  let start: { date?: string; dateTime?: string; timeZone?: string };
  let end: { date?: string; dateTime?: string; timeZone?: string };

  if (opts.date.is_all_day) {
    start = { date: opts.date.date };
    // All-day end must be the next day for Google Calendar
    const endDate = opts.date.end_date ?? opts.date.date;
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    end = { date: nextDay.toISOString().split("T")[0] };
  } else {
    start = {
      dateTime: `${opts.date.date}T09:00:00`,
      timeZone: "Australia/Brisbane",
    };
    end = {
      dateTime: `${opts.date.end_date ?? opts.date.date}T10:00:00`,
      timeZone: "Australia/Brisbane",
    };
  }

  let googleEventId: string | null = null;

  try {
    const calendar = await getCalendarClient(opts.userId);

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: opts.title,
        description: opts.description,
        location: opts.location ?? undefined,
        start,
        end,
      },
    });

    googleEventId = event.data.id ?? null;
  } catch (err) {
    // Calendar sync is best-effort — don't fail the whole pipeline
    console.error("Failed to create Google Calendar event:", err);
  }

  // Always store in our family_events table
  const { data, error } = await supabase
    .from("family_events")
    .insert({
      household_id: opts.householdId,
      title: opts.title,
      description: opts.description ?? null,
      start_datetime: opts.date.is_all_day
        ? `${opts.date.date}T00:00:00+10:00`
        : `${opts.date.date}T09:00:00+10:00`,
      end_datetime: opts.date.end_date
        ? `${opts.date.end_date}T10:00:00+10:00`
        : null,
      all_day: opts.date.is_all_day,
      location: opts.location ?? null,
      category: opts.category ?? null,
      google_event_id: googleEventId,
      source_email_id: opts.sourceEmailId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to insert family_event:", error);
  }

  return data;
}
