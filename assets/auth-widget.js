/* =====================================================================
   PROXIMA — Auth Bridge Widget
   لا يضيف أي عنصر واجهة جديد للصفحة (لا شارة، لا نافذة).
   يتنصت فقط على فورم "Log in / Sign up" الأصلي (React)، ويربطه
   حقيقةً بـ Supabase Auth. رسائل الخطأ/النجاح تظهر كسطر صغير تحت
   الزر نفسه، بدون تعديل تصميم النافذة الأصلية.
===================================================================== */
(function () {
  "use strict";

  var capturedEmail = "";
  var capturedPassword = "";
  var capturedName = "";

  function getClient() {
    return window.pxSupabase || null;
  }

  function setupInputCapture() {
    document.addEventListener(
      "input",
      function (e) {
        var t = e.target;
        if (!t || t.tagName !== "INPUT") return;
        if (t.type === "email") {
          capturedEmail = t.value;
        } else if (t.type === "password") {
          capturedPassword = t.value;
        } else if ((t.getAttribute("placeholder") || "").indexOf("Sarah") !== -1) {
          capturedName = t.value;
        }
      },
      true
    );
  }

  function findButtonAncestor(target) {
    var el = target;
    var depth = 0;
    while (el && depth < 6) {
      if (el.tagName === "BUTTON") return el;
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  function clearInlineMsg(button) {
    var next = button.nextElementSibling;
    if (next && next.getAttribute && next.getAttribute("data-px-msg")) {
      next.remove();
    }
  }

  function showInlineMsg(button, message, isSuccess) {
    clearInlineMsg(button);
    var div = document.createElement("div");
    div.setAttribute("data-px-msg", "1");
    div.style.cssText =
      "margin-top:8px;font-size:13px;text-align:center;line-height:1.4;color:" +
      (isSuccess ? "#8ee08e" : "#ff8f8f") + ";";
    div.textContent = message;
    button.insertAdjacentElement("afterend", div);
  }

  function setButtonBusy(button, busy, busyText) {
    if (busy) {
      if (!button.getAttribute("data-px-orig")) {
        button.setAttribute("data-px-orig", button.textContent);
      }
      button.textContent = busyText || "...";
      button.disabled = true;
      button.style.opacity = "0.7";
      button.style.pointerEvents = "none";
    } else {
      var orig = button.getAttribute("data-px-orig");
      if (orig) button.textContent = orig;
      button.disabled = false;
      button.style.opacity = "";
      button.style.pointerEvents = "";
    }
  }

  function translateError(msg) {
    if (!msg) return "حدث خطأ. حاولي مرة أخرى.";
    if (msg.indexOf("Invalid login credentials") !== -1) return "البريد الإلكتروني أو كلمة السر غير صحيحة.";
    if (msg.indexOf("already registered") !== -1 || msg.indexOf("already exists") !== -1) return "هذا البريد الإلكتروني مسجل بالفعل.";
    if (msg.indexOf("Password should be") !== -1) return "كلمة السر قصيرة جدًا (6 أحرف على الأقل).";
    if (msg.indexOf("Email not confirmed") !== -1) return "الرجاء تأكيد بريدك الإلكتروني أولاً (تحققي من صندوق الوارد).";
    if (msg.indexOf("Unable to validate email") !== -1) return "صيغة البريد الإلكتروني غير صحيحة.";
    return msg;
  }

  function handleLogin(e, button) {
    var client = getClient();
    if (!client) return;
    e.preventDefault();
    e.stopPropagation();

    if (!capturedEmail || !capturedPassword) {
      showInlineMsg(button, "الرجاء إدخال البريد الإلكتروني وكلمة السر.", false);
      return;
    }

    setButtonBusy(button, true, "جارٍ الدخول...");
    client.auth.signInWithPassword({ email: capturedEmail, password: capturedPassword }).then(function (res) {
      setButtonBusy(button, false);
      if (res.error) {
        showInlineMsg(button, translateError(res.error.message), false);
        return;
      }
      showInlineMsg(button, "تم تسجيل الدخول بنجاح! جارٍ التحديث...", true);
      setTimeout(function () {
        window.location.reload();
      }, 900);
    });
  }

  function handleSignup(e, button) {
    var client = getClient();
    if (!client) return;
    e.preventDefault();
    e.stopPropagation();

    if (!capturedEmail || !capturedPassword) {
      showInlineMsg(button, "تعذر العثور على البريد الإلكتروني أو كلمة السر، ارجعي وأعيدي الكتابة.", false);
      return;
    }

    setButtonBusy(button, true, "جارٍ الإنشاء...");
    client.auth.signUp({ email: capturedEmail, password: capturedPassword }).then(function (res) {
      setButtonBusy(button, false);
      if (res.error) {
        showInlineMsg(button, translateError(res.error.message), false);
        return;
      }
      var user = res.data && res.data.user;
      if (user && capturedName) {
        setTimeout(function () {
          client.from("profiles").update({ display_name: capturedName }).eq("id", user.id).then(function () {});
        }, 800);
      }
      showInlineMsg(button, "تم إنشاء الحساب! تحققي من بريدك لتأكيده، ثم سجّلي الدخول.", true);
    });
  }

  function setupClickInterceptor() {
    document.addEventListener(
      "click",
      function (e) {
        var button = findButtonAncestor(e.target);
        if (!button) return;
        var text = (button.textContent || "").trim();
        var cls = button.className || "";

        if (text === "Log in" && cls.indexOf("w-full") !== -1) {
          handleLogin(e, button);
          return;
        }

        if (text.indexOf("Confirm") !== -1 && text.indexOf("create account") !== -1) {
          handleSignup(e, button);
          return;
        }
      },
      true
    );
  }

  function init() {
    if (!getClient()) {
      setTimeout(init, 500);
      return;
    }
    setupInputCapture();
    setupClickInterceptor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();