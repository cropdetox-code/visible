# Carry — Family Mental Load App
## Instructions for Claude Code

This is the complete spec for Carry, a family mental load app for two users (Lauren + Marnie Calli, Gold Coast QLD AU). You are building an MVP that they can run on their phones immediately as a PWA.

---

## What this app does

1. **Daily inbox scrape** — connects to Gmail (both partners), scrapes family-relevant emails every morning at 6am AEST
2. **AI classification** — uses Claude API to classify each email: type, dates, action items, assignments
3. **Family calendar** — auto-creates Google Calendar events from emails with dates
4. **Partner task boards** — routes action items to the right partner's board based on ownership rules
5. **Shared lists** — grocery, back-to-school, etc. — both partners can edit
6. **Daily digest** — 7am AEST push notification summarising what was processed overnight and what needs attention

---

## Tech stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Database**: Supabase (Postgres + Auth + Realtime)
- **Auth**: Supabase Auth with Google OAuth
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **Email**: Google Gmail API (Node.js client)
- **Calendar**: Google Calendar API
- **Scheduling**: Vercel Cron Jobs
- **Deployment**: Vercel
- **Styling**: Tailwind CSS (mobile-first)
- **Push notifications**: web-push (PWA)

---

## Environment variables needed

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google OAuth (Gmail + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Anthropic
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://carry.vercel.app
CRON_SECRET=  # random string to secure cron endpoint

# Web push (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@carry.app
```

---

## Database schema (Supabase)

```sql
-- Households (a couple = one household)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Users (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id),
  display_name text not null,
  role text check (role in ('partner_1', 'partner_2')),
  google_access_token text,
  google_refresh_token text,
  google_token_expiry timestamptz,
  push_subscription jsonb,
  digest_time text default '07:00',  -- AEST
  created_at timestamptz default now()
);

-- Ownership map (from the audit — which partner owns which category)
create table ownership_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  category text not null,  -- 'health', 'financial', 'school', etc.
  owner text check (owner in ('partner_1', 'partner_2', 'shared')),
  created_at timestamptz default now(),
  unique(household_id, category)
);

-- Processed emails (deduplication log)
create table processed_emails (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  gmail_message_id text not null,
  processed_at timestamptz default now(),
  classification jsonb,  -- full AI output
  unique(household_id, gmail_message_id)
);

-- Tasks (the kanban cards)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  title text not null,
  description text,
  category text,
  assigned_to text check (assigned_to in ('partner_1', 'partner_2', 'shared')),
  status text check (status in ('todo', 'in_progress', 'done')) default 'todo',
  due_date date,
  source_email_id text,  -- gmail message id that generated this
  is_urgent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id)
);

-- Calendar events
create table family_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  title text not null,
  description text,
  start_datetime timestamptz not null,
  end_datetime timestamptz,
  all_day boolean default false,
  location text,
  category text,
  google_event_id text,  -- synced to Google Calendar
  source_email_id text,
  is_recurring boolean default false,
  recurrence_rule text,  -- RRULE string
  created_at timestamptz default now()
);

-- Shared lists (grocery, back to school, etc.)
create table lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  name text not null,
  emoji text default '📋',
  created_at timestamptz default now()
);

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists(id) on delete cascade not null,
  text text not null,
  checked boolean default false,
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Digest log
create table digests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  sent_at timestamptz default now(),
  emails_processed int default 0,
  tasks_created int default 0,
  events_created int default 0,
  urgent_count int default 0,
  summary jsonb
);

-- RLS policies
alter table households enable row level security;
alter table profiles enable row level security;
alter table ownership_rules enable row level security;
alter table processed_emails enable row level security;
alter table tasks enable row level security;
alter table family_events enable row level security;
alter table lists enable row level security;
alter table list_items enable row level security;
alter table digests enable row level security;

-- All tables: users can only access their own household's data
create policy "household_access" on tasks
  using (household_id in (
    select household_id from profiles where id = auth.uid()
  ));

-- (repeat similar policy for all tables)
```

---

## Core service: Email classifier (`lib/classifier.ts`)

This is the heart of the app. See the implementation in `lib/classifier.ts`.

The classifier must:
1. Detect email type: `calendar_event | invoice | action_required | appointment | renewal | booking_confirmation | fyi`
2. Extract entities: dates, amounts, due dates, contacts, locations
3. Determine if an action is needed (a booking confirmation is NOT an action)
4. Assign to the right partner based on ownership rules
5. Return structured JSON

Confidence thresholds:
- ≥85%: auto-route silently
- 60–84%: create card but flag as "needs confirmation"
- <60%: queue for manual review

---

## Australian-specific context

- Timezone: Australia/Brisbane (AEST, UTC+10, no daylight saving)
- School system: Brisbane Catholic Education, QLD state schools
- Known senders to recognise:
  - `*.bne.catholic.edu.au` — Brisbane Catholic Education (school fees, notices)
  - `*.qld.gov.au` — Queensland Government services
  - `classhub.com.au`, `littlebigsport.com.au` — kids sport
  - `goldcoast.qld.gov.au` — Gold Coast City Council (aquatic centres)
  - `hotdoc.com.au`, `healthengine.com.au` — GP/specialist bookings
  - `mychildcarenow.com.au`, `xplor.com.au`, `himama.com` — childcare
  - `compass.education`, `seesaw.me`, `qparents.qld.edu.au` — school apps
- BPAY references should be extracted from invoices
- CCS (Child Care Subsidy) admin belongs to Marnie (ownership rule)

---

## The two users

```
Lauren (Partner 1):
  email: cropdetox@gmail.com (primary) + loobyandmoo@gmail.com (family)
  role: partner_1
  
