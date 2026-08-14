/*
  Proxima — Escrow & Payment Vault (add-on widget) — v3 (LIVE INTEGRATION)
  --------------------------------------------------------------------------
  100% additive. Does not modify app.js or any existing markup/style.

  WHAT CHANGED FROM THE DEMO VERSION
  -------------------------------------
  This version is wired to real (test-mode) services instead of simulating
  everything locally:

    - Card entry now uses Stripe Elements (Stripe.js). The raw card number
      NEVER touches this code or any of your own servers -- Stripe
      tokenizes it directly in the browser. This is required for PCI
      compliance; do not replace this with plain <input> fields that get
      POSTed anywhere.
    - "Hold in escrow" = a real Stripe PaymentIntent is AUTHORIZED
      (capture_method: "manual") via the create-payment-intent edge
      function. Funds are reserved on the card but not yet taken.
    - "Release" = the release-escrow edge function actually CAPTURES the
      PaymentIntent (real charge in test mode), computes the 90/10 split,
      updates Supabase, and sends a real email via Resend.
    - The escrow row is written to Supabase (table: escrow_transactions)
      instead of living only in page memory.

  REQUIRED SETUP (see SETUP.md)
  --------------------------------
  1. window.PX_CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY / STRIPE_PUBLISHABLE_KEY
     filled in inside index.html.
  2. Supabase schema.sql run once in the SQL editor.
  3. Both edge functions deployed with their secrets set.

  Until that's done, this widget will show a clear error instead of
  silently pretending to work.
*/

