// auth-widget.js — نسخة "الجسر" (Bridge)
// لا يضيف أي عنصر مرئي جديد للصفحة، فقط يتنصت على فورم React الأصلي
// ويربطه بـ Supabase الحقيقي عبر window.pxSupabase

(function () {
  let capturedEmail = '';
  let capturedPassword = '';
  let capturedName = '';

  // 1) التقاط قيم الحقول أثناء الكتابة
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;

    if (t.type === 'email') {
      capturedEmail = t.value;
    } else if (t.type === 'password') {
      capturedPassword = t.value;
    } else if (t.placeholder && t.placeholder.includes('Sarah Ahmed')) {
      capturedName = t.value;
    }
  }, true);

  // 2) اعتراض الضغط على الأزرار المستهدفة فقط
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const text = (btn.textContent || '').trim();
    const classes = btn.className || '';

    // زر "Log in" داخل الفورم فقط (يحتوي w-full في صنفه)
    if (text === 'Log in' && classes.includes('w-full')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleLogin(btn);
      return;
    }

    // زر تأكيد إنشاء الحساب النهائي
    const lower = text.toLowerCase();
    if (lower.includes('confirm') && lower.includes('create account')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleSignup(btn);
      return;
    }
  }, true);

  // 3) عرض رسالة صغيرة تحت الزر
  function showMessage(btn, message, isError) {
    const old = btn.nextElementSibling;
    if (old && old.dataset && old.dataset.pxAuthMsg === 'true') {
      old.remove();
    }
    const div = document.createElement('div');
    div.dataset.pxAuthMsg = 'true';
    div.textContent = message;
    div.style.cssText =
      'margin-top:8px;font-size:13px;text-align:center;color:' +
      (isError ? '#dc2626' : '#16a34a') + ';';
    btn.insertAdjacentElement('afterend', div);
  }

  // 4) تسجيل الدخول
  async function handleLogin(btn) {
    if (!capturedEmail || !capturedPassword) {
      showMessage(btn, 'يرجى إدخال البريد الإلكتروني وكلمة السر.', true);
      return;
    }
    showMessage(btn, 'جارٍ تسجيل الدخول...', false);

    const { error } = await window.pxSupabase.auth.signInWithPassword({
      email: capturedEmail,
      password: capturedPassword,
    });

    if (error) {
      showMessage(btn, translateError(error.message), true);
      return;
    }

    showMessage(btn, 'تم تسجيل الدخول بنجاح! جارٍ إعادة تحميل الصفحة...', false);
    setTimeout(function () {
      window.location.reload();
    }, 1200);
  }

  // 5) إنشاء حساب جديد
  async function handleSignup(btn) {
    if (!capturedEmail || !capturedPassword) {
      showMessage(btn, 'يرجى إكمال البيانات المطلوبة.', true);
      return;
    }
    showMessage(btn, 'جارٍ إنشاء الحساب...', false);

    const { data, error } = await window.pxSupabase.auth.signUp({
      email: capturedEmail,
      password: capturedPassword,
    });

    if (error) {
      showMessage(btn, translateError(error.message), true);
      return;
    }

    const userId = data && data.user ? data.user.id : null;
    if (userId && capturedName) {
      setTimeout(async function () {
        await window.pxSupabase
          .from('profiles')
          .update({ display_name: capturedName })
          .eq('id', userId);
      }, 1500);
    }

    showMessage(
      btn,
      'تم إنشاء الحساب! يرجى تأكيد بريدك الإلكتروني من الرسالة المرسلة إليك، ثم تسجيل الدخول.',
      false
    );
  }

  // 6) ترجمة رسائل الخطأ الشائعة
  function translateError(msg) {
    const map = {
      'Invalid login credentials': 'البريد الإلكتروني أو كلمة السر غير صحيحة.',
      'User already registered': 'هذا البريد الإلكتروني مسجَّل مسبقًا.',
      'Email not confirmed': 'يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول.',
    };
    return map[msg] || msg;
  }
})();// auth-widget.js — نسخة "الجسر" (Bridge)
// لا يضيف أي عنصر مرئي جديد للصفحة، فقط يتنصت على فورم React الأصلي
// ويربطه بـ Supabase الحقيقي عبر window.pxSupabase