Marnie (Partner 2):
  email: loobyandmoo@gmail.com + marnie.calli@gmail.com
  role: partner_2
```

**Ownership rules (from audit):**
```
health → partner_1
financial → partner_1
logistics → partner_1
childcare_ccs → partner_2
school → shared
childcare → shared
activities → shared
household → shared
food → shared
emotional → shared
social → shared
celebrations → shared
routines → shared
```

---

## Build order

**Week 1 — Core infrastructure:**
1. Next.js project setup with Tailwind, Supabase client
2. Google OAuth flow (sign in, store tokens, refresh)
3. Supabase schema + RLS
4. Basic mobile UI shell (bottom nav: Board / Calendar / Lists / Digest)

**Week 2 — The scrape:**
5. Gmail scraping service (`lib/gmail.ts`)
6. Claude classification service (`lib/classifier.ts`)
7. `/api/scrape` endpoint (POST, secured with CRON_SECRET)
8. Vercel cron job (daily 6am AEST = 20:00 UTC)
9. Task creation + Google Calendar event creation

**Week 3 — UI:**
10. Task board (Kanban: partner_1 / shared / partner_2 columns)
11. Task cards with edit/move/complete
12. Family calendar view (week view, mobile-optimised)
13. Shared lists (grocery etc.) with real-time updates via Supabase Realtime

**Week 4 — Digest + polish:**
14. Daily digest push notification (web-push)
15. Digest in-app view
16. Manual email scrape trigger (for testing)
17. PWA manifest + service worker
18. Onboarding flow (invite partner, connect Gmail, set ownership rules)

---

## Key files to build

```
carry/
├── CLAUDE.md                     ← this file
├── .env.local                    ← (gitignored, you fill this in)
├── .env.example                  ← committed, shows what's needed
├── package.json
├── next.config.js
├── tailwind.config.ts
├── supabase/
│   └── schema.sql                ← run this in Supabase SQL editor
├── lib/
│   ├── classifier.ts             ← Claude API classification engine
│   ├── gmail.ts                  ← Gmail scraping + OAuth refresh
│   ├── calendar.ts               ← Google Calendar event creation
│   ├── supabase.ts               ← Supabase client (server + client)
│   ├── ownership.ts              ← ownership rules lookup
│   └── push.ts                   ← web push notifications
├── app/
│   ├── layout.tsx
│   ├── manifest.ts               ← PWA manifest
│   ├── api/
│   │   ├── scrape/route.ts       ← POST /api/scrape (cron endpoint)
│   │   ├── tasks/route.ts        ← CRUD for tasks
│   │   ├── events/route.ts       ← CRUD for calendar events
│   │   └── auth/
│   │       ├── google/route.ts   ← Google OAuth initiation
│   │       └── callback/route.ts ← Google OAuth callback
│   └── (app)/
│       ├── board/page.tsx        ← Kanban task board
│       ├── calendar/page.tsx     ← Family calendar
│       ├── lists/page.tsx        ← Shared lists
│       └── digest/page.tsx       ← Daily digest view
├── components/
│   ├── TaskCard.tsx
│   ├── CalendarView.tsx
│   ├── ListItem.tsx
│   ├── DigestCard.tsx
│   └── BottomNav.tsx
└── vercel.json                   ← cron job config
```

---

## How to run Claude Code on this

1. Install Claude Code: `npm install -g @anthropic/claude-code`
2. `cd` into the `carry/` directory
3. Run: `claude`
4. First prompt: `"Read CLAUDE.md and build the Week 1 tasks. Start with the Next.js setup, Supabase client, and Google OAuth flow. Ask me for any credentials you need."`
5. Claude Code will ask you for the env vars as it needs them
6. After Week 1 is done: `"Now build Week 2 — the Gmail scraping service and classifier"`

---

## Testing the scrape manually

Once the scrape endpoint is built, test it:
```bash
curl -X POST https://your-app.vercel.app/api/scrape \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

This will process the last 24 hours of emails from both connected Gmail accounts and output what it found.

---

## Notes for iteration

Things you'll want to tune after first use:
- The classifier prompt (in `lib/classifier.ts`) — add examples of misclassified emails
- The family sender list — add domains of senders that should always be treated as family-relevant
- Ownership rules — can be updated in-app after testing
- Digest timing — both partners can set their own preferred time

The more real emails you run through it, the better the classifier gets. Keep a log of misclassifications in a Notion doc or similar, and feed them back as few-shot examples in the prompt.
