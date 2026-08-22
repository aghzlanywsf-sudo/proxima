// profile-widget.js — واجهة بسيطة لتعديل الاسم وصورة البروفايل
// يظهر زر "الملف الشخصي" فقط عند تسجيل الدخول، بجانب زر Log out مباشرة
// لا يعدّل app.js أو أي عنصر من React، فقط يضيف عنصرًا جديدًا ضمن نفس الشريط

(function () {
  let currentUserId = null;
  let profileBtn = null;

  function findAuthButton() {
    const header = document.querySelector('header');
    if (!header) return null;
    const buttons = header.querySelectorAll('button');
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      if (text === 'Log in' || text === 'Log out') return b;
    }
    return null;
  }

  function createProfileButton() {
    const btn = document.createElement('button');
    btn.textContent = 'الملف الشخصي';
    btn.style.cssText =
      'padding:8px 16px;border-radius:9999px;font-size:14px;font-weight:600;' +
      'background:transparent;color:var(--gold-soft, #e8c07d);' +
      'border:1px solid var(--gold-soft, #e8c07d);cursor:pointer;transition:filter .15s;';
    btn.addEventListener('mouseenter', function () { btn.style.filter = 'brightness(1.15)'; });
    btn.addEventListener('mouseleave', function () { btn.style.filter = 'none'; });
    btn.addEventListener('click', openProfileModal);
    return btn;
  }

  function ensureProfileButton(show) {
    const authBtn = findAuthButton();
    if (!authBtn || !authBtn.parentElement) return;

    if (show) {
      if (!profileBtn || !document.body.contains(profileBtn)) {
        profileBtn = createProfileButton();
        authBtn.parentElement.insertBefore(profileBtn, authBtn);
      }
    } else {
      if (profileBtn && profileBtn.parentElement) {
        profileBtn.parentElement.removeChild(profileBtn);
      }
      profileBtn = null;
    }
  }

  async function syncProfileButton() {
    const { data } = await window.pxSupabase.auth.getSession();
    const loggedIn = !!(data && data.session);
    currentUserId = loggedIn ? data.session.user.id : null;
    ensureProfileButton(loggedIn);
  }

  const observer = new MutationObserver(function () {
    if (currentUserId && (!profileBtn || !document.body.contains(profileBtn))) {
      ensureProfileButton(true);
    }
  });
  const headerEl = document.querySelector('header');
  if (headerEl) {
    observer.observe(headerEl, { childList: true, subtree: true });
  }

  syncProfileButton();
  window.pxSupabase.auth.onAuthStateChange(function () {
    syncProfileButton();
  });

  let modalOverlay = null;

  async function openProfileModal() {
    if (modalOverlay) return;
    if (!currentUserId) return;

    const { data: profile } = await window.pxSupabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    const currentName = (profile && profile.display_name) || '';
    const currentAvatar = (profile && profile.avatar_url) || '';

    modalOverlay = document.createElement('div');
    modalOverlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:16px;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#1a1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;' +
      'padding:28px;width:100%;max-width:380px;color:#fff;font-family:inherit;direction:rtl;';

    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;">تعديل الملف الشخصي</h3>' +
        '<button id="pxCloseProfileModal" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px;">' +
        '<img id="pxAvatarPreview" src="' + (currentAvatar || '') + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;background:#33293b;' + (currentAvatar ? '' : 'display:none;') + '" />' +
        '<div id="pxAvatarPlaceholder" style="width:80px;height:80px;border-radius:50%;border:2px dashed rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:12px;text-align:center;' + (currentAvatar ? 'display:none;' : '') + '">لا توجد صورة</div>' +
        '<label style="margin-top:10px;font-size:13px;color:var(--gold-soft,#e8c07d);cursor:pointer;">' +
          'اختيار صورة جديدة<input id="pxAvatarInput" type="file" accept="image/*" style="display:none;" />' +
        '</label>' +
      '</div>' +
      '<label style="font-size:13px;color:rgba(255,255,255,0.7);display:block;margin-bottom:6px;">الاسم الكامل</label>' +
      '<input id="pxNameInput" type="text" value="' + currentName.replace(/"/g, '&quot;') + '" ' +
        'style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);' +
        'background:#241b2c;color:#fff;font-size:14px;margin-bottom:16px;" />' +
      '<button id="pxSaveProfileBtn" style="width:100%;padding:11px;border-radius:9999px;border:none;' +
        'background:var(--gold-soft,#e8c07d);color:var(--stage,#1a1420);font-weight:700;font-size:14px;cursor:pointer;">' +
        'حفظ التغييرات</button>' +
      '<div id="pxProfileMsg" style="margin-top:10px;font-size:13px;text-align:center;"></div>';

    modalOverlay.appendChild(box);
    document.body.appendChild(modalOverlay);

    let newAvatarFile = null;

    document.getElementById('pxCloseProfileModal').addEventListener('click', closeProfileModal);
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) closeProfileModal();
    });

    document.getElementById('pxAvatarInput').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      newAvatarFile = file;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = document.getElementById('pxAvatarPreview');
        const placeholder = document.getElementById('pxAvatarPlaceholder');
        img.src = ev.target.result;
        img.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('pxSaveProfileBtn').addEventListener('click', async function () {
      const msgEl = document.getElementById('pxProfileMsg');
      const nameVal = document.getElementById('pxNameInput').value.trim();
      msgEl.style.color = '#16a34a';
      msgEl.textContent = 'جارٍ الحفظ...';

      let avatarUrl = currentAvatar;

      if (newAvatarFile) {
        if (newAvatarFile.size > 2 * 1024 * 1024) {
          msgEl.style.color = '#dc2626';
          msgEl.textContent = 'حجم الصورة أكبر من 2 ميغابايت المسموح بها.';
          return;
        }
        const ext = newAvatarFile.name.split('.').pop();
        const path = currentUserId + '/avatar.' + ext;

        const { error: uploadError } = await window.pxSupabase.storage
          .from('avatars')
          .upload(path, newAvatarFile, { upsert: true });

        if (uploadError) {
          msgEl.style.color = '#dc2626';
          msgEl.textContent = 'تعذّر رفع الصورة: ' + uploadError.message;
          return;
        }

        const { data: publicUrlData } = window.pxSupabase.storage
          .from('avatars')
          .getPublicUrl(path);
        avatarUrl = publicUrlData.publicUrl + '?t=' + Date.now();
      }

      const { error: updateError } = await window.pxSupabase
        .from('profiles')
        .update({ display_name: nameVal, avatar_url: avatarUrl })
        .eq('id', currentUserId);

      if (updateError) {
        msgEl.style.color = '#dc2626';
        msgEl.textContent = 'تعذّر حفظ البيانات: ' + updateError.message;
        return;
      }

      msgEl.style.color = '#16a34a';
      msgEl.textContent = 'تم الحفظ بنجاح!';
      setTimeout(closeProfileModal, 1200);
    });
  }

  function closeProfileModal() {
    if (modalOverlay && modalOverlay.parentElement) {
      modalOverlay.parentElement.removeChild(modalOverlay);
    }
    modalOverlay = null;
  }
})();
