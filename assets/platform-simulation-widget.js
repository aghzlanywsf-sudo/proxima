/*
  Proxima — Full Platform Simulation (add-on widget)
  --------------------------------------------------------
  100% additive, same pattern as escrow-widget.js / analytics-widget.js.
  Does not touch app.js or any existing markup/style.

  WHAT THIS IS
  --------------
  A guided, detailed simulation of the ENTIRE platform lifecycle, from a
  star registering on the site to an auction closing and funds being
  released. It is a demo/walkthrough tool (e.g. for pitching investors or
  onboarding a new team member) -- every event is simulated with fake
  data and clearly labeled as a simulation. It does NOT call Stripe,
  Supabase, or any real service, and does NOT charge anything real.

  HOW IT WORKS
  --------------
  A floating "▶ Watch how Proxima works" button opens a modal with:
    - A live-updating auction card (title, current highest bid, timer)
    - A detailed, timestamped event log that fills in step by step
    - Autoplay (advances every ~1.4s) or manual "Next step" control
    - A progress rail showing which phase of the lifecycle we're in

  PHASES SIMULATED (in order)
  ------------------------------
  1. Star registration      -- profile created
  2. Auction created        -- listing goes live with starting price
  3. Bidding opens           -- fans discover the listing
  4. Bids come in            -- multiple simulated bids, increasing
  5. Anti-snipe extension    -- a late bid extends the clock
  6. Auction ends            -- winning bid is locked in
  7. Winner notified         -- winning fan gets a notification
  8. Card authorized         -- escrow hold (not yet charged)
  9. Meeting confirmed       -- both sides confirm it happened
  10. Funds released         -- real 90/10 split computed
  11. Confirmation email     -- sent to the fan
  12. Analytics updated      -- dashboard reflects the new data point

  This maps 1:1 to how the real Escrow Vault + Insights widgets behave,
  just narrated and sped up so the whole flow can be watched end to end.
*/

