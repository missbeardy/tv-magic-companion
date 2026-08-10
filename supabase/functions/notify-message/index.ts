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
//   • Holds no push credentials of its own — see below.
//
// Delivery (T1.12):
//   Push is sent by POSTing to the Vercel hub at ?action=push-send, which owns the
//   VAPID keys and the one sender implementation (api/_lib/webPush.ts). Keeping the
//   sender in one place avoids a second copy of the keys here and avoids betting on
//   Deno's node-crypto compatibility for npm:web-push.

import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("MESSAGING_WEBHOOK_SECRET");
const PUSH_SHARED_SECRET = Deno.env.get("PUSH_SHARED_SECRET");
const PLATFORM_URL = Deno.env.get("PLATFORM_URL");
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

/** Send a push via the Vercel sender. Returns true on 2xx. Never logs body content. */
async function sendPush(opts: {
  userIds: string[];
  title: string;
  contents: string;
  url?: string;
}): Promise<boolean> {
  if (!PUSH_SHARED_SECRET || !PLATFORM_URL) {
    console.error("notify-message: push secrets unset; skipping push");
    return false;
  }
  if (opts.userIds.length === 0) return false;

  try {
    const res = await fetch(
      `${PLATFORM_URL.replace(/\/$/, "")}/api/send-sms?action=push-send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-push-secret": PUSH_SHARED_SECRET,
        },
        body: JSON.stringify({
          userIds: opts.userIds,
          payload: {
            title: opts.title,
            body: opts.contents,
            ...(opts.url ? { url: opts.url } : {}),
          },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Every profile id — announcements are a broadcast, and the sender needs explicit
 *  recipients now that OneSignal's "Subscribed Users" segment is gone. */
async function allProfileIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabase.from("profiles").select("id");
  if (error || !data) return [];
  return data.map((r) => r.id as string);
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
        userIds: [ownerId],
        title: "New message from support",
        contents: bodyPreview,
        url: "/support",
      });
    } else {
      // User posted → notify every platform admin.
      ok = await sendPush({
        userIds: admins,
        title: "New support message",
        contents: bodyPreview,
        url: "/support",
      });
    }
  } else if (payload.table === "platform_announcements") {
    ok = await sendPush({
      userIds: await allProfileIds(supabase),
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
