import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { fetchRecentEmails } from "@/lib/gmail";
import { classifyEmail, getConfidenceRouting } from "@/lib/classifier";
import { createCalendarEvent } from "@/lib/calendar";

export const maxDuration = 300; // 5 min max for Vercel

export async function POST(request: Request) {
  // Authenticate: accept CRON_SECRET via header or query param
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");

  if (
    (token ?? queryToken) !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all profiles with Google tokens (= connected users)
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, household_id, role, display_name, google_access_token")
    .not("google_access_token", "is", null);

  if (profilesErr || !profiles?.length) {
    return NextResponse.json({
      error: "No connected profiles found",
      detail: profilesErr?.message,
    }, { status: 400 });
  }

  const results = {
    emails_fetched: 0,
    emails_classified: 0,
    tasks_created: 0,
    events_created: 0,
    skipped_not_relevant: 0,
    skipped_duplicate: 0,
    errors: [] as string[],
  };

  for (const profile of profiles) {
    if (!profile.google_access_token) continue;

    const householdId = profile.household_id;
    if (!householdId) {
      results.errors.push(
        `User ${profile.display_name} has no household — skipping`
      );
      continue;
    }

    // 1. Fetch recent emails
    let emails;
    try {
      emails = await fetchRecentEmails(profile.id);
      results.emails_fetched += emails.length;
    } catch (err) {
      results.errors.push(
        `Gmail fetch failed for ${profile.display_name}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    // 2. Process each email
    for (const email of emails) {
      // Deduplication check
      const { data: existing } = await supabase
        .from("processed_emails")
        .select("id")
        .eq("household_id", householdId)
        .eq("gmail_message_id", email.id)
        .single();

      if (existing) {
        results.skipped_duplicate++;
        continue;
      }

      // 3. Classify with Claude
      let classification;
      try {
        classification = await classifyEmail(email);
        results.emails_classified++;
      } catch (err) {
        results.errors.push(
          `Classification failed for "${email.subject}": ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      // 4. Log as processed
      await supabase.from("processed_emails").insert({
        household_id: householdId,
        gmail_message_id: email.id,
        classification: classification as unknown as Record<string, unknown>,
      });

      // Skip non-family-relevant emails
      if (!classification.is_family_relevant) {
        results.skipped_not_relevant++;
        continue;
      }

      const routing = getConfidenceRouting(classification.confidence);

      // 5. Create task if action is needed
      if (classification.action_needed) {
        const { error: taskErr } = await supabase.from("tasks").insert({
          household_id: householdId,
          title: classification.action_description ?? classification.summary,
          description: `From: ${email.from}\nSubject: ${email.subject}\n\n${classification.summary}`,
          category: classification.category,
          assigned_to: classification.assigned_to,
          status: routing === "review" ? "todo" : "todo",
          due_date: classification.dates[0]?.date ?? null,
          source_email_id: email.id,
          is_urgent: classification.is_urgent,
          created_by: profile.id,
        });

        if (taskErr) {
          results.errors.push(
            `Task insert failed for "${email.subject}": ${taskErr.message}`
          );
        } else {
          results.tasks_created++;
        }
      }

      // 6. Create calendar events for any extracted dates
      if (classification.dates.length > 0) {
        for (const date of classification.dates) {
          try {
            await createCalendarEvent({
              userId: profile.id,
              householdId,
              title: `${classification.summary}`,
              description: `Source: ${email.subject}\n${classification.action_description ?? ""}`,
              date,
              category: classification.category,
              location: classification.location,
              sourceEmailId: email.id,
            });
            results.events_created++;
          } catch (err) {
            results.errors.push(
              `Calendar event failed for "${email.subject}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }

    // 7. Log digest summary
    await supabase.from("digests").insert({
      household_id: householdId,
      emails_processed: results.emails_classified,
      tasks_created: results.tasks_created,
      events_created: results.events_created,
      urgent_count: 0, // Could count urgent tasks
      summary: results as unknown as Record<string, unknown>,
    });
  }

  return NextResponse.json({
    success: true,
    ...results,
  });
}
