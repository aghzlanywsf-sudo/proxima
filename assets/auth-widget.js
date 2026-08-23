// auth-widget.js — نسخة "الجسر" (Bridge)
// لا يضيف أي عنصر مرئي جديد للصفحة، فقط يتنصت على فورم React الأصلي
// ويربطه بـ Supabase الحقيقي عبر window.pxSupabase

(function () {
  let capturedEmail = '';
  let capturedPassword = '';
      let capturedName = '';
    let capturedAccountType = 'fan';

      function getSelectedAccountType() {
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        const text = (b.textContent || '').trim();
        if (text === 'Star account' && b.style && b.style.background) {
          return 'star';
        }
      }
      return 'fan';
    }

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

    
    // 1.5) التقاط اختيار نوع الحساب (Fan / Star) فور الضغط عليه في الخطوة الأولى
    if (text === 'Fan') {
      capturedAccountType = 'fan';
    } else if (text === 'Star account') {
      capturedAccountType = 'star';
    }      

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
      if (userId) {
        setTimeout(async function () {
          await window.pxSupabase
            .from('profiles')
            .update({
              display_name: capturedName || null,
              account_type: capturedAccountType,
            })
            .eq('id', userId);
        }, 1500);
      }

    showSignupCodeForm(btn, capturedEmail);
  }

  function showSignupCodeForm(btn, email) {
    const old = btn.nextElementSibling;
    if (old && old.dataset && old.dataset.pxAuthMsg === 'true') {
      old.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.dataset.pxAuthMsg = 'true';
           wrapper.style.cssText = 'display:block;width:100%;margin-top:12px;text-align:center;box-sizing:border-box;';
    wrapper.innerHTML =
      '<div style="font-size:13px;color:#16a34a;margin-bottom:8px;">' +
        'تم إنشاء الحساب! أدخل الرمز المرسَل إلى بريدك الإلكتروني:' +
      '</div>' +
                          '<input id="pxOtpInput" type="text" maxlength="8" inputmode="numeric" placeholder="--------" ' +
            'style="width:9ch;max-width:100%;box-sizing:content-box;text-align:center;letter-spacing:3px;font-size:15px;' +
        'padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);' +
        'background:#241b2c;color:#fff;" />' +
      '<div>' +
        '<button id="pxVerifyOtpBtn" style="margin-top:10px;padding:8px 20px;border-radius:9999px;' +
        'border:none;background:var(--gold-soft,#e8c07d);color:var(--stage,#1a1420);' +
        'font-weight:700;font-size:13px;cursor:pointer;">تأكيد الرمز</button>' +
      '</div>' +
      '<div id="pxOtpMsg" style="margin-top:8px;font-size:13px;"></div>';

    btn.insertAdjacentElement('afterend', wrapper);

    document.getElementById('pxVerifyOtpBtn').addEventListener('click', async function () {
      const otpMsg = document.getElementById('pxOtpMsg');
      const code = document.getElementById('pxOtpInput').value.trim();

      if (!code || code.length < 6) {
        otpMsg.style.color = '#dc2626';
        otpMsg.textContent = 'يرجى إدخال الرمز المكوَّن من 6 أرقام.';
        return;
      }

      otpMsg.style.color = '#16a34a';
      otpMsg.textContent = 'جارٍ التحقق...';

      const { error } = await window.pxSupabase.auth.verifyOtp({
        email: email,
        token: code,
        type: 'signup',
      });

      if (error) {
        otpMsg.style.color = '#dc2626';
        otpMsg.textContent = translateError(error.message);
        return;
      }

      otpMsg.style.color = '#16a34a';
      otpMsg.textContent = 'تم التأكيد بنجاح! جارٍ إعادة تحميل الصفحة...';
      setTimeout(function () {
        window.location.reload();
      }, 1200);
    });
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
        const desired = isLoggedIn ? 'Log out' : 'Log in';
        if (btn.textContent.trim() !== desired) {
          btn.textContent = desired;
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
