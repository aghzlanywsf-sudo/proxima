/*
  Proxima — Auction Insights & Analytics (add-on widget) — v2 (LIVE DATA)
  --------------------------------------------------------------------------
  100% additive, same as escrow-widget.js: injects its own scoped
  styles/DOM, does not touch app.js or any existing markup.

  WHAT CHANGED FROM THE DEMO VERSION
  -------------------------------------
  On load, this widget now pulls real rows from the Supabase `bids` table
  (public, read-only via RLS) instead of starting empty and waiting for
  window.pxAnalytics.setData(...) to be called manually. New bids are
  written automatically by the release-escrow edge function every time an
  escrow payout completes -- so this dashboard reflects real activity with
  zero manual wiring.

  window.pxAnalytics.setData(...) still works as a manual override /
  fallback (e.g. for local testing without Supabase configured).

  DATA SOURCE
  ------------
  Reads from Supabase table `bids`: { auction, star, fan, amount, date }.
  Requires window.PX_CONFIG + window.pxSupabase to be set up in index.html
  (see SETUP.md). If they aren't configured, this widget falls back to
  the empty state instead of throwing errors.
*/

(function () {
  "use strict";

  const PX_ANALYTICS_DATA = {
    currency: "USD",
    bids: [],
  };

  const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  function cfgReady() {
    const c = window.PX_CONFIG || {};
    return c.SUPABASE_URL && !c.SUPABASE_URL.includes("YOUR_PROJECT")
        && c.SUPABASE_ANON_KEY && !c.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        && window.pxSupabase;
  }

  // ---- Styles ----------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #px-an-root, #px-an-root * { box-sizing:border-box; }
    #px-an-root {
      --gold:#E3B23C; --gold-soft:#F0CE7C; --curtain:#7A1F2B; --curtain-light:#9C2E3B;
      --smoke:#211d20; --stage:#151215;
      font-family: ui-sans-serif, system-ui, sans-serif; color:#fff;
    }
    #px-an-root .sa-display{ font-family:'Fraunces',serif; }
    #px-an-root .sa-mono{ font-family:'IBM Plex Mono',monospace; }

    #px-an-fab{
      position:fixed; bottom:24px; left:24px; z-index:45;
      display:flex; align-items:center; gap:8px;
      padding:12px 18px; border-radius:999px; border:none; cursor:pointer;
      background: rgba(255,255,255,.08); color:#fff; border:1px solid rgba(227,178,60,.35);
      font-weight:600; font-size:13px; box-shadow:0 10px 30px rgba(0,0,0,.35);
      transition: filter .15s ease, transform .15s ease;
    }
    #px-an-fab:hover{ filter:brightness(1.1); transform:translateY(-1px); border-color:var(--gold-soft); }

    #px-an-overlay{
      position:fixed; inset:0; z-index:60; display:none; background:rgba(0,0,0,.6);
      align-items:center; justify-content:center; padding:16px;
    }
    #px-an-overlay.open{ display:flex; }
    #px-an-modal{
      width:100%; max-width:720px; max-height:92vh; overflow-y:auto;
      background:var(--smoke); border:1px solid rgba(255,255,255,.1); border-radius:16px;
    }
    #px-an-head{
      position:sticky; top:0; background:var(--smoke); z-index:2;
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 20px; border-bottom:1px solid rgba(255,255,255,.1);
    }
    #px-an-head .t{ font-size:18px; display:flex; align-items:center; gap:8px; }
    #px-an-head button{ background:none; border:none; color:rgba(255,255,255,.5); font-size:20px; cursor:pointer; }
    #px-an-head button:hover{ color:#fff; }

    #px-an-tabs{ display:flex; gap:6px; padding:14px 20px 0; }
    .px-an-tab{
      padding:8px 14px; border-radius:999px; font-size:12.5px; font-weight:600; cursor:pointer;
      background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); color:rgba(255,255,255,.6);
    }
    .px-an-tab.active{ background:var(--gold-soft); color:var(--stage); border-color:var(--gold-soft); }

    #px-an-body{ padding:18px 20px 22px; display:flex; flex-direction:column; gap:16px; }

    .px-an-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
    @media (max-width:640px){ .px-an-stats{ grid-template-columns:repeat(2,1fr); } }
    .px-an-stat{
      border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:12px; background:rgba(255,255,255,.02);
    }
    .px-an-stat .lbl{ font-size:10.5px; color:rgba(255,255,255,.4); }
    .px-an-stat .val{ font-size:16px; margin-top:4px; color:var(--gold-soft); font-weight:600; }

    .px-an-list{ display:flex; flex-direction:column; gap:8px; }
    .px-an-item{
      display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:12px;
      border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px 12px;
      background:rgba(255,255,255,.015);
    }
    .px-an-rank{
      width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700; background:rgba(255,255,255,.06); color:rgba(255,255,255,.6);
    }
    .px-an-rank.r1{ background:var(--gold); color:var(--stage); }
    .px-an-rank.r2{ background:var(--gold-soft); color:var(--stage); }
    .px-an-rank.r3{ background:#c98f4a; color:var(--stage); }
    .px-an-main .title{ font-size:13.5px; font-weight:500; }
    .px-an-main .sub{ font-size:11px; color:rgba(255,255,255,.4); margin-top:2px; }
    .px-an-amt{ text-align:right; font-family:'IBM Plex Mono',monospace; color:var(--gold-soft); font-weight:600; font-size:13.5px; }

    .px-an-bar-wrap{ display:flex; flex-direction:column; gap:10px; }
    .px-an-bar-row{ display:grid; grid-template-columns:120px 1fr 90px; align-items:center; gap:10px; }
    .px-an-bar-row .name{ font-size:12.5px; }
    .px-an-bar-track{ height:10px; border-radius:999px; background:rgba(255,255,255,.06); overflow:hidden; }
    .px-an-bar-fill{ height:100%; background:linear-gradient(90deg,var(--gold),var(--gold-soft)); border-radius:999px; }
    .px-an-bar-row .amt{ text-align:left; font-family:'IBM Plex Mono',monospace; font-size:12px; color:rgba(255,255,255,.7); }

    .px-an-notice{
      font-size:11px; color:rgba(255,255,255,.4); border-top:1px solid rgba(255,255,255,.08);
      padding-top:12px; text-align:center;
    }
  `;
  document.head.appendChild(style);

  // ---- DOM shell --------------------------------------------------------
  const root = document.createElement("div");
  root.id = "px-an-root";
  root.innerHTML = `
    <button id="px-an-fab" title="Auction Insights">📊 Insights</button>
    <div id="px-an-overlay">
      <div id="px-an-modal">
        <div id="px-an-head">
          <div class="t sa-display">📊 Auction Insights</div>
          <button id="px-an-close">×</button>
        </div>
        <div id="px-an-tabs">
          <div class="px-an-tab active" data-tab="top10">Top 10 bids</div>
          <div class="px-an-tab" data-tab="spenders">Top spenders</div>
          <div class="px-an-tab" data-tab="stars">By star</div>
        </div>
        <div id="px-an-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const overlay = $("#px-an-overlay");

  $("#px-an-fab").addEventListener("click", () => { loadRealBids();openModal(); render("top10"); setActiveTab("top10"); });
  $("#px-an-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  root.querySelectorAll(".px-an-tab").forEach((tab) => {
    tab.addEventListener("click", () => { setActiveTab(tab.dataset.tab); render(tab.dataset.tab); });
  });

  function openModal() { overlay.classList.add("open"); }
  function closeModal() { overlay.classList.remove("open"); }
  function setActiveTab(name) {
    root.querySelectorAll(".px-an-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  }

  // ---- Load real bids from Supabase --------------------------------------
  async function loadRealBids() {
    if (!cfgReady()) return; // stays empty -- no Supabase configured yet
    const { data, error } = await window.pxSupabase
      .from("bids")
      .select("*")
      .order("amount", { ascending: false });
    if (error) { console.warn("Proxima analytics: failed to load bids", error.message); return; }
    if (Array.isArray(data)) {
      PX_ANALYTICS_DATA.bids = data;
      const activeTab = root.querySelector(".px-an-tab.active");
      if (activeTab && overlay.classList.contains("open")) render(activeTab.dataset.tab);
    }
  }
  loadRealBids();

  // ---- Derived computations ---------------------------------------------
  function computeAll() {
    const { bids, currency } = PX_ANALYTICS_DATA;
    const totalVolume = bids.reduce((s, b) => s + Number(b.amount), 0);
    const avgBid = totalVolume / (bids.length || 1);

    // top spenders (fans)
    const byFan = {};
    bids.forEach((b) => {
      byFan[b.fan] = byFan[b.fan] || { name: b.fan, total: 0, wins: 0 };
      byFan[b.fan].total += Number(b.amount);
      byFan[b.fan].wins += 1;
    });
    const spenders = Object.values(byFan).sort((a, b) => b.total - a.total);

    // by star
    const byStar = {};
    bids.forEach((b) => {
      byStar[b.star] = byStar[b.star] || { name: b.star, total: 0, count: 0 };
      byStar[b.star].total += Number(b.amount);
      byStar[b.star].count += 1;
    });
    const stars = Object.values(byStar)
      .map((s) => ({ ...s, avg: s.total / s.count }))
      .sort((a, b) => b.total - a.total);

    const top10 = bids.slice().sort((a, b) => b.amount - a.amount).slice(0, 10);
    const topSpender = spenders[0];
    const topStar = stars[0];

    return { currency, totalVolume, avgBid, spenders, stars, top10, topSpender, topStar };
  }

  // ---- Renderers ----------------------------------------------------------
  function statsHeader(d) {
    return `
      <div class="px-an-stats">
        <div class="px-an-stat"><div class="lbl">Total volume</div><div class="val">${money(d.totalVolume)}</div></div>
        <div class="px-an-stat"><div class="lbl">Average winning bid</div><div class="val">${money(Math.round(d.avgBid))}</div></div>
        <div class="px-an-stat"><div class="lbl">Highest-paying audience</div><div class="val">${d.topStar ? d.topStar.name : "—"}</div></div>
        <div class="px-an-stat"><div class="lbl">Top spender</div><div class="val">${d.topSpender ? d.topSpender.name : "—"}</div></div>
      </div>
    `;
  }

  function emptyState() {
    const configured = cfgReady();
    return `
      <div style="text-align:center; padding:26px 10px; color:rgba(255,255,255,.45); font-size:12.5px; line-height:1.7;">
        No bid data yet.<br/>
        ${configured
          ? "Complete an escrow flow (Escrow Vault → confirm meeting) to see real data here, or call window.pxAnalytics.setData(...) to test with sample data."
          : "Supabase isn't configured yet (see SETUP.md) — once connected, this fills automatically as escrow payouts release."}
      </div>
    `;
  }

  function render(tab) {
    const d = computeAll();
    const body = $("#px-an-body");

    if (!d.top10.length) {
      body.innerHTML = statsHeader(d) + emptyState();
      return;
    }

    if (tab === "top10") {
      body.innerHTML = statsHeader(d) + `
        <div class="px-an-list">
          ${d.top10.map((b, i) => `
            <div class="px-an-item">
              <div class="px-an-rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}">${i + 1}</div>
              <div class="px-an-main">
                <div class="title">${b.auction}</div>
                <div class="sub">${b.star} · won by ${b.fan} · ${new Date(b.date).toLocaleDateString()}</div>
              </div>
              <div class="px-an-amt">${money(b.amount)}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    if (tab === "spenders") {
      const max = d.spenders[0] ? d.spenders[0].total : 1;
      body.innerHTML = statsHeader(d) + `
        <div class="sa-display" style="font-size:14px; color:rgba(255,255,255,.7);">Fans ranked by total spend — "whose audience pays the most"</div>
        <div class="px-an-list">
          ${d.spenders.map((s, i) => `
            <div class="px-an-item">
              <div class="px-an-rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}">${i + 1}</div>
              <div class="px-an-main">
                <div class="title">${s.name}</div>
                <div class="sub">${s.wins} winning bid${s.wins > 1 ? "s" : ""}</div>
              </div>
              <div class="px-an-amt">${money(s.total)}</div>
            </div>
          `).join("")}
        </div>
        <div class="px-an-bar-wrap">
          ${d.spenders.map((s) => `
            <div class="px-an-bar-row">
              <div class="name">${s.name}</div>
              <div class="px-an-bar-track"><div class="px-an-bar-fill" style="width:${(s.total / max) * 100}%;"></div></div>
              <div class="amt">${money(s.total)}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    if (tab === "stars") {
      const max = d.stars[0] ? d.stars[0].total : 1;
      body.innerHTML = statsHeader(d) + `
        <div class="sa-display" style="font-size:14px; color:rgba(255,255,255,.7);">Stars ranked by audience spend — total revenue generated by each star's fans</div>
        <div class="px-an-list">
          ${d.stars.map((s, i) => `
            <div class="px-an-item">
              <div class="px-an-rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}">${i + 1}</div>
              <div class="px-an-main">
                <div class="title">${s.name}</div>
                <div class="sub">${s.count} winning bid${s.count > 1 ? "s" : ""} · avg ${money(Math.round(s.avg))}</div>
              </div>
              <div class="px-an-amt">${money(s.total)}</div>
            </div>
          `).join("")}
        </div>
        <div class="px-an-bar-wrap">
          ${d.stars.map((s) => `
            <div class="px-an-bar-row">
              <div class="name">${s.name}</div>
              <div class="px-an-bar-track"><div class="px-an-bar-fill" style="width:${(s.total / max) * 100}%;"></div></div>
              <div class="amt">${money(s.total)}</div>
            </div>
          `).join("")}
        </div>
      `;
    }
  }

  // ---- Public API for manual testing / fallback ---------------------------
  window.pxAnalytics = {
    setData: function (data) {
      if (data && Array.isArray(data.bids)) {
        PX_ANALYTICS_DATA.bids = data.bids;
        if (data.currency) PX_ANALYTICS_DATA.currency = data.currency;
      }
      const activeTab = root.querySelector(".px-an-tab.active");
      if (activeTab) render(activeTab.dataset.tab);
    },
    refresh: loadRealBids,
  };
})();