(function () {
  let capturedEmail = '';
  let capturedPassword = '';
  let capturedName = '';

  // 1) التقاط قيم الحقول أثناء الكتابة
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;

    if (t.type === 'email') {
      capturedEmail = t.value;
    } else if (t.type === 'password') {
      capturedPassword = t.value;
    } else if (t.placeholder && t.placeholder.includes('Sarah Ahmed')) {
      capturedName = t.value;
    }
  }, true);

  // 2) اعتراض الضغط على الأزرار المستهدفة فقط
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const text = (btn.textContent || '').trim();
    const classes = btn.className || '';

    // زر "Log in" داخل الفورم فقط (يحتوي w-full في صنفه)
    if (text === 'Log in' && classes.includes('w-full')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleLogin(btn);
      return;
    }

    // زر تأكيد إنشاء الحساب النهائي
    const lower = text.toLowerCase();
    if (lower.includes('confirm') && lower.includes('create account')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleSignup(btn);
      return;
    }
  }, true);

  // 3) عرض رسالة صغيرة تحت الزر
  function showMessage(btn, message, isError) {
    const old = btn.nextElementSibling;
    if (old && old.dataset && old.dataset.pxAuthMsg === 'true') {
      old.remove();
    }
    const div = document.createElement('div');
    div.dataset.pxAuthMsg = 'true';
    div.textContent = message;
    div.style.cssText =
      'margin-top:8px;font-size:13px;text-align:center;color:' +
      (isError ? '#dc2626' : '#16a34a') + ';';
    btn.insertAdjacentElement('afterend', div);
  }

  // 4) تسجيل الدخول
  async function handleLogin(btn) {
    if (!capturedEmail || !capturedPassword) {
      showMessage(btn, 'يرجى إدخال البريد الإلكتروني وكلمة السر.', true);
      return;
    }
    showMessage(btn, 'جارٍ تسجيل الدخول...', false);

    const { error } = await window.pxSupabase.auth.signInWithPassword({
      email: capturedEmail,
      password: capturedPassword,
    });

    if (error) {
      showMessage(btn, translateError(error.message), true);
      return;
    }

    showMessage(btn, 'تم تسجيل الدخول بنجاح! جارٍ إعادة تحميل الصفحة...', false);
    setTimeout(function () {
      window.location.reload();
    }, 1200);
  }

  // 5) إنشاء حساب جديد
  async function handleSignup(btn) {
    if (!capturedEmail || !capturedPassword) {
      showMessage(btn, 'يرجى إكمال البيانات المطلوبة.', true);
      return;
    }
    showMessage(btn, 'جارٍ إنشاء الحساب...', false);

    const { data, error } = await window.pxSupabase.auth.signUp({
      email: capturedEmail,
      password: capturedPassword,
    });

    if (error) {
      showMessage(btn, translateError(error.message), true);
      return;
    }

    const userId = data && data.user ? data.user.id : null;
    if (userId && capturedName) {
      setTimeout(async function () {
        await window.pxSupabase
          .from('profiles')
          .update({ display_name: capturedName })
          .eq('id', userId);
      }, 1500);
    }

    showMessage(
      btn,
      'تم إنشاء الحساب! يرجى تأكيد بريدك الإلكتروني من الرسالة المرسلة إليك، ثم تسجيل الدخول.',
      false
    );
  }

  // 6) ترجمة رسائل الخطأ الشائعة
  function translateError(msg) {
    const map = {
      'Invalid login credentials': 'البريد الإلكتروني أو كلمة السر غير صحيحة.',
      'User already registered': 'هذا البريد الإلكتروني مسجَّل مسبقًا.',
      'Email not confirmed': 'يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول.',
    };
    return map[msg] || msg;
  }
    // 7) مزامنة زر "Log in" في الشريط العلوي مع حالة الجلسة الحقيقية
  function findTopLoginButton() {
    const header = document.querySelector('header');
    if (!header) return null;
    const buttons = header.querySelectorAll('button');
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      if ((text === 'Log in' || text === 'Log out') && !b.className.includes('w-full')) {
        return b;
      }
    }
    return null;
  }

  let isLoggedIn = false;

  function applyButtonState(btn) {
    if (!btn) return;
    if (isLoggedIn) {
      btn.textContent = 'Log out';
    } else {
      btn.textContent = 'Log in';
    }
  }

  async function syncLoginButton() {
    const { data } = await window.pxSupabase.auth.getSession();
    isLoggedIn = !!(data && data.session);
    applyButtonState(findTopLoginButton());
  }

  // اعتراض الضغط على زر الشريط العلوي عندما تكون هناك جلسة نشطة فقط
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn !== findTopLoginButton()) return;
    if (!isLoggedIn) return; // اترك React يفتح النافذة كالمعتاد

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    await window.pxSupabase.auth.signOut();
    window.location.reload();
  }, true);

  // إعادة تطبيق حالة الزر إذا أعاد React رسمه
  const headerObserver = new MutationObserver(function () {
    applyButtonState(findTopLoginButton());
  });
  const headerEl = document.querySelector('header');
  if (headerEl) {
    headerObserver.observe(headerEl, { childList: true, subtree: true, characterData: true });
  }

  // تشغيل المزامنة عند تحميل الصفحة
  syncLoginButton();

  // إعادة المزامنة عند أي تغيّر في حالة تسجيل الدخول
  window.pxSupabase.auth.onAuthStateChange(function () {
    syncLoginButton();
  });
})();