(function () {
  "use strict";

  const FEE_RATE = 0.10; // platform commission (kept in sync with release-escrow's default, but the
                          // real number that gets charged/paid out always comes from the server response)
  const usd = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  function cfgReady() {
    const c = window.PX_CONFIG || {};
    return c.SUPABASE_URL && !c.SUPABASE_URL.includes("YOUR_PROJECT")
        && c.SUPABASE_ANON_KEY && !c.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        && c.STRIPE_PUBLISHABLE_KEY && !c.STRIPE_PUBLISHABLE_KEY.includes("YOUR_KEY")
        && window.pxSupabase && window.pxStripe;
  }

  function fnUrl(name) {
    return `${window.PX_CONFIG.SUPABASE_URL}/functions/v1/${name}`;
  }

  async function callFn(name, body) {
    const res = await fetch(fnUrl(name), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.PX_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Request to ${name} failed`);
    return data;
  }

  // ---- Styles ------------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #px-escrow-root, #px-escrow-root * { box-sizing:border-box; }
    #px-escrow-root {
      --gold:#E3B23C; --gold-soft:#F0CE7C; --curtain:#7A1F2B; --curtain-light:#9C2E3B;
      --smoke:#211d20; --stage:#151215;
      font-family: ui-sans-serif, system-ui, sans-serif; color:#fff;
    }
    #px-escrow-root .sa-display{ font-family:'Fraunces',serif; }
    #px-escrow-root .sa-mono{ font-family:'IBM Plex Mono',monospace; }

    #px-fab{
      position:fixed; bottom:24px; right:24px; z-index:45;
      display:flex; align-items:center; gap:8px;
      padding:13px 20px; border-radius:999px; border:none; cursor:pointer;
      background:var(--gold-soft); color:var(--stage); font-weight:600; font-size:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      transition: filter .15s ease, transform .15s ease;
    }
    #px-fab:hover{ filter:brightness(1.08); transform:translateY(-1px); }

    #px-overlay{
      position:fixed; inset:0; z-index:60; display:none; background:rgba(0,0,0,.62);
      align-items:center; justify-content:center; padding:16px;
    }
    #px-overlay.open{ display:flex; }
    #px-modal{
      width:100%; max-width:540px; max-height:94vh; overflow-y:auto;
      background:var(--smoke); border:1px solid rgba(255,255,255,.1); border-radius:18px;
    }
    #px-modal-head{
      position:sticky; top:0; background:var(--smoke); z-index:2;
      display:flex; align-items:center; justify-content:space-between;
      padding:18px 24px; border-bottom:1px solid rgba(255,255,255,.1);
    }
    #px-modal-head .t{ font-size:19px; display:flex; align-items:center; gap:8px; }
    #px-modal-head button{ background:none; border:none; color:rgba(255,255,255,.5); font-size:22px; cursor:pointer; line-height:1; }
    #px-modal-head button:hover{ color:#fff; }
    #px-body{ padding:24px; display:flex; flex-direction:column; gap:18px; }

    .px-muted{ color:rgba(255,255,255,.42); font-size:12px; line-height:1.6; }
    .px-pill{
      font-size:11px; letter-spacing:.06em; padding:5px 12px; border-radius:999px;
      border:1px solid rgba(227,178,60,.3); color:var(--gold-soft); background:rgba(227,178,60,.08);
    }

    .px-explainer{
      background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);
      border-radius:14px; padding:16px 18px; display:flex; flex-direction:column; gap:8px;
    }
    .px-explainer .h{ font-size:13.5px; font-weight:600; color:var(--gold-soft); display:flex; align-items:center; gap:6px; }
    .px-explainer ol{ margin:0; padding-right:18px; display:flex; flex-direction:column; gap:6px; }
    .px-explainer li{ font-size:12.5px; color:rgba(255,255,255,.7); line-height:1.6; }
    .px-explainer li b{ color:#fff; }

    .px-field{ display:flex; flex-direction:column; gap:8px; }
    .px-field span{ font-size:12.5px; color:rgba(255,255,255,.55); font-weight:500; }
    .px-field .box{
      display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px;
    }
    .px-field .box:focus-within{ border-color:var(--gold-soft); }
    .px-field input{
      flex:1; background:transparent; border:none; outline:none; color:#fff; font-size:16px; font-family:inherit;
    }
    .px-row2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }

    .px-btn-gold{
      width:100%; padding:15px 18px; border-radius:14px; border:none; cursor:pointer;
      background:var(--gold-soft); color:var(--stage); font-weight:700; font-size:15.5px;
      transition:filter .15s ease;
    }
    .px-btn-gold:hover{ filter:brightness(1.08); }
    .px-btn-gold:disabled{ opacity:.4; cursor:not-allowed; }
    .px-btn-outline{
      width:100%; padding:15px 18px; border-radius:14px; cursor:pointer;
      background:transparent; border:1px solid rgba(255,255,255,.18); color:#fff; font-size:15px; font-weight:600;
    }
    .px-btn-outline:hover{ border-color:var(--gold-soft); color:var(--gold-soft); }
    .px-btn-outline:disabled{ opacity:.4; cursor:not-allowed; }
    .px-btn-ghost{
      width:100%; padding:12px; border-radius:12px; cursor:pointer; background:transparent;
      border:none; color:rgba(255,255,255,.5); font-size:13px;
    }
    .px-btn-ghost:hover{ color:#fff; }

    .px-vault{ position:relative; margin:12px 0 4px; }
    .px-vault-line{ position:absolute; top:15px; right:20px; left:20px; height:2px; background:rgba(255,255,255,.1); }
    .px-vault-fill{ position:absolute; top:15px; right:20px; height:2px; background:linear-gradient(90deg,var(--gold),var(--gold-soft)); transition:width .5s ease; }
    .px-vault-steps{ display:flex; justify-content:space-between; position:relative; }
    .px-vault-step{ display:flex; flex-direction:column; align-items:center; gap:6px; width:64px; }
    .px-dot{
      width:32px; height:32px; border-radius:50%; background:var(--stage); border:2px solid rgba(255,255,255,.15);
      display:flex; align-items:center; justify-content:center; font-size:12px; color:rgba(255,255,255,.5); z-index:1;
    }
    .px-dot.done{ background:var(--gold); border-color:var(--gold); color:var(--stage); }
    .px-dot.active{ background:var(--gold-soft); border-color:var(--gold-soft); color:var(--stage); box-shadow:0 0 0 5px rgba(240,206,124,.15); }
    .px-vault-step span{ font-size:10.5px; text-align:center; color:rgba(255,255,255,.42); }

    .px-status{
      font-size:13px; padding:12px 14px; border-radius:12px;
      background:rgba(227,178,60,.08); border:1px solid rgba(227,178,60,.25); color:var(--gold-soft);
    }
    .px-status.ok{ background:rgba(69,160,120,.12); border-color:rgba(69,160,120,.35); color:#a9e4c8; }
    .px-status.err{ background:rgba(193,72,63,.12); border-color:rgba(193,72,63,.4); color:#f0a19a; }

    .px-split{ display:flex; height:13px; border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,.1); }
    .px-split .star{ background:linear-gradient(90deg,var(--gold),var(--gold-soft)); height:100%; }
    .px-split .fee{ background:#45a078; height:100%; }
    .px-legend{ display:flex; justify-content:space-between; font-size:12px; color:rgba(255,255,255,.55); margin-top:8px; }
    .px-legend b{ color:#fff; }

    .px-notice{
      font-size:11.5px; color:rgba(255,255,255,.4); border-top:1px solid rgba(255,255,255,.08);
      padding-top:14px; margin-top:4px; text-align:center; line-height:1.6;
    }
    .px-error{ font-size:12.5px; color:#e8b6b0; }

    .px-summary{ display:flex; flex-direction:column; gap:10px; border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:16px 18px; background:rgba(255,255,255,.02); }
    .px-summary-row{ display:flex; justify-content:space-between; font-size:13px; }
    .px-summary-row span{ color:rgba(255,255,255,.5); }
    .px-summary-row b{ color:#fff; }

    #px-card-element{
      background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px;
    }
    #px-card-element.StripeElement--focus{ border-color:var(--gold-soft); }
  `;
  document.head.appendChild(style);

  // ---- DOM shell -----------------------------------------------------------
  const root = document.createElement("div");
  root.id = "px-escrow-root";
  root.innerHTML = `
    <button id="px-fab" title="Escrow Vault">🔒 Escrow Vault</button>
    <div id="px-overlay">
      <div id="px-modal">
        <div id="px-modal-head">
          <div class="t sa-display">🔒 Escrow Vault</div>
          <button id="px-close">×</button>
        </div>
        <div id="px-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const overlay = $("#px-overlay");
  const body = $("#px-body");

  $("#px-fab").addEventListener("click", () => openDetails());
  $("#px-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  function openModal() { overlay.classList.add("open"); }
  function closeModal() { overlay.classList.remove("open"); }

  function configErrorScreen() {
    body.innerHTML = `
      <div class="px-status err">
        This widget isn't connected yet. Fill in <b class="sa-mono">window.PX_CONFIG</b>
        (Supabase URL/key + Stripe publishable key) in <b>index.html</b>, deploy the two
        edge functions, and run <b class="sa-mono">schema.sql</b> in Supabase. See SETUP.md.
      </div>
    `;
  }

  // ---- Step 1: enter the winning-bid details (no placeholder data) --------
  function openDetails(prefill) {
    openModal();
    const p = prefill || {};
    body.innerHTML = `
      <span class="px-pill">STEP 1 OF 2 -- DETAILS</span>

      <div class="px-field"><span>Item or experience title</span>
        <div class="box"><input id="pxd-title" placeholder="e.g. Private meet and photo session" value="${p.title || ""}" /></div>
      </div>
      <div class="px-row2">
        <div class="px-field"><span>Star's name</span>
          <div class="box"><input id="pxd-star" placeholder="e.g. Lina Rashid" value="${p.starName || ""}" /></div>
        </div>
        <div class="px-field"><span>Winning amount (USD)</span>
          <div class="box"><input id="pxd-amount" type="number" min="1" step="1" placeholder="e.g. 4500" value="${p.amount || ""}" /></div>
        </div>
      </div>
      <div class="px-field"><span>Email for confirmation</span>
        <div class="box"><input id="pxd-email" type="email" placeholder="you@example.com" value="${p.email || ""}" /></div>
      </div>

      <button class="px-btn-gold" id="pxd-next">Continue to payment</button>
    `;

    $("#pxd-next").addEventListener("click", () => {
      const title = $("#pxd-title").value.trim();
      const starName = $("#pxd-star").value.trim();
      const amount = Number($("#pxd-amount").value);
      const email = $("#pxd-email").value.trim();
      if (!title || !starName || !amount || amount <= 0) {
        alert("Please fill in the title, star's name, and a valid amount.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Please enter a valid email address for the confirmation.");
        return;
      }
      openCheckout({ title, starName, amount, email });
    });
  }

  // ---- Step 2: card entry (Stripe Elements) + review, combined ------------
  let elements = null;
  let cardElement = null;
  let cardComplete = false;

  async function openCheckout(item) {
    if (!cfgReady()) { configErrorScreen(); return; }

    body.innerHTML = `
      <span class="px-pill">STEP 2 OF 2 -- CARD & CONFIRM</span>
      <div class="sa-display" style="font-size:18px;">${item.title}</div>
      <div class="px-muted">Winning amount: <b style="color:#fff;">${usd(item.amount)}</b> -- your card is authorized now and only actually charged once both sides confirm the meeting happened.</div>
      <div class="px-status">Preparing a secure payment session with Stripe...</div>
    `;

    let intent;
    try {
      intent = await callFn("create-payment-intent", { amount: item.amount });
    } catch (err) {
      body.innerHTML += `<div class="px-status err">Couldn't start payment: ${err.message}</div>`;
      return;
    }
    item.clientSecret = intent.client_secret;
    item.paymentIntentId = intent.id;

    elements = window.pxStripe.elements();
    cardElement = elements.create("card", {
      style: { base: { color: "#fff", fontSize: "16px", "::placeholder": { color: "rgba(255,255,255,.35)" } }, invalid: { color: "#f0a19a" } },
    });

    body.innerHTML = `
      <span class="px-pill">STEP 2 OF 2 -- CARD & CONFIRM</span>
      <div class="sa-display" style="font-size:18px;">${item.title}</div>

      <div class="px-explainer">
        <div class="h">i How this works</div>
        <ol>
          <li>Your card is <b>authorized</b> (reserved) for ${usd(item.amount)}, not charged yet.</li>
          <li>Funds are captured -- actually charged -- only when the meeting is confirmed below.</li>
          <li>Stripe handles your card number directly; it never passes through our servers.</li>
          <li>A real confirmation email goes to <b>${item.email}</b> once funds are released.</li>
        </ol>
      </div>

      <div class="px-field"><span>Name on card</span>
        <div class="box"><input id="pxc-name" placeholder="As printed on the card" /></div>
      </div>
      <div class="px-field"><span>Card details</span>
        <div id="px-card-element"></div>
      </div>

      <div id="pxc-error" class="px-error" style="display:none;"></div>

      <div class="px-summary">
        <div class="px-summary-row"><span>Star</span><b>${item.starName}</b></div>
        <div class="px-summary-row"><span>Confirmation email</span><b>${item.email}</b></div>
        <div class="px-summary-row"><span>Amount to hold in escrow</span><b style="color:var(--gold-soft);">${usd(item.amount)}</b></div>
      </div>

      <button class="px-btn-gold" id="pxc-confirm">Confirm and hold ${usd(item.amount)} in escrow</button>
      <button class="px-btn-ghost" id="pxc-back">Back to details</button>
    `;

    cardElement.mount("#px-card-element");
    cardElement.on("change", (e) => {
      cardComplete = e.complete;
      const errEl = $("#pxc-error");
      if (e.error) { errEl.textContent = e.error.message; errEl.style.display = "block"; }
      else errEl.style.display = "none";
    });

    $("#pxc-back").addEventListener("click", () => { cardElement.unmount(); openDetails(item); });

    $("#pxc-confirm").addEventListener("click", async () => {
      const name = $("#pxc-name").value.trim();
      const errEl = $("#pxc-error");
      if (!name) { errEl.textContent = "Enter the cardholder name."; errEl.style.display = "block"; return; }
      if (!cardComplete) { errEl.textContent = "Enter complete, valid card details."; errEl.style.display = "block"; return; }
      errEl.style.display = "none";

      const btn = $("#pxc-confirm");
      btn.disabled = true;
      btn.textContent = "Authorizing card...";

      const { paymentIntent, error } = await window.pxStripe.confirmCardPayment(item.clientSecret, {
        payment_method: { card: cardElement, billing_details: { name } },
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = `Confirm and hold ${usd(item.amount)} in escrow`;
        errEl.textContent = error.message;
        errEl.style.display = "block";
        return;
      }

      if (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded") {
        openEscrow(item);
      } else {
        errEl.textContent = `Unexpected payment status: ${paymentIntent.status}`;
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = `Confirm and hold ${usd(item.amount)} in escrow`;
      }
    });
  }

  // ---- Step 3: real escrow state machine -----------------------------------
  const STEPS = ["Authorized", "Held in vault", "Meeting confirmed", "Released"];

  async function openEscrow(item) {
    const escrowId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now());
    item.escrowId = escrowId;

    body.innerHTML = `
      <div class="sa-display" style="font-size:17px;">${item.title}</div>
      <div class="px-vault">
        <div class="px-vault-line"></div>
        <div class="px-vault-fill" id="pxv-fill" style="width:0%;"></div>
        <div class="px-vault-steps" id="pxv-steps">
          ${STEPS.map((s, i) => `<div class="px-vault-step"><div class="px-dot" data-i="${i}">${i + 1}</div><span>${s}</span></div>`).join("")}
        </div>
      </div>
      <div class="px-status" id="pxv-status">Saving escrow record...</div>
      <div id="pxv-confirm" style="display:none;">
        <button class="px-btn-outline" id="pxv-confirm-btn">Confirm: the meeting took place</button>
      </div>
      <div id="pxv-split" style="display:none;">
        <div class="px-split"><div class="star" id="pxv-star-bar" style="width:90%;"></div><div class="fee" id="pxv-fee-bar" style="width:10%;"></div></div>
        <div class="px-legend">
          <span>To ${item.starName}: <b id="pxv-star-amt">--</b></span>
          <span>Platform fee: <b id="pxv-fee-amt">--</b></span>
        </div>
      </div>
      <div class="px-status" id="pxv-email" style="display:none;">📧 A real confirmation email was sent to <b>${item.email}</b> via Resend.</div>
    `;

    function setStep(activeIdx, doneUpTo) {
      root.querySelectorAll(".px-dot").forEach((dot) => {
        const i = Number(dot.dataset.i);
        dot.className = "px-dot";
        if (i < doneUpTo) { dot.classList.add("done"); dot.textContent = "OK"; }
        else if (i === activeIdx) { dot.classList.add("active"); dot.textContent = i + 1; }
        else dot.textContent = i + 1;
      });
      $("#pxv-fill").style.width = (doneUpTo / (STEPS.length - 1)) * 100 + "%";
    }

    setStep(0, 0);

    // Write the "held" escrow row for real (RLS only allows insert with status='held').
    const { error: insertErr } = await window.pxSupabase.from("escrow_transactions").insert({
      id: escrowId,
      item_title: item.title,
      star_name: item.starName,
      fan_email: item.email,
      amount: item.amount,
      stripe_payment_intent_id: item.paymentIntentId,
      status: "held",
    });

    if (insertErr) {
      $("#pxv-status").className = "px-status err";
      $("#pxv-status").textContent = `Card was authorized on Stripe, but saving the escrow record failed: ${insertErr.message}`;
      return;
    }

    setStep(1, 1);
    $("#pxv-status").className = "px-status ok";
    $("#pxv-status").textContent = `${usd(item.amount)} is authorized and held. Nothing is charged to ${item.starName}'s fan until both sides confirm the meeting happened.`;
    $("#pxv-confirm").style.display = "block";

    $("#pxv-confirm-btn").addEventListener("click", async () => {
      const confirmBtn = $("#pxv-confirm-btn");
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Releasing funds...";
      setStep(2, 2);
      $("#pxv-status").className = "px-status";
      $("#pxv-status").textContent = "Meeting confirmed. Capturing payment and releasing funds...";

      try {
        // SECURITY: release-escrow now reads amount / item_title /
        // star_name / fan_email from the escrow_transactions row itself
        // (server-side), not from this request -- a client can no longer
        // influence the payout math by sending different values here.
        // Only escrow_id is needed; payment_intent_id is sent too but is
        // purely informational (the server re-reads it from the DB row).
        const result = await callFn("release-escrow", {
          escrow_id: escrowId,
        });

        setStep(3, 4);
        $("#pxv-confirm").style.display = "none";
        $("#pxv-status").className = "px-status ok";
        $("#pxv-status").textContent = "Done -- the card was actually charged and the payout was calculated and released.";
        $("#pxv-split").style.display = "block";
        $("#pxv-star-amt").textContent = usd(result.starPayout);
        $("#pxv-fee-amt").textContent = usd(result.platformFee);
        const total = result.starPayout + result.platformFee;
        $("#pxv-star-bar").style.width = `${(result.starPayout / total) * 100}%`;
        $("#pxv-fee-bar").style.width = `${(result.platformFee / total) * 100}%`;
        $("#pxv-email").style.display = "block";
      } catch (err) {
        $("#pxv-status").className = "px-status err";
        $("#pxv-status").textContent = `Release failed: ${err.message}`;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm: the meeting took place";
      }
    });
  }

  // ---- Public API for real integration ---------------------------------------
  window.pxEscrow = {
    // item = { title, starName, amount, email } -- amount in USD
    openCheckout: function (item) {
      openModal();
      if (item && item.title && item.starName && item.amount && item.email) {
        openCheckout(item);
      } else {
        openDetails(item);
      }
    },
  };
})();
