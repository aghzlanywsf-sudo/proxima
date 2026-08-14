-- Proxima -- Supabase schema
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table: bids
-- Feeds the Analytics/Insights widget (top 10 bids, top spenders, by star).
-- A row is created automatically when an escrow payout is released
-- (see release-escrow edge function) -- you never insert here directly
-- from the front end.
-- ---------------------------------------------------------------------------
create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction text not null,
  star text not null,
  fan text not null,          -- fan's email or display name
  amount numeric not null,
  date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: escrow_transactions
-- One row per escrow flow: created when a card is authorized ("held"),
-- updated when funds are released.
-- ---------------------------------------------------------------------------
create table if not exists public.escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  item_title text not null,
  star_name text not null,
  fan_email text not null,
  amount numeric not null,
  stripe_payment_intent_id text,
  status text not null default 'held',   -- held | released | failed
  star_payout numeric,
  platform_fee numeric,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bids enable row level security;
alter table public.escrow_transactions enable row level security;

-- Anyone (anon key, i.e. the front end) can READ bids -- needed for the
-- Analytics widget's public dashboard.
create policy "public can read bids"
  on public.bids for select
  using (true);

-- Only the edge functions (using the service role key, which bypasses RLS)
-- are allowed to insert bids. No insert policy is defined for anon here,
-- so the front end cannot write fake bids directly.

-- The front end is allowed to create a NEW escrow row only in the "held"
-- state, right after a card is successfully authorized. It can never read
-- rows back or flip status to "released" itself -- that only happens
-- server-side in the release-escrow edge function via the service role key.
--
-- NOTE ON A REMAINING RISK: this policy can't verify that
-- stripe_payment_intent_id actually belongs to a real authorization for
-- `amount` -- RLS has no way to call Stripe. Someone could still insert a
-- row claiming amount = 1000 pointing at a payment intent that Stripe
-- only ever authorized for 1. That's why release-escrow (the edge
-- function) re-checks the amount Stripe actually captured against this
-- row's `amount` before recording any payout, and aborts + marks the row
-- "failed" if they don't match. The DB-level checks below are a cheap
-- first filter, not the actual security boundary.
create policy "anon can create a held escrow row"
  on public.escrow_transactions for insert
  with check (
    status = 'held'
    and amount > 0
    and stripe_payment_intent_id is not null
    and stripe_payment_intent_id <> ''
  );