(function () {
  "use strict";

  const usd = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // ---- Simulated dataset (fake, clearly not real users/cards) -------------
  const SIM = {
    star: { name: "Lina Rashid", category: "Actress", bio: "Award-winning film & TV actress, 2.4M followers" },
    auction: { title: "Private video call + signed poster", startingBid: 500, durationSec: 46 },
    bids: [
      { fan: "fan_amine92", amount: 650 },
      { fan: "sara.k", amount: 900 },
      { fan: "fan_amine92", amount: 1200 },
      { fan: "yasmine_h", amount: 1550 },
      { fan: "sara.k", amount: 2100 },
      { fan: "yasmine_h", amount: 2450 }, // this one lands in the closing window -> anti-snipe
    ],
  };

  const FEE_RATE = 0.10;

  // ---- Styles ----------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #px-sim-root, #px-sim-root * { box-sizing:border-box; }
    #px-sim-root {
      --gold:#E3B23C; --gold-soft:#F0CE7C; --curtain:#7A1F2B; --curtain-light:#9C2E3B;
      --smoke:#211d20; --stage:#151215;
      font-family: ui-sans-serif, system-ui, sans-serif; color:#fff;
    }
    #px-sim-root .sa-display{ font-family:'Fraunces',serif; }
    #px-sim-root .sa-mono{ font-family:'IBM Plex Mono',monospace; }

    #px-sim-fab{
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:45;
      display:flex; align-items:center; gap:8px;
      padding:12px 20px; border-radius:999px; border:none; cursor:pointer;
      background:linear-gradient(90deg,var(--curtain),var(--curtain-light));
      color:#fff; font-weight:600; font-size:13px; box-shadow:0 10px 30px rgba(0,0,0,.4);
      border:1px solid rgba(227,178,60,.35);
    }
    #px-sim-fab:hover{ filter:brightness(1.1); }

    #px-sim-overlay{
      position:fixed; inset:0; z-index:65; display:none; background:rgba(0,0,0,.68);
      align-items:center; justify-content:center; padding:16px;
    }
    #px-sim-overlay.open{ display:flex; }
    #px-sim-modal{
      width:100%; max-width:820px; max-height:94vh; overflow-y:auto;
      background:var(--smoke); border:1px solid rgba(255,255,255,.1); border-radius:18px;
    }
    #px-sim-head{
      position:sticky; top:0; background:var(--smoke); z-index:2;
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 22px; border-bottom:1px solid rgba(255,255,255,.1);
    }
    #px-sim-head .t{ font-size:17px; display:flex; align-items:center; gap:8px; }
    #px-sim-head .tag{ font-size:10.5px; padding:3px 9px; border-radius:999px; background:rgba(227,178,60,.12); border:1px solid rgba(227,178,60,.3); color:var(--gold-soft); margin-right:8px; }
    #px-sim-head button{ background:none; border:none; color:rgba(255,255,255,.5); font-size:20px; cursor:pointer; }
    #px-sim-head button:hover{ color:#fff; }

    #px-sim-body{ padding:20px 22px 24px; display:flex; flex-direction:column; gap:16px; }

    /* progress rail */
    .px-sim-rail{ display:flex; gap:4px; }
    .px-sim-seg{ flex:1; height:5px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; }
    .px-sim-seg.done{ background:var(--gold-soft); }
    .px-sim-seg.active{ background:linear-gradient(90deg,var(--gold),var(--gold-soft)); }

    .px-sim-grid{ display:grid; grid-template-columns:260px 1fr; gap:16px; }
    @media (max-width:680px){ .px-sim-grid{ grid-template-columns:1fr; } }

    /* live auction card */
    .px-sim-card{
      border:1px solid rgba(227,178,60,.25); border-radius:16px; padding:16px;
      background:radial-gradient(circle at top right, rgba(227,178,60,.08), transparent 60%), rgba(255,255,255,.02);
      display:flex; flex-direction:column; gap:10px; height:fit-content;
    }
    .px-sim-card .star-name{ font-size:15px; font-weight:600; }
    .px-sim-card .star-cat{ font-size:11px; color:rgba(255,255,255,.45); }
    .px-sim-card .item-title{ font-size:13.5px; color:var(--gold-soft); margin-top:6px; }
    .px-sim-bidrow{ display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; }
    .px-sim-bidrow .lbl{ font-size:10.5px; color:rgba(255,255,255,.4); }
    .px-sim-bidrow .val{ font-size:22px; font-family:'IBM Plex Mono',monospace; color:var(--gold-soft); font-weight:700; }
    .px-sim-timer{
      display:flex; align-items:center; justify-content:center; gap:6px;
      font-family:'IBM Plex Mono',monospace; font-size:14px; padding:8px; border-radius:10px;
      background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
    }
    .px-sim-timer.urgent{ border-color:#c1483f; color:#f0a19a; }
    .px-sim-timer.closed{ color:rgba(255,255,255,.4); }
    .px-sim-status-badge{
      font-size:11px; text-align:center; padding:6px 10px; border-radius:8px;
      background:rgba(69,160,120,.12); border:1px solid rgba(69,160,120,.3); color:#a9e4c8;
    }
    .px-sim-split{ display:flex; height:10px; border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,.1); margin-top:4px; }
    .px-sim-split .star{ background:linear-gradient(90deg,var(--gold),var(--gold-soft)); }
    .px-sim-split .fee{ background:#45a078; }
    .px-sim-legend{ display:flex; justify-content:space-between; font-size:10.5px; color:rgba(255,255,255,.5); }

    /* event log */
    .px-sim-log{ display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto; padding-right:4px; }
    .px-sim-entry{
      display:grid; grid-template-columns:26px 1fr; gap:10px; padding:10px 12px;
      border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.015);
      animation: pxSimIn .35s ease;
    }
    @keyframes pxSimIn{ from{ opacity:0; transform:translateY(4px); } to{ opacity:1; transform:none; } }
    .px-sim-entry .icon{ font-size:15px; text-align:center; }
    .px-sim-entry .txt .head{ font-size:12.5px; font-weight:600; }
    .px-sim-entry .txt .detail{ font-size:11.5px; color:rgba(255,255,255,.5); margin-top:2px; line-height:1.5; }
    .px-sim-entry .txt .time{ font-size:9.5px; color:rgba(255,255,255,.32); font-family:'IBM Plex Mono',monospace; margin-top:4px; }
    .px-sim-entry.phase{ border-color:rgba(227,178,60,.3); background:rgba(227,178,60,.05); }
    .px-sim-entry.phase .head{ color:var(--gold-soft); }

    .px-sim-controls{ display:flex; gap:10px; }
    .px-sim-btn{
      flex:1; padding:12px 14px; border-radius:12px; cursor:pointer; font-weight:600; font-size:13.5px;
      border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.04); color:#fff;
    }
    .px-sim-btn:hover{ border-color:var(--gold-soft); color:var(--gold-soft); }
    .px-sim-btn.primary{ background:var(--gold-soft); color:var(--stage); border:none; }
    .px-sim-btn.primary:hover{ filter:brightness(1.08); color:var(--stage); }
    .px-sim-btn:disabled{ opacity:.35; cursor:not-allowed; }

    .px-sim-notice{
      font-size:11px; color:rgba(255,255,255,.4); border-top:1px solid rgba(255,255,255,.08);
      padding-top:12px; text-align:center; line-height:1.6;
    }
  `;
  document.head.appendChild(style);

  // ---- DOM shell --------------------------------------------------------
  const root = document.createElement("div");
  root.id = "px-sim-root";
  root.innerHTML = `
    <button id="px-sim-fab">▶ Watch how Proxima works</button>
    <div id="px-sim-overlay">
      <div id="px-sim-modal">
        <div id="px-sim-head">
          <div class="t sa-display"><span class="tag">SIMULATION</span>Platform walkthrough</div>
          <button id="px-sim-close">×</button>
        </div>
        <div id="px-sim-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const overlay = $("#px-sim-overlay");

  $("#px-sim-fab").addEventListener("click", start);
  $("#px-sim-close").addEventListener("click", stop);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) stop(); });

  // ---- Build the full timeline of events -----------------------------------
  function buildTimeline() {
    const events = [];
    let clock = 0; // seconds elapsed, for the "time" label only
    const push = (phaseIdx, icon, head, detail, opts) => {
      clock += (opts && opts.jump) || 2;
      events.push({ phaseIdx, icon, head, detail, t: clock, phaseMark: !!(opts && opts.phaseMark) });
    };

    // Phase 0 -- Star registration
    push(0, "★", "Star registration", null, { phaseMark: true });
    push(0, "📝", `${SIM.star.name} creates a profile`, `Category: ${SIM.star.category}. Bio: "${SIM.star.bio}".`);
    push(0, "✅", "Profile verified", "Identity check passes; the star's public page goes live.");

    // Phase 1 -- Auction created
    push(1, "🎬", "Auction created", null, { phaseMark: true });
    push(1, "🗂️", "Listing drafted", `"${SIM.auction.title}" -- starting bid ${usd(SIM.auction.startingBid)}.`);
    push(1, "📣", "Listing published", `Auction goes live with a ${SIM.auction.durationSec}s countdown (sped up for this demo -- real auctions run for days).`);

    // Phase 2 -- Bidding opens
    push(2, "👀", "Bidding opens", null, { phaseMark: true });
    push(2, "🌐", "Fans discover the listing", "The auction appears on the star's public page and in search.");

    // Phase 3 -- Bids
    let lastAmount = SIM.auction.startingBid;
    SIM.bids.forEach((b, i) => {
      const isLast = i === SIM.bids.length - 1;
      push(3, "💰", `New bid: ${b.fan}`, `Bids ${usd(b.amount)}, outbidding the previous ${usd(lastAmount)}.`, { jump: 3 });
      lastAmount = b.amount;
      if (isLast) {
        push(4, "⏱️", "Anti-snipe extension triggered", "This bid landed inside the final closing window, so the clock automatically extends by 2 minutes -- preventing a last-second snipe.", { phaseMark: true });
      }
    });

    // Phase 5 -- Auction ends
    push(5, "🔔", "Auction ends", null, { phaseMark: true });
    push(5, "🏆", "Winning bid locked in", `${SIM.bids[SIM.bids.length - 1].fan} wins at ${usd(lastAmount)}.`);

    // Phase 6 -- Winner notified
    push(6, "📩", "Winner notified", null, { phaseMark: true });
    push(6, "✉️", "Notification sent", `${SIM.bids[SIM.bids.length - 1].fan} receives a message to complete payment and confirm an email address.`);

    // Phase 7 -- Escrow authorization
    push(7, "🔒", "Card authorized (escrow hold)", null, { phaseMark: true });
    push(7, "💳", "Payment authorized, not yet charged", `${usd(lastAmount)} is reserved on the winning fan's card via Stripe. No money has moved yet.`);
    push(7, "🗄️", "Escrow record saved", "The hold is recorded in the database with status \"held\".");

    // Phase 8 -- Meeting confirmed
    push(8, "🤝", "Meeting confirmed", null, { phaseMark: true });
    push(8, "✅", "Both sides confirm", `${SIM.star.name} and ${SIM.bids[SIM.bids.length - 1].fan} confirm the call took place as agreed.`);

    // Phase 9 -- Funds released
    const platformFee = Math.round(lastAmount * FEE_RATE);
    const starPayout = lastAmount - platformFee;
    push(9, "💸", "Funds released", null, { phaseMark: true });
    push(9, "🏦", "Card captured -- real charge", `The authorized ${usd(lastAmount)} is actually charged now.`);
    push(9, "📊", "90/10 split computed", `${SIM.star.name} receives ${usd(starPayout)}; platform fee is ${usd(platformFee)}.`);

    // Phase 10 -- Email
    push(10, "📧", "Confirmation email sent", null, { phaseMark: true });
    push(10, "✔️", "Real email delivered", "A transactional email confirming the release is sent to the fan's address via Resend.");

    // Phase 11 -- Analytics
    push(11, "📈", "Analytics dashboard updated", null, { phaseMark: true });
    push(11, "🔄", "New data point recorded", `The Insights widget's "Top bids", "Top spenders", and "By star" views now include this ${usd(lastAmount)} sale.`);

    return { events, finalAmount: lastAmount, starPayout, platformFee };
  }

  const PHASES = [
    "Registration", "Auction created", "Bidding opens", "Bids", "Anti-snipe",
    "Auction ends", "Winner notified", "Escrow hold", "Meeting confirmed",
    "Funds released", "Email sent", "Analytics",
  ];

  // ---- Runtime state ---------------------------------------------------------
  let timeline = null;
  let cursor = 0;
  let autoplayTimer = null;
  let currentBidAmount = 0;

  function start() {
    overlay.classList.add("open");
    timeline = buildTimeline();
    cursor = 0;
    currentBidAmount = SIM.auction.startingBid;
    renderShell();
    playAuto();
  }

  function stop() {
    overlay.classList.remove("open");
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  function renderShell() {
    const body = $("#px-sim-body");
    body.innerHTML = `
      <div class="px-sim-rail" id="px-sim-rail">
        ${PHASES.map((_, i) => `<div class="px-sim-seg" data-i="${i}"></div>`).join("")}
      </div>

      <div class="px-sim-grid">
        <div class="px-sim-card" id="px-sim-card">
          <div class="star-name">${SIM.star.name}</div>
          <div class="star-cat">${SIM.star.category}</div>
          <div class="item-title">${SIM.auction.title}</div>
          <div class="px-sim-bidrow"><span class="lbl">CURRENT HIGH BID</span></div>
          <div class="val" id="px-sim-amt">${usd(currentBidAmount)}</div>
          <div class="px-sim-timer" id="px-sim-timer">Auction not started</div>
          <div id="px-sim-status"></div>
          <div id="px-sim-splitwrap" style="display:none;">
            <div class="px-sim-split"><div class="star" id="px-sim-star-bar" style="width:90%;"></div><div class="fee" id="px-sim-fee-bar" style="width:10%;"></div></div>
            <div class="px-sim-legend"><span id="px-sim-star-lbl">Star</span><span id="px-sim-fee-lbl">Fee</span></div>
          </div>
        </div>

        <div>
          <div class="px-sim-log" id="px-sim-log"></div>
        </div>
      </div>

      <div class="px-sim-controls">
        <button class="px-sim-btn" id="px-sim-pause">⏸ Pause</button>
        <button class="px-sim-btn" id="px-sim-next">Next step ▸</button>
        <button class="px-sim-btn primary" id="px-sim-restart">↻ Restart</button>
      </div>
      <div class="px-sim-notice">
        This is a simulation with fake names and amounts, meant to show the full lifecycle end to end.
        No real card, email, or database call is made here -- it mirrors exactly what the real
        Escrow Vault + Insights widgets do when connected (see SETUP.md).
      </div>
    `;

    $("#px-sim-pause").addEventListener("click", toggleAutoplay);
    $("#px-sim-next").addEventListener("click", () => { stopAuto(); step(); });
    $("#px-sim-restart").addEventListener("click", () => { stopAuto(); cursor = 0; currentBidAmount = SIM.auction.startingBid; $("#px-sim-log").innerHTML = ""; $("#px-sim-splitwrap").style.display = "none"; resetCard(); playAuto(); });
  }

  function resetCard() {
    $("#px-sim-amt").textContent = usd(currentBidAmount);
    $("#px-sim-timer").className = "px-sim-timer";
    $("#px-sim-timer").textContent = "Auction not started";
    $("#px-sim-status").innerHTML = "";
    markRail(0);
  }

  function markRail(activeIdx) {
    root.querySelectorAll(".px-sim-seg").forEach((seg) => {
      const i = Number(seg.dataset.i);
      seg.className = "px-sim-seg" + (i < activeIdx ? " done" : i === activeIdx ? " active" : "");
    });
  }

  function playAuto() {
    autoplayTimer = setInterval(() => {
      if (cursor >= timeline.events.length) { stopAuto(); return; }
      step();
    }, 1400);
    $("#px-sim-pause").textContent = "⏸ Pause";
  }
  function stopAuto() { clearInterval(autoplayTimer); autoplayTimer = null; $("#px-sim-pause").textContent = "▶ Resume"; }
  function toggleAutoplay() { if (autoplayTimer) stopAuto(); else playAuto(); }

  function step() {
    if (cursor >= timeline.events.length) return;
    const ev = timeline.events[cursor];
    cursor += 1;

    markRail(ev.phaseIdx);

    // Update the live card based on phase
    if (ev.phaseIdx === 3 && ev.icon === "💰") {
      const match = ev.detail.match(/Bids\s(\$[\d,]+)/);
      // pull the numeric amount straight from the underlying data instead of parsing text
    }

    const log = $("#px-sim-log");
    const entry = document.createElement("div");
    entry.className = "px-sim-entry" + (ev.phaseMark ? " phase" : "");
    entry.innerHTML = `
      <div class="icon">${ev.icon}</div>
      <div class="txt">
        <div class="head">${ev.head}</div>
        ${ev.detail ? `<div class="detail">${ev.detail}</div>` : ""}
        <div class="time">t+${ev.t}s (sim)</div>
      </div>
    `;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    updateCardForEvent(ev);

    if (cursor >= timeline.events.length) stopAuto();
  }

  function updateCardForEvent(ev) {
    const timerEl = $("#px-sim-timer");
    const statusEl = $("#px-sim-status");

    if (ev.head.includes("Listing published")) {
      timerEl.className = "px-sim-timer";
      timerEl.textContent = `Ends in 00:${String(SIM.auction.durationSec).padStart(2, "0")}`;
    }

    if (ev.icon === "💰") {
      // find matching bid amount by fan name mentioned + order -- simplest: recompute from SIM.bids by counting how many 💰 events emitted so far
      const bidEventsSoFar = timeline.events.slice(0, cursor).filter((e) => e.icon === "💰").length;
      const bid = SIM.bids[bidEventsSoFar - 1];
      if (bid) {
        currentBidAmount = bid.amount;
        $("#px-sim-amt").textContent = usd(currentBidAmount);
        timerEl.className = "px-sim-timer urgent";
      }
    }

    if (ev.head.includes("Anti-snipe")) {
      timerEl.textContent = "Extended +2:00 (anti-snipe)";
    }

    if (ev.head.includes("Auction ends")) {
      timerEl.className = "px-sim-timer closed";
      timerEl.textContent = "Auction closed";
    }

    if (ev.head.includes("Card authorized")) {
      statusEl.innerHTML = `<div class="px-sim-status-badge">🔒 ${usd(currentBidAmount)} authorized &amp; held</div>`;
    }

    if (ev.head.includes("Funds released")) {
      statusEl.innerHTML = `<div class="px-sim-status-badge">✅ Released &amp; charged</div>`;
      const wrap = $("#px-sim-splitwrap");
      wrap.style.display = "block";
      $("#px-sim-star-lbl").textContent = `${SIM.star.name}: ${usd(timeline.starPayout)}`;
      $("#px-sim-fee-lbl").textContent = `Platform fee: ${usd(timeline.platformFee)}`;
      const total = timeline.starPayout + timeline.platformFee;
      $("#px-sim-star-bar").style.width = `${(timeline.starPayout / total) * 100}%`;
      $("#px-sim-fee-bar").style.width = `${(timeline.platformFee / total) * 100}%`;
    }
  }

  // ---- Public API -----------------------------------------------------------
  window.pxSimulation = { start, stop };
})();
