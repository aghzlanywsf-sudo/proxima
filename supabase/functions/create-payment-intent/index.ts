// Supabase Edge Function: create-payment-intent
// -------------------------------------------------------------------------
// Called from the browser right before the card form is shown. Creates a
// Stripe PaymentIntent with manual capture: the card is AUTHORIZED (funds
// reserved) but not actually charged yet. This is the "hold in escrow"
// step. The money is only truly taken from the card in release-escrow.
//
// Secrets required (set with: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY   -- your Stripe TEST secret key (sk_test_...)
// -------------------------------------------------------------------------
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { amount } = await req.json();
    const n = Number(amount);
    if (!n || n <= 0) throw new Error("Invalid amount");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(n * 100), // Stripe uses cents
      currency: "usd",
      capture_method: "manual",     // authorize now, capture later on release
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });

    return new Response(
      JSON.stringify({ client_secret: paymentIntent.client_secret, id: paymentIntent.id }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
