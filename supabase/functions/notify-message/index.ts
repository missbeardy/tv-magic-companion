// notify-message — push notifications for internal support messaging.
//
// Triggered by Supabase Database Webhooks on INSERT into:
//   • public.support_messages      (1:1 thread user ↔ platform admin)
//   • public.platform_announcements (one-way broadcast)
//
// Security:
//   • Verifies a shared-secret header. FAIL CLOSED: if MESSAGING_WEBHOOK_SECRET
//     is unset or the header does not match, returns 401 and does nothing.
//   • Never logs message bodies, user ids alongside bodies, or payload contents.
//     Logs only event type + success/failure counts.
//   • OneSignal REST key is read from an Edge Function secret, never bundled.

import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("MESSAGING_WEBHOOK_SECRET");
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const PREVIEW_LEN = 60;

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

function preview(body: unknown): string {
  const s = typeof body === "string" ? body : "";
  return s.length > PREVIEW_LEN ? `${s.slice(0, PREVIEW_LEN)}…` : s;
}

/** Send a OneSignal push. Returns true on 2xx. Never logs body content. */
async function sendPush(opts: {
  externalIds?: string[];
  segments?: string[];
  title: string;
  contents: string;
  url?: string;
}): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    console.error("notify-message: OneSignal secrets unset; skipping push");
    return false;
  }
  if (opts.externalIds && opts.externalIds.length === 0) return false;

  const payload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    headings: { en: opts.title },
    contents: { en: opts.contents },
  };
  if (opts.url) payload.url = opts.url;
  if (opts.segments) payload.included_segments = opts.segments;
  if (opts.externalIds) payload.include_aliases = { external_id: opts.externalIds };

  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function platformAdminIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "platform_admin");
  if (error || !data) return [];
  return data.map((r) => r.id as string);
}

Deno.serve(async (req) => {
  // ── Fail closed on auth ──────────────────────────────────────────────────
  const provided = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || !provided || provided !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("notify-message: Supabase env unset");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (payload.type !== "INSERT" || !payload.record) {
    return new Response("Ignored", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let ok = false;

  if (payload.table === "support_messages") {
    const senderId = payload.record.sender_id as string;
    const ownerId = payload.record.user_id as string;
    const bodyPreview = preview(payload.record.body);

    const admins = await platformAdminIds(supabase);
    const senderIsAdmin = admins.includes(senderId);

    if (senderIsAdmin) {
      // Support replied → notify the thread owner.
      ok = await sendPush({
        externalIds: [ownerId],
        title: "New message from support",
        contents: bodyPreview,
        url: "/support",
      });
    } else {
      // User posted → notify every platform admin.
      ok = await sendPush({
        externalIds: admins,
        title: "New support message",
        contents: bodyPreview,
        url: "/support",
      });
    }
  } else if (payload.table === "platform_announcements") {
    ok = await sendPush({
      segments: ["Subscribed Users"],
      title: "New announcement",
      contents: preview(payload.record.body),
      url: "/support",
    });
  } else {
    return new Response("Ignored", { status: 200 });
  }

  console.log(`notify-message: ${payload.table} push ${ok ? "sent" : "failed"}`);
  return new Response(JSON.stringify({ ok }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
