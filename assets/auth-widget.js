/* =====================================================================
   PROXIMA — Auth Widget (login / signup / profile)
   نظام تسجيل دخول حقيقي مربوط بـ Supabase Auth + جدول profiles + Storage
   لا يلمس assets/app.js إطلاقًا — يضيف نفسه للصفحة فقط.
===================================================================== */
(function () {
  "use strict";

  /* ---------- 1) جلب إعدادات Supabase من window.PX_CONFIG ---------- */
  function findConfigValue(cfg, patterns) {
    if (!cfg) return null;
    var keys = Object.keys(cfg);
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toUpperCase().indexOf(patterns[p]) !== -1) {
          return cfg[keys[i]];
        }
      }
    }
    return null;
  }

  var PX_CFG = window.PX_CONFIG || {};
  var SUPABASE_URL = findConfigValue(PX_CFG, ["SUPABASE_URL"]);
  var SUPABASE_ANON_KEY = findConfigValue(PX_CFG, [
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE",
  ]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[auth-widget] لم يتم العثور على إعدادات Supabase في window.PX_CONFIG");
    return;
  }

  var pxClient = null;

  function loadSupabaseLib(cb) {
    if (window.supabase && window.supabase.createClient) {
      cb();
      return;
    }
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = cb;
    s.onerror = function () {
      console.error("[auth-widget] فشل تحميل مكتبة supabase-js");
    };
    document.head.appendChild(s);
  }

  /* ---------- 2) الأنماط (CSS) ---------- */
  function injectStyles() {
    if (document.getElementById("px-auth-styles")) return;
    var css = "" +
      "#px-auth-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);" +
      "backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:16px;}" +
      "#px-auth-overlay.open{display:flex;}" +
      ".px-card{width:100%;max-width:400px;max-height:90vh;overflow-y:auto;background:#1a1410;" +
      "border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;color:#f2ede6;" +
      "font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.5);}" +
      ".px-tabs{display:flex;gap:8px;margin-bottom:20px;}" +
      ".px-tab{flex:1;padding:10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);" +
      "background:transparent;color:#f2ede6;cursor:pointer;font-weight:600;font-size:14px;}" +
      ".px-tab.active{background:#e8b84b;color:#1a1410;border-color:#e8b84b;}" +
      ".px-field{margin-bottom:14px;}" +
      ".px-field label{display:block;font-size:13px;color:#c9c0b4;margin-bottom:6px;}" +
      ".px-field input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;" +
      "border:1px solid rgba(255,255,255,.15);background:#0f0c09;color:#fff;font-size:14px;}" +
      ".px-btn{width:100%;padding:12px;border-radius:10px;border:none;background:#e8b84b;" +
      "color:#1a1410;font-weight:700;font-size:15px;cursor:pointer;margin-top:6px;}" +
      ".px-btn:disabled{opacity:.6;cursor:not-allowed;}" +
      ".px-btn-secondary{background:transparent;border:1px solid rgba(255,255,255,.2);color:#f2ede6;}" +
      ".px-error{color:#ff8080;font-size:13px;margin:8px 0;min-height:16px;}" +
      ".px-msg{color:#8ee08e;font-size:13px;margin:8px 0;}" +
      ".px-close{position:absolute;top:16px;right:16px;background:none;border:none;color:#f2ede6;" +
      "font-size:20px;cursor:pointer;}" +
      ".px-card{position:relative;}" +
      ".px-avatar-row{display:flex;align-items:center;gap:14px;margin-bottom:18px;}" +
      ".px-avatar-preview{width:64px;height:64px;border-radius:50%;background:#8a2a2a;" +
      "display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;overflow:hidden;flex-shrink:0;}" +
      ".px-avatar-preview img{width:100%;height:100%;object-fit:cover;}" +
      "#px-status-badge{position:fixed;top:16px;right:16px;z-index:9998;background:#1a1410;" +
      "border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:8px 16px;color:#f2ede6;" +
      "font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,.35);}" +
      "#px-status-badge .px-mini-avatar{width:22px;height:22px;border-radius:50%;background:#8a2a2a;" +
      "display:flex;align-items:center;justify-content:center;font-size:11px;overflow:hidden;}" +
      "#px-status-badge .px-mini-avatar img{width:100%;height:100%;object-fit:cover;}" +
      "#px-dropdown{position:fixed;top:60px;right:16px;z-index:9998;background:#1a1410;" +
      "border:1px solid rgba(255,255,255,.15);border-radius:12px;overflow:hidden;display:none;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.4);min-width:160px;}" +
      "#px-dropdown.open{display:block;}" +
      "#px-dropdown button{display:block;width:100%;text-align:right;padding:12px 16px;background:none;" +
      "border:none;color:#f2ede6;font-size:14px;cursor:pointer;}" +
      "#px-dropdown button:hover{background:rgba(255,255,255,.08);}";
    var styleTag = document.createElement("style");
    styleTag.id = "px-auth-styles";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }

  /* ---------- 3) بناء نافذة تسجيل الدخول / إنشاء حساب ---------- */
  function buildAuthModal() {
    if (document.getElementById("px-auth-overlay")) return;
    var wrap = document.createElement("div");
    wrap.id = "px-auth-overlay";
    wrap.innerHTML =
      '<div class="px-card">' +
        '<button class="px-close" id="px-auth-close">&times;</button>' +
        '<div class="px-tabs">' +
          '<button class="px-tab active" data-tab="login">تسجيل الدخول</button>' +
          '<button class="px-tab" data-tab="signup">حساب جديد</button>' +
        '</div>' +
        '<div id="px-auth-signup-name" class="px-field" style="display:none;">' +
          '<label>الاسم الكامل</label>' +
          '<input type="text" id="px-input-name" placeholder="مثال: يوسف">' +
        '</div>' +
        '<div class="px-field">' +
          '<label>البريد الإلكتروني</label>' +
          '<input type="email" id="px-input-email" placeholder="you@example.com">' +
        '</div>' +
        '<div class="px-field">' +
          '<label>كلمة السر</label>' +
          '<input type="password" id="px-input-password" placeholder="••••••••">' +
        '</div>' +
        '<div class="px-error" id="px-auth-error"></div>' +
        '<button class="px-btn" id="px-auth-submit">تسجيل الدخول</button>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById("px-auth-close").onclick = closeAuthModal;
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeAuthModal();
    });

    var tabs = wrap.querySelectorAll(".px-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
        this.classList.add("active");
        var isSignup = this.getAttribute("data-tab") === "signup";
        document.getElementById("px-auth-signup-name").style.display = isSignup ? "block" : "none";
        document.getElementById("px-auth-submit").textContent = isSignup ? "إنشاء الحساب" : "تسجيل الدخول";
        document.getElementById("px-auth-error").textContent = "";
      };
    }

    document.getElementById("px-auth-submit").onclick = handleAuthSubmit;
  }

  function openAuthModal(tab) {
    buildAuthModal();
    var overlay = document.getElementById("px-auth-overlay");
    overlay.classList.add("open");
    document.getElementById("px-auth-error").textContent = "";
    var wantTab = tab === "signup" ? "signup" : "login";
    var tabs = overlay.querySelectorAll(".px-tab");
    for (var i = 0; i < tabs.length; i++) {
      var match = tabs[i].getAttribute("data-tab") === wantTab;
      tabs[i].classList.toggle("active", match);
    }
    document.getElementById("px-auth-signup-name").style.display = wantTab === "signup" ? "block" : "none";
    document.getElementById("px-auth-submit").textContent = wantTab === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
  }

  function closeAuthModal() {
    var overlay = document.getElementById("px-auth-overlay");
    if (overlay) overlay.classList.remove("open");
  }

  function handleAuthSubmit() {
    var overlay = document.getElementById("px-auth-overlay");
    var activeTab = overlay.querySelector(".px-tab.active").getAttribute("data-tab");
    var email = document.getElementById("px-input-email").value.trim();
    var password = document.getElementById("px-input-password").value;
    var errorEl = document.getElementById("px-auth-error");
    var submitBtn = document.getElementById("px-auth-submit");
    errorEl.textContent = "";

    if (!email || !password) {
      errorEl.textContent = "الرجاء إدخال البريد الإلكتروني وكلمة السر.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "جارٍ المعالجة...";

    if (activeTab === "signup") {
      var name = document.getElementById("px-input-name").value.trim();
      pxClient.auth.signUp({ email: email, password: password }).then(function (res) {
        if (res.error) {
          errorEl.textContent = translateError(res.error.message);
          resetSubmitBtn(true);
          return;
        }
        var user = res.data.user;
        if (user && name) {
          // ننتظر لحظة صغيرة باش الـ trigger يكمل إنشاء الصف، بعدها نحدث الاسم
          setTimeout(function () {
            pxClient.from("profiles").update({ display_name: name }).eq("id", user.id).then(function () {});
          }, 800);
        }
        errorEl.style.color = "#8ee08e";
        errorEl.textContent = "تم إنشاء الحساب! تحققي من بريدك الإلكتروني لتأكيده قبل تسجيل الدخول.";
        resetSubmitBtn(true);
      });
    } else {
      pxClient.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) {
          errorEl.textContent = translateError(res.error.message);
          resetSubmitBtn(false);
          return;
        }
        closeAuthModal();
        resetSubmitBtn(false);
      });
    }

    function resetSubmitBtn(isSignup) {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? "إنشاء الحساب" : "تسجيل الدخول";
    }
  }

  function translateError(msg) {
    if (!msg) return "حدث خطأ. حاولي مرة أخرى.";
    if (msg.indexOf("Invalid login credentials") !== -1) return "البريد الإلكتروني أو كلمة السر غير صحيحة.";
    if (msg.indexOf("already registered") !== -1 || msg.indexOf("already exists") !== -1) return "هذا البريد الإلكتروني مسجل بالفعل.";
    if (msg.indexOf("Password should be") !== -1) return "كلمة السر قصيرة جدًا (6 أحرف على الأقل).";
    if (msg.indexOf("Email not confirmed") !== -1) return "الرجاء تأكيد بريدك الإلكتروني أولاً (تحققي من صندوق الوارد).";
    return msg;
  }

  /* ---------- 4) نافذة البروفايل ---------- */
  function buildProfileModal() {
    if (document.getElementById("px-profile-overlay")) return;
    var wrap = document.createElement("div");
    wrap.id = "px-profile-overlay";
    wrap.className = "";
    wrap.setAttribute("style", "");
    wrap.id = "px-profile-overlay";
    wrap.innerHTML =
      '<div class="px-card">' +
        '<button class="px-close" id="px-profile-close">&times;</button>' +
        '<h3 style="margin:0 0 18px;">بروفايلي</h3>' +
        '<div class="px-avatar-row">' +
          '<div class="px-avatar-preview" id="px-profile-avatar-preview">👤</div>' +
          '<div>' +
            '<input type="file" id="px-profile-avatar-input" accept="image/*" style="display:none;">' +
            '<button class="px-btn px-btn-secondary" id="px-profile-avatar-btn" style="width:auto;padding:8px 14px;">تغيير الصورة</button>' +
          '</div>' +
        '</div>' +
        '<div class="px-field">' +
          '<label>الاسم الكامل</label>' +
          '<input type="text" id="px-profile-name-input" placeholder="اسمك">' +
        '</div>' +
        '<div class="px-error" id="px-profile-msg"></div>' +
        '<button class="px-btn" id="px-profile-save">حفظ التغييرات</button>' +
        '<button class="px-btn px-btn-secondary" id="px-profile-logout" style="margin-top:10px;">تسجيل الخروج</button>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.id = "px-profile-overlay";
    wrap.classList.add("px-overlay-base");
    wrap.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);" +
      "display:none;align-items:center;justify-content:center;padding:16px;"
    );

    document.getElementById("px-profile-close").onclick = closeProfileModal;
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeProfileModal();
    });
    document.getElementById("px-profile-avatar-btn").onclick = function () {
      document.getElementById("px-profile-avatar-input").click();
    };
    document.getElementById("px-profile-avatar-input").onchange = handleAvatarSelect;
    document.getElementById("px-profile-save").onclick = handleProfileSave;
    document.getElementById("px-profile-logout").onclick = function () {
      pxClient.auth.signOut().then(function () {
        closeProfileModal();
      });
    };
  }

  var pendingAvatarFile = null;

  function handleAvatarSelect(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      document.getElementById("px-profile-msg").textContent = "حجم الصورة كبير جدًا (الحد الأقصى 2MB).";
      return;
    }
    pendingAvatarFile = file;
    var reader = new FileReader();
    reader.onload = function (ev) {
      document.getElementById("px-profile-avatar-preview").innerHTML =
        '<img src="' + ev.target.result + '">';
    };
    reader.readAsDataURL(file);
  }

  function openProfileModal() {
    buildProfileModal();
    document.getElementById("px-profile-overlay").style.display = "flex";
    document.getElementById("px-profile-msg").textContent = "";
    pendingAvatarFile = null;

    pxClient.auth.getUser().then(function (res) {
      var user = res.data && res.data.user;
      if (!user) return;
      pxClient.from("profiles").select("display_name, avatar_url").eq("id", user.id).single().then(function (r) {
        if (r.data) {
          document.getElementById("px-profile-name-input").value = r.data.display_name || "";
          if (r.data.avatar_url) {
            document.getElementById("px-profile-avatar-preview").innerHTML =
              '<img src="' + r.data.avatar_url + '">';
          }
        }
      });
    });
  }

  function closeProfileModal() {
    var overlay = document.getElementById("px-profile-overlay");
    if (overlay) overlay.style.display = "none";
  }

  function handleProfileSave() {
    var msgEl = document.getElementById("px-profile-msg");
    var saveBtn = document.getElementById("px-profile-save");
    var newName = document.getElementById("px-profile-name-input").value.trim();
    msgEl.style.color = "#ff8080";
    msgEl.textContent = "";
    saveBtn.disabled = true;
    saveBtn.textContent = "جارٍ الحفظ...";

    pxClient.auth.getUser().then(function (res) {
      var user = res.data && res.data.user;
      if (!user) {
        saveBtn.disabled = false;
        saveBtn.textContent = "حفظ التغييرات";
        return;
      }

      function finishUpdate(avatarUrl) {
        var updates = { display_name: newName };
        if (avatarUrl) updates.avatar_url = avatarUrl;
        pxClient.from("profiles").update(updates).eq("id", user.id).then(function (r2) {
          saveBtn.disabled = false;
          saveBtn.textContent = "حفظ التغييرات";
          if (r2.error) {
            msgEl.textContent = "حدث خطأ أثناء الحفظ.";
          } else {
            msgEl.style.color = "#8ee08e";
            msgEl.textContent = "تم الحفظ بنجاح!";
            updateStatusBadge();
          }
        });
      }

      if (pendingAvatarFile) {
        var ext = pendingAvatarFile.name.split(".").pop();
        var path = user.id + "/avatar." + ext;
        pxClient.storage.from("avatars").upload(path, pendingAvatarFile, { upsert: true }).then(function (up) {
          if (up.error) {
            msgEl.textContent = "فشل رفع الصورة.";
            saveBtn.disabled = false;
            saveBtn.textContent = "حفظ التغييرات";
            return;
          }
          var pub = pxClient.storage.from("avatars").getPublicUrl(path);
          finishUpdate(pub.data.publicUrl + "?t=" + Date.now());
        });
      } else {
        finishUpdate(null);
      }
    });
  }

  /* ---------- 5) الشارة العائمة لحالة تسجيل الدخول ---------- */
  function buildStatusBadge() {
    if (document.getElementById("px-status-badge")) return;
    var badge = document.createElement("div");
    badge.id = "px-status-badge";
    badge.innerHTML = '<span class="px-mini-avatar">👤</span><span id="px-status-text">تسجيل الدخول</span>';
    document.body.appendChild(badge);

    var dropdown = document.createElement("div");
    dropdown.id = "px-dropdown";
    dropdown.innerHTML =
      '<button id="px-dd-profile">بروفايلي</button>' +
      '<button id="px-dd-logout">تسجيل الخروج</button>';
    document.body.appendChild(dropdown);

    badge.onclick = function () {
      pxClient.auth.getSession().then(function (res) {
        var loggedIn = !!(res.data && res.data.session);
        if (loggedIn) {
          dropdown.classList.toggle("open");
        } else {
          openAuthModal("login");
        }
      });
    };

    document.getElementById("px-dd-profile").onclick = function () {
      dropdown.classList.remove("open");
      openProfileModal();
    };
    document.getElementById("px-dd-logout").onclick = function () {
      dropdown.classList.remove("open");
      pxClient.auth.signOut();
    };

    document.addEventListener("click", function (e) {
      if (!badge.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
      }
    });
  }

  function updateStatusBadge() {
    pxClient.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      var textEl = document.getElementById("px-status-text");
      var avatarEl = document.querySelector("#px-status-badge .px-mini-avatar");
      if (!textEl) return;

      if (!session) {
        textEl.textContent = "تسجيل الدخول";
        avatarEl.innerHTML = "👤";
        return;
      }

      pxClient.from("profiles").select("display_name, avatar_url").eq("id", session.user.id).single().then(function (r) {
        var name = (r.data && r.data.display_name) || session.user.email.split("@")[0];
        textEl.textContent = name;
        if (r.data && r.data.avatar_url) {
          avatarEl.innerHTML = '<img src="' + r.data.avatar_url + '">';
        } else {
          avatarEl.innerHTML = "👤";
        }
      });
    });
  }

  /* ---------- 6) اعتراض أزرار "Log in" / "Sign up" الأصلية في الموقع ---------- */
  function interceptOriginalButtons() {
    document.addEventListener(
      "click",
      function (e) {
        var target = e.target;
        if (target.closest("#px-auth-overlay") || target.closest("#px-profile-overlay") ||
            target.closest("#px-status-badge") || target.closest("#px-dropdown")) {
          return;
        }
        var el = target;
        var depth = 0;
        while (el && depth < 4) {
          var txt = (el.textContent || "").trim();
          if (txt === "Log in" || txt === "Log In" || txt === "تسجيل الدخول") {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal("login");
            return;
          }
          if (txt === "Sign up" || txt === "Sign Up" || txt === "إنشاء حساب") {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal("signup");
            return;
          }
          el = el.parentElement;
          depth++;
        }
      },
      true
    );
  }

  /* ---------- 7) التشغيل ---------- */
  function init() {
    pxClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    injectStyles();
    buildStatusBadge();
    interceptOriginalButtons();
    updateStatusBadge();

    pxClient.auth.onAuthStateChange(function () {
      updateStatusBadge();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadSupabaseLib(init);
    });
  } else {
    loadSupabaseLib(init);
  }
})();
