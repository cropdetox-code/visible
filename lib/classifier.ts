import Anthropic from "@anthropic-ai/sdk";
import type { GmailMessage } from "./gmail";

const anthropic = new Anthropic();

export type EmailType =
  | "calendar_event"
  | "invoice"
  | "action_required"
  | "appointment"
  | "renewal"
  | "booking_confirmation"
  | "fyi";

export interface ClassificationResult {
  email_type: EmailType;
  is_family_relevant: boolean;
  confidence: number; // 0–100
  summary: string;
  action_needed: boolean;
  action_description: string | null;
  category: string; // health, financial, school, childcare, etc.
  assigned_to: "partner_1" | "partner_2" | "shared";
  dates: ExtractedDate[];
  amounts: ExtractedAmount[];
  contacts: string[];
  location: string | null;
  bpay_reference: string | null;
  is_urgent: boolean;
}

export interface ExtractedDate {
  date: string; // ISO date string
  description: string; // "due date", "appointment", "event start", etc.
  is_all_day: boolean;
  end_date: string | null;
}

export interface ExtractedAmount {
  amount: number;
  currency: string;
  description: string; // "invoice total", "fee", etc.
}

const SYSTEM_PROMPT = `You are a family email classifier for an Australian family (Gold Coast, QLD). Your job is to analyse emails and extract structured data.

Context:
- This family has two partners: partner_1 (Lauren) and partner_2 (Marnie)
- Timezone: Australia/Brisbane (AEST, UTC+10)
- They have children in Brisbane Catholic Education schools and childcare

Ownership rules — who handles what:
- health → partner_1
- financial → partner_1
- logistics → partner_1
- childcare_ccs → partner_2
- school → shared
- childcare → shared
- activities → shared
- household → shared
- food → shared
- emotional → shared
- social → shared
- celebrations → shared
- routines → shared

Known Australian senders to recognise:
- *.bne.catholic.edu.au — Brisbane Catholic Education (school fees, notices)
- *.qld.gov.au — Queensland Government services
- classhub.com.au, littlebigsport.com.au — kids sport/activities
- goldcoast.qld.gov.au — Gold Coast City Council
- hotdoc.com.au, healthengine.com.au — GP/specialist bookings
- mychildcarenow.com.au, xplor.com.au, himama.com — childcare
- compass.education, seesaw.me, qparents.qld.edu.au — school apps

Important rules:
1. A booking CONFIRMATION is NOT an action — it's just FYI (unless it says "please confirm" or requires a response)
2. Invoices and bills ARE actions (need to be paid)
3. School newsletters are FYI unless they contain a specific deadline or action
4. Extract BPAY references from any invoices
5. Mark something urgent if it has a deadline within 3 days or uses urgent language
6. If the email is clearly not family-relevant (spam, marketing, personal subscriptions), set is_family_relevant to false

Return ONLY valid JSON matching the schema. No markdown, no explanation.`;

function buildUserPrompt(email: GmailMessage): string {
  return `Classify this email:

From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Date: ${email.date}

Body:
${email.body}

Return JSON with these fields:
{
  "email_type": "calendar_event" | "invoice" | "action_required" | "appointment" | "renewal" | "booking_confirmation" | "fyi",
  "is_family_relevant": boolean,
  "confidence": number (0-100),
  "summary": "one-line summary of what this email is about",
  "action_needed": boolean,
  "action_description": "what needs to be done" | null,
  "category": "health" | "financial" | "logistics" | "childcare_ccs" | "school" | "childcare" | "activities" | "household" | "food" | "emotional" | "social" | "celebrations" | "routines" | "other",
  "assigned_to": "partner_1" | "partner_2" | "shared",
  "dates": [{"date": "YYYY-MM-DD", "description": "...", "is_all_day": boolean, "end_date": "YYYY-MM-DD" | null}],
  "amounts": [{"amount": number, "currency": "AUD", "description": "..."}],
  "contacts": ["name or org mentioned"],
  "location": "location if mentioned" | null,
  "bpay_reference": "BPAY ref if found" | null,
  "is_urgent": boolean
}`;
}

export async function classifyEmail(
  email: GmailMessage
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(email) }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON — strip any markdown fencing if present
  const jsonStr = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    return JSON.parse(jsonStr) as ClassificationResult;
  } catch {
    console.error("Failed to parse classifier response:", text);
    // Return a safe fallback that flags for manual review
    return {
      email_type: "fyi",
      is_family_relevant: true,
      confidence: 0,
      summary: `Could not classify: ${email.subject}`,
      action_needed: false,
      action_description: null,
      category: "other",
      assigned_to: "shared",
      dates: [],
      amounts: [],
      contacts: [],
      location: null,
      bpay_reference: null,
      is_urgent: false,
    };
  }
}

/** Determine routing based on confidence thresholds */
export function getConfidenceRouting(confidence: number) {
  if (confidence >= 85) return "auto" as const; // auto-route silently
  if (confidence >= 60) return "confirm" as const; // create but flag
  return "review" as const; // queue for manual review
}
