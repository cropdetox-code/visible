import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { searchParams } = new URL(request.url);
  const what = searchParams.get("what") ?? "all"; // "tasks", "events", "lists", or "all"

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, household_id")
    .not("household_id", "is", null)
    .limit(1)
    .single();

  if (!profile?.household_id) {
    return NextResponse.json({ error: "No household found" }, { status: 400 });
  }

  const hid = profile.household_id;
  const uid = profile.id;
  const results: Record<string, unknown> = {};

  // --- TASKS ---
  if (what === "tasks" || what === "all") {
    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          household_id: hid,
          title: "Pay school fees — Term 2 overdue",
          description: "From: accounts@bne.catholic.edu.au\nTerm 2 fees of $1,450 are overdue. BPAY Ref: 283746. Due was 28 Mar.",
          category: "financial",
          assigned_to: "partner_1",
          status: "todo",
          due_date: "2026-03-28",
          is_urgent: true,
          created_by: uid,
        },
        {
          household_id: hid,
          title: "Buy Lola's soccer kit for Saturday",
          description: "Lola needs new shin pads and socks for littlebigsport.com.au Saturday comp. Size small.",
          category: "activities",
          assigned_to: "shared",
          status: "todo",
          due_date: "2026-04-11",
          is_urgent: false,
          created_by: uid,
        },
        {
          household_id: hid,
          title: "Book Ziggy's swimming lesson — new term",
          description: "Gold Coast Aquatic Centre term 2 enrolments open. Ziggy was in Level 3 Wed 3:30pm.",
          category: "activities",
          assigned_to: "shared",
          status: "todo",
          due_date: "2026-04-14",
          is_urgent: false,
          created_by: uid,
        },
        {
          household_id: hid,
          title: "Pay gardener — $120 owing",
          description: "Gardener came Tuesday, left invoice on kitchen bench. Cash or bank transfer.",
          category: "household",
          assigned_to: "shared",
          status: "todo",
          due_date: "2026-04-07",
          is_urgent: false,
          created_by: uid,
        },
      ])
      .select("id, title");
    results.tasks = error ? { error: error.message } : data;
  }

  // --- CALENDAR EVENTS ---
  if (what === "events" || what === "all") {
    const { data, error } = await supabase
      .from("family_events")
      .insert([
        {
          household_id: hid,
          title: "School fees Term 2 due",
          description: "Brisbane Catholic Education — $1,450. BPAY Ref: 283746",
          start_datetime: "2026-03-28T00:00:00+10:00",
          all_day: true,
          category: "financial",
          location: null,
        },
        {
          household_id: hid,
          title: "Lola — Soccer comp",
          description: "littlebigsport.com.au Saturday game. Bring shin pads + socks.",
          start_datetime: "2026-04-11T08:30:00+10:00",
          end_datetime: "2026-04-11T10:00:00+10:00",
          all_day: false,
          category: "activities",
          location: "Robina State High fields",
        },
        {
          household_id: hid,
          title: "Ziggy — Swimming Level 3",
          description: "Gold Coast Aquatic Centre, Wed 3:30pm. Term 2 start.",
          start_datetime: "2026-04-08T15:30:00+10:00",
          end_datetime: "2026-04-08T16:15:00+10:00",
          all_day: false,
          category: "activities",
          location: "Gold Coast Aquatic Centre",
        },
        {
          household_id: hid,
          title: "Gardener visit",
          description: "Fortnightly mow + edges. $120 cash/transfer.",
          start_datetime: "2026-04-07T09:00:00+10:00",
          end_datetime: "2026-04-07T11:00:00+10:00",
          all_day: false,
          category: "household",
          location: "Home",
        },
        {
          household_id: hid,
          title: "Ziggy — Childcare drop-off",
          description: "Xplor childcare. Pack spare clothes + hat.",
          start_datetime: "2026-04-07T07:30:00+10:00",
          end_datetime: "2026-04-07T08:00:00+10:00",
          all_day: false,
          category: "childcare",
          location: null,
        },
        {
          household_id: hid,
          title: "Lola — School assembly",
          description: "Parents invited. Lola getting citizenship award.",
          start_datetime: "2026-04-09T09:00:00+10:00",
          end_datetime: "2026-04-09T10:00:00+10:00",
          all_day: false,
          category: "school",
          location: "School hall",
        },
        {
          household_id: hid,
          title: "Dr Chen — Lola check-up",
          description: "Annual health check. Bring Medicare card.",
          start_datetime: "2026-04-10T10:00:00+10:00",
          end_datetime: "2026-04-10T10:30:00+10:00",
          all_day: false,
          category: "health",
          location: "Miami Medical Centre",
        },
      ])
      .select("id, title, start_datetime");
    results.events = error ? { error: error.message } : data;
  }

  // --- LISTS ---
  if (what === "lists" || what === "all") {
    // Grocery list
    const { data: grocery } = await supabase
      .from("lists")
      .insert({ household_id: hid, name: "Grocery", emoji: "\uD83D\uDED2" })
      .select("id")
      .single();

    if (grocery) {
      await supabase.from("list_items").insert([
        { list_id: grocery.id, text: "Milk (2L full cream)", added_by: uid },
        { list_id: grocery.id, text: "Bananas", added_by: uid },
        { list_id: grocery.id, text: "Chicken thighs x2", added_by: uid },
        { list_id: grocery.id, text: "Sourdough bread", added_by: uid },
        { list_id: grocery.id, text: "Yoghurt pouches (kids)", added_by: uid },
        { list_id: grocery.id, text: "Dishwasher tablets", added_by: uid },
      ]);
    }

    // Back to school list
    const { data: school } = await supabase
      .from("lists")
      .insert({ household_id: hid, name: "Back to School", emoji: "\uD83C\uDFD2" })
      .select("id")
      .single();

    if (school) {
      await supabase.from("list_items").insert([
        { list_id: school.id, text: "New lunchbox for Lola", added_by: uid },
        { list_id: school.id, text: "Label all uniforms", added_by: uid, checked: true },
        { list_id: school.id, text: "Book covers x4", added_by: uid },
        { list_id: school.id, text: "Hat (wide brim, navy)", added_by: uid },
      ]);
    }

    // Weekend to-do
    const { data: weekend } = await supabase
      .from("lists")
      .insert({ household_id: hid, name: "Weekend", emoji: "\u2600\uFE0F" })
      .select("id")
      .single();

    if (weekend) {
      await supabase.from("list_items").insert([
        { list_id: weekend.id, text: "Meal prep lunches", added_by: uid },
        { list_id: weekend.id, text: "Clean out car", added_by: uid },
        { list_id: weekend.id, text: "Water plants", added_by: uid },
      ]);
    }

    results.lists = { grocery: grocery?.id, school: school?.id, weekend: weekend?.id };
  }

  return NextResponse.json({ success: true, ...results });
}
