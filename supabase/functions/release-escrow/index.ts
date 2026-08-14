// Supabase Edge Function: release-escrow
// -------------------------------------------------------------------------
// Called when the fan/star confirm "the meeting took place". This is the
// ONLY place money actually moves.
//
// SECURITY FIX (v2)
// -------------------------------------------------------------------------
// The previous version trusted `amount`, `item_title`, `star_name`, and
// `fan_email` directly from the request body sent by the browser. That
// meant anyone who knew (or guessed) an escrow_id + payment_intent_id
// could call this endpoint with a forged `amount` and change how the
// 90/10 split was calculated -- without changing what Stripe actually
// captures. This version:
//
//   1. Reads escrow_id from the request, but pulls amount / item_title /
//      star_name / fan_email from the DATABASE ROW (the source of truth
//      that was written -- honestly, by the front end -- back when the
//      card was authorized). The request body can no longer influence
//      the money math at all.
//   2. Refuses to run twice on the same escrow (status must be "held").
//   3. After calling Stripe's capture, it double-checks that the amount
//      Stripe actually captured matches the escrow row's amount. If they
//      don't match (e.g. someone inserted a fake escrow row pointing at
//      a payment intent authorized for a different, smaller amount),
//      the release is aborted, the escrow is marked "failed", and no
//      payout/bid/email is recorded.
//
// This still doesn't replace real user authentication (there's no login
// system in this schema yet), so it can't yet verify that the caller is
// the actual fan or star involved. Before handling real funds, add auth
// and check req auth uid against the escrow row's owner.
//
// Secrets required (set with: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY            -- your Stripe secret key
//   SUPABASE_URL                 -- auto-provided by Supabase, no need to set
//   SUPABASE_SERVICE_ROLE_KEY    -- from Project Settings -> API (KEEP SECRET)
//   RESEND_API_KEY               -- from resend.com dashboard
// -------------------------------------------------------------------------
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const FEE_RATE = 0.10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Turns a raw email into a public-safe display string for the Analytics
// widget (which is readable by anyone -- see schema.sql RLS policy on
// `bids`). Never store/display the raw email publicly.
function maskEmail(email: string): string {
  const [user, domain] = String(email).split("@");
  if (!user || !domain) return "a fan";
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Only escrow_id is taken from the request -- everything else about
    // "how much" and "who" comes from the database row itself.
    const { escrow_id } = await req.json();
    if (!escrow_id) throw new Error("Missing escrow_id");

    // 1. Fetch the escrow row -- the single source of truth for amount,
    //    item, star, and fan. Never trust these fields if they arrive
    //    from the browser instead.
    const { data: escrow, error: fetchErr } = await supabase
      .from("escrow_transactions")
      .select("*")
      .eq("id", escrow_id)
      .single();
    if (fetchErr || !escrow) throw new Error("Escrow record not found");

    // 2. State guard: only a "held" escrow can be released. Blocks
    //    double-release / double-capture if this endpoint is called
    //    twice (accidentally or maliciously) for the same escrow.
    if (escrow.status !== "held") {
      throw new Error(`Escrow is not in a releasable state (status: ${escrow.status})`);
    }
    if (!escrow.stripe_payment_intent_id) {
      throw new Error("Escrow has no associated payment intent");
    }

    const amount = Number(escrow.amount);
    const item_title = escrow.item_title;
    const star_name = escrow.star_name;
    const fan_email = escrow.fan_email;

    // 3. Actually charge the card now (capture the authorized amount).
    const captured = await stripe.paymentIntents.capture(escrow.stripe_payment_intent_id);

    // 4. Cross-check: does what Stripe actually captured match what the
    //    escrow row claims was held? If someone inserted a forged escrow
    //    row (e.g. amount: 1000 pointing at a payment intent that was
    //    only ever authorized for 1), this catches it before any payout
    //    or email is generated -- the mismatch is what matters, not
    //    which side lied.
    const expectedCents = Math.round(amount * 100);
    if (captured.amount_received !== expectedCents || captured.status !== "succeeded") {
      await supabase
        .from("escrow_transactions")
        .update({ status: "failed" })
        .eq("id", escrow_id)
        .eq("status", "held");
      throw new Error(
        `Captured amount ($${(captured.amount_received / 100).toFixed(2)}) does not match ` +
        `escrow amount ($${amount.toFixed(2)}). Release aborted and flagged for review.`
      );
    }

    // 5. Compute the split -- based on the DB amount, never on anything
    //    from the request body.
    const platformFee = Math.round(amount * FEE_RATE);
    const starPayout = amount - platformFee;

    // 6. Mark the escrow row released (service role bypasses RLS). The
    //    extra .eq("status", "held") guards against a race where two
    //    requests reach here at nearly the same time.
    const { error: updateErr, data: updated } = await supabase
      .from("escrow_transactions")
      .update({
        status: "released",
        star_payout: starPayout,
        platform_fee: platformFee,
        released_at: new Date().toISOString(),
      })
      .eq("id", escrow_id)
      .eq("status", "held")
      .select();
    if (updateErr) throw updateErr;
    if (!updated || updated.length === 0) {
      throw new Error("Escrow was already released by another request (race condition avoided)");
    }

    // 7. Feed the Analytics dashboard -- a masked, public-safe fan label
    //    only. Never insert the raw email; the `bids` table is readable
    //    by anyone via the public Insights widget.
    await supabase.from("bids").insert({
      auction: item_title,
      star: star_name,
      fan: maskEmail(fan_email),
      amount,
    });

    // 8. Send a real confirmation email via Resend -- to the address on
    //    file in the escrow row, never to an address from the request.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Replace with your own verified domain sender once you have one.
          from: "Proxima <onboarding@resend.dev>",
          to: [fan_email],
          subject: `Escrow released -- ${item_title}`,
          html: `<p>Your payment for <b>${item_title}</b> with ${star_name} has been released.</p>
                 <p>${star_name} receives $${starPayout}. Platform fee: $${platformFee}.</p>`,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, starPayout, platformFee }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
