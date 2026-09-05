var SPREADSHEET_API_URL = "https://script.google.com/macros/s/AKfycbwISME2C5UqmBGIH5uqRZPjh357sXmlM2fppxm3_rEss8qVoCRsZh5d6QdfTED13jpt/exec";
  var RAZORPAY_KEY_ID = "rzp_test_TYINZpDJ5bh2CP"; // <-- Replace with your live Razorpay Test Key ID

  var currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('mohna_user')) || null; } catch(e) {}
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem('mohna_cart')) || []; } catch(e) {}

  var userCoords = null;
  var resolvedAddressString = "Detecting nearest shop, mall & pin code...";
  var adminZonesData = null;
  var currentTheme = localStorage.getItem('mohna_theme') || 'retail';
  var activeCategory = 'all';

  var rawProducts = [], rawCategories = [], rawCoupons = [], rawReviews = [], myPublishedReviews = [], cachedMyOrders = [];
  var currentSelectedProduct = null;
  var currentMatchedZoneTiming = 20;
  var currentMatchedZoneName = "City Express Hub";
  var isDeliverableLocation = true;
  var appliedDiscountPercent = 0;
  var userWalletBalance = 0;
  var pendingAvatarBase64 = "";
  var activeSelectedModalOrder = null;

  var persistentTimerInterval = null, cardTickersInterval = null;
  var sessionCheckInterval = null;
  var autoSyncInterval = null;
  var trackingLeafletMap = null, riderMapMarker = null, userMapMarker = null;

  // CUSTOM MOHNA PROFESSIONAL POPUP MODAL SYSTEM
  function showMohnaPopup(options) {
    var container = document.getElementById('mohnaPopupContainer');
    if (!container) return;

    var type = options.type || 'info'; 
    var title = options.title || 'Notice';
    var message = options.message || '';
    var primaryText = options.primaryText || 'OK';
    var secondaryText = options.secondaryText || '';
    var onPrimary = options.onPrimary || null;
    var onSecondary = options.onSecondary || null;

    var iconSymbol = 'ℹ️';
    if (type === 'warn') iconSymbol = '⚠️';
    if (type === 'error') iconSymbol = '🚫';
    if (type === 'success') iconSymbol = '✅';

    container.innerHTML = `
      <div class="mohna-popup-overlay" id="mohnaOverlayEl">
        <div class="mohna-popup-card">
          <div class="mohna-popup-icon ${type}">${iconSymbol}</div>
          <div class="mohna-popup-title">${title}</div>
          <div class="mohna-popup-msg">${message}</div>
          <div class="mohna-popup-actions">
            ${secondaryText ? `<button class="mohna-popup-btn secondary" id="mohnaSecBtn">${secondaryText}</button>` : ''}
            <button class="mohna-popup-btn primary" id="mohnaPriBtn">${primaryText}</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mohnaPriBtn').onclick = function() {
      document.getElementById('mohnaOverlayEl').remove();
      if (onPrimary) onPrimary();
    };

    if (secondaryText) {
      document.getElementById('mohnaSecBtn').onclick = function() {
        document.getElementById('mohnaOverlayEl').remove();
        if (onSecondary) onSecondary();
      };
    }
  }

  function formatTimeHms(totalSecs) {
    if (totalSecs < 0) totalSecs = 0;
    var h = Math.floor(totalSecs / 3600);
    var m = Math.floor((totalSecs % 3600) / 60);
    var s = totalSecs % 60;
    if (h > 0) {
      return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    }
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  function parseAnyDateToMs(dateInput) {
    if (!dateInput) return 0;
    if (typeof dateInput === "number") return dateInput;
    var s = dateInput.toString().trim();
    
    var num = Number(s);
    if (!isNaN(num) && num > 1000000000000) return num;

    var directMs = new Date(s).getTime();
    if (!isNaN(directMs) && directMs > 1000000000000) return directMs;

    var match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
      var day = parseInt(match[1], 10);
      var month = parseInt(match[2], 10) - 1;
      var year = parseInt(match[3], 10);
      var hours = match[4] ? parseInt(match[4], 10) : 0;
      var mins = match[5] ? parseInt(match[5], 10) : 0;
      var secs = match[6] ? parseInt(match[6], 10) : 0;
      return new Date(year, month, day, hours, mins, secs).getTime();
    }
    return 0;
  }

  function formatIndianDate(dateInput) {
    var ms = parseAnyDateToMs(dateInput);
    if (!ms || ms === 0) return dateInput || "N/A";
    return new Date(ms).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2);
  }

  function isPointInsidePolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      var xi = vs[i][0], yi = vs[i][1];
      var xj = vs[j][0], yj = vs[j][1];
      var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function reverseGeocodeCoordinates(lat, lng, callback) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.address) {
        var addr = data.address;
        var poi = addr.shop || addr.mall || addr.amenity || addr.building || addr.commercial || addr.leisure || "";
        var road = addr.road || addr.suburb || addr.neighbourhood || addr.residential || "";
        var suburb = addr.city_district || addr.suburb || addr.town || addr.village || "";
        var city = addr.city || addr.town || addr.county || "";
        var state = addr.state || "";
        var postcode = addr.postcode || "";

        var parts = [];
        if (poi) parts.push("Near " + poi);
        if (road) parts.push(road);
        if (suburb && suburb !== road) parts.push(suburb);
        if (city) parts.push(city);
        if (postcode) parts.push("Pin: " + postcode);
        if (state) parts.push(state);

        resolvedAddressString = parts.length > 0 ? parts.join(", ") : (data.display_name || `Lat: ${lat}, Lng: ${lng}`);
      } else {
        resolvedAddressString = `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      }
      if (callback) callback(resolvedAddressString);
    })
    .catch(() => {
      resolvedAddressString = `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      if (callback) callback(resolvedAddressString);
    });
  }

  function evaluateDeliveryZoneEligibility(showAlert) {
    var noticeBox = document.getElementById('zoneCoverageNotice');
    var noticeText = document.getElementById('zoneNoticeText');
    var payBtn = document.getElementById('confirmPayBtn');

    if (!userCoords) {
      isDeliverableLocation = false;
      if (noticeBox) {
        noticeBox.className = "coverage-banner coverage-undeliverable";
        noticeText.innerHTML = "⚠️ <b>GPS Location Required:</b> Please grant GPS permissions to verify delivery service in your area.";
      }
      if (payBtn) payBtn.disabled = true;
      return false;
    }

    if (!adminZonesData || !adminZonesData.features || adminZonesData.features.length === 0) {
      isDeliverableLocation = true;
      currentMatchedZoneTiming = 20;
      currentMatchedZoneName = "Mohna Standard Hub";
      if (noticeBox) {
        noticeBox.className = "coverage-banner coverage-deliverable";
        noticeText.innerHTML = `✅ <b>Deliverable Area:</b> All zones open • Guaranteed arrival in <b>${currentMatchedZoneTiming} Mins</b>`;
      }
      if (payBtn && cart.length > 0) payBtn.disabled = false;
      return true;
    }

    var matchedFeature = null;
    for (var f = 0; f < adminZonesData.features.length; f++) {
      var feature = adminZonesData.features[f];
      if (feature.geometry && feature.geometry.type === "Polygon") {
        var ring = feature.geometry.coordinates[0];
        if (isPointInsidePolygon([userCoords.lng, userCoords.lat], ring)) {
          matchedFeature = feature;
          break;
        }
      }
    }

    if (matchedFeature) {
      isDeliverableLocation = true;
      var props = matchedFeature.properties || {};
      currentMatchedZoneName = props.name || "Identified Hub";
      currentMatchedZoneTiming = parseInt(props.deliveryMinutes) || 20;

      if (noticeBox) {
        noticeBox.className = "coverage-banner coverage-deliverable";
        noticeText.innerHTML = `✅ <b>Deliverable Area:</b> ${currentMatchedZoneName} • Guaranteed <b>${currentMatchedZoneTiming} Mins ETA</b> (₹${props.lateCashback || 25} Late Cashback Guarantee)`;
      }
      if (payBtn && cart.length > 0) payBtn.disabled = false;
      if (showAlert) {
        showMohnaPopup({
          type: 'success',
          title: 'Delivery Zone Verified',
          message: `Your location is inside "${currentMatchedZoneName}". Guaranteed delivery in ${currentMatchedZoneTiming} minutes!`,
          primaryText: 'Continue'
        });
      }
      return true;
    } else {
      isDeliverableLocation = false;
      if (noticeBox) {
        noticeBox.className = "coverage-banner coverage-undeliverable";
        noticeText.innerHTML = `🚫 <b>Undeliverable Area:</b> Your current GPS location is outside Mohna Express coverage zones. Orders cannot be placed.`;
      }
      if (payBtn) payBtn.disabled = true;
      if (showAlert) {
        showMohnaPopup({
          type: 'error',
          title: 'Undeliverable Area',
          message: 'Your current GPS location is outside our operational service areas. Orders cannot be placed.',
          primaryText: 'Understand'
        });
      }
      return false;
    }
  }

  function compressImageFile(file, maxWidth, maxHeight, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement("canvas");
        var width = img.width;
        var height = img.height;

        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }

        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function calculateDeliveryStatusBadge(orderTimestampInput, etaMinutes, expiryTimestamp, deliveredTimestampInput) {
    var startMs = parseAnyDateToMs(orderTimestampInput);
    var endMs = parseAnyDateToMs(deliveredTimestampInput) || Date.now();
    var expMs = Number(expiryTimestamp) || (startMs + (etaMinutes * 60000));

    var totalElapsedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    var timeFormatted = formatTimeHms(totalElapsedSec);

    if (endMs <= expMs) {
      return `<span class="badge-ontime">✔ Delivered in ${timeFormatted} (On Time)</span>`;
    } else {
      var lateSec = Math.floor((endMs - expMs) / 1000);
      return `<span class="badge-late">⚠️ Delivered in ${timeFormatted} (${formatTimeHms(lateSec)} Late)</span>`;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    updateHeaderAuthUI();
    updateCartUI();
    loadFromLocalCache();
    fetchInitialStoreData();
    requestUserGPS(() => evaluateDeliveryZoneEligibility(false));
    startSingleSessionGuard();
    applyThemeBodyClass(currentTheme);

    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(function() {
      fetchInitialStoreData(false);
    }, 5000);
  });

  function applyThemeBodyClass(theme) {
    document.body.className = (theme === 'wholesale') ? 'theme-wholesale' : 'theme-retail';
    var bRetail = document.getElementById('btnRetail');
    var bWholesale = document.getElementById('btnWholesale');
    if (bRetail && bWholesale) {
      bRetail.classList.toggle('active', theme === 'retail');
      bWholesale.classList.toggle('active', theme === 'wholesale');
    }
  }

  function loadFromLocalCache() {
    try {
      var cached = JSON.parse(localStorage.getItem('mohna_store_cache') || '{}');
      if (cached.products && cached.products.length > 0) {
        rawProducts = cached.products;
        rawCategories = cached.categories || [];
        rawCoupons = cached.coupons || [];
        rawReviews = cached.reviews || [];
        adminZonesData = cached.zone || null;
        renderCategoryChips();
        renderProducts();
        evaluateDeliveryZoneEligibility(false);
      }
    } catch(e) {}
  }

  function startSingleSessionGuard() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(function() {
      if (currentUser && currentUser.email && currentUser.sessionToken) {
        fetch(`${SPREADSHEET_API_URL}?action=validateSession&email=${encodeURIComponent(currentUser.email)}&sessionToken=${encodeURIComponent(currentUser.sessionToken)}&type=customer`)
          .then(r => r.json())
          .then(res => {
            if (res && res.valid === false) {
              showMohnaPopup({
                type: 'warn',
                title: 'Session Conflict Detected',
                message: 'Your account was just accessed on another device. For security reasons, you have been securely logged out.',
                primaryText: 'Log In Again',
                onPrimary: function() {
                  logoutCustomer(false);
                }
              });
            }
          }).catch(()=>{});
      }
    }, 20000);
  }

  function requestUserGPS(callback) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          
          reverseGeocodeCoordinates(userCoords.lat, userCoords.lng, function(resolvedAddr) {
            var addrField = document.getElementById('orderAddress');
            if (addrField && !addrField.value) {
              addrField.value = resolvedAddr;
            }
          });

          var s1 = document.getElementById('loginGpsStatus');
          var s2 = document.getElementById('signupGpsStatus');
          if (s1) s1.innerText = `✅ GPS Locked (${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)})`;
          if (s2) s2.innerText = `✅ Registered Location Locked (${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)})`;
          evaluateDeliveryZoneEligibility(false);
          if (callback) callback();
        },
        function() {
          if (callback) callback();
        }
      );
    }
  }

  function fetchInitialStoreData(isUserAction) {
    var userEmailParam = currentUser && currentUser.email ? `&userEmail=${encodeURIComponent(currentUser.email)}` : "";
    fetch(`${SPREADSHEET_API_URL}?action=getInitStoreData${userEmailParam}`)
      .then(r => r.json())
      .then(data => {
        rawProducts = data.products || [];
        rawCategories = data.categories || [];
        rawCoupons = data.coupons || [];
        rawReviews = data.reviews || [];
        myPublishedReviews = data.myReviews || [];
        adminZonesData = data.zone || null;
        userWalletBalance = data.walletBalance || 0;
        
        if (data.myOrders) {
          cachedMyOrders = data.myOrders;
          renderCustomerOrdersList();
          checkAndResumeActiveOrderTimer();
          updateNotificationsFeed();
        }

        localStorage.setItem('mohna_store_cache', JSON.stringify({
          products: rawProducts,
          categories: rawCategories,
          coupons: rawCoupons,
          reviews: rawReviews,
          zone: adminZonesData
        }));

        renderCategoryChips();
        renderProducts();
        evaluateDeliveryZoneEligibility(false);
        if (document.getElementById('profilePage') && currentUser) renderProfilePage();
      });
  }

  function updateHeaderAuthUI() {
    var container = document.getElementById('authHeaderContainer');
    if (!container) return;
    if (currentUser && currentUser.name) {
      var avatarSrc = currentUser.avatar || "https://via.placeholder.com/24?text=U";
      container.innerHTML = `
        <a href="profile.html" class="auth-pill auth-logged-in">
          <img src="${avatarSrc}" class="header-avatar" /> Hi, ${currentUser.name.split(' ')[0]}
        </a>
      `;
    } else {
      container.innerHTML = `
        <a href="auth.html" class="auth-pill auth-logged-out">
          🔑 Sign In
        </a>
      `;
    }
  }

  function updateNotificationsFeed() {
    var notifBadge = document.getElementById('notifBadge');
    var notifList = document.getElementById('notificationsList');
    if (!cachedMyOrders || cachedMyOrders.length === 0) {
      if (notifBadge) notifBadge.style.display = 'none';
      if (notifList) notifList.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">No new dispatch notifications.</p>';
      return;
    }

    var activeDispatches = cachedMyOrders.filter(o => o.status && (o.status.includes('OUT') || o.status.includes('Out') || o.status.includes('Delivered') || o.status.includes('PACKED')));
    if (activeDispatches.length > 0) {
      if (notifBadge) {
        notifBadge.style.display = 'inline-block';
        notifBadge.innerText = activeDispatches.length;
      }
      if (notifList) {
        notifList.innerHTML = activeDispatches.map(o => {
          var isOut = o.status.includes('OUT') || o.status.includes('Out');
          var isPacked = o.status.includes('PACKED');
          var icon = isOut ? "🛵" : (isPacked ? "📦" : "✅");
          var headline = isOut ? "Order Out for Delivery" : (isPacked ? "Order Packed at Warehouse" : "Order Successfully Delivered");
          var detail = isOut 
            ? `Rider <b>${o.riderName || 'Partner'}</b> is on the way. (📞 ${o.riderPhone || 'In transit'})`
            : (isPacked ? `Warehouse packing complete. Ready for rider pickup.` : `Order <b>${o.orderId}</b> was delivered. Thank you!`);

          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px; font-size:12.5px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <b style="color:#0f172a;">${icon} ${headline}</b>
                <span style="font-size:11px; color:#64748b;">${o.orderId}</span>
              </div>
              <div style="color:#475569;">${detail}</div>
            </div>
          `;
        }).join('');
      }
    } else {
      if (notifBadge) notifBadge.style.display = 'none';
      if (notifList) notifList.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">No new dispatch notifications.</p>';
    }
  }

  function openNotificationsModal() {
    var modal = document.getElementById('notificationsModal');
    if (modal) modal.style.display = 'flex';
  }
  function closeNotificationsModal() {
    var modal = document.getElementById('notificationsModal');
    if (modal) modal.style.display = 'none';
  }

  function updateCartUI() {
    var totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    var badge = document.getElementById('cartBadgeCount');
    if (badge) {
      if (totalCount > 0) {
        badge.style.display = 'block';
        badge.innerText = totalCount;
      } else {
        badge.style.display = 'none';
      }
    }
    localStorage.setItem('mohna_cart', JSON.stringify(cart));
    if (document.getElementById('productGrid')) renderProducts();
  }

  function toggleAuthTab(tab) {
    var btnLogin = document.getElementById('btnTabLogin');
    var btnSignup = document.getElementById('btnTabSignup');
    if (btnLogin) btnLogin.classList.toggle('active', tab === 'login');
    if (btnSignup) btnSignup.classList.toggle('active', tab === 'signup');
    var lView = document.getElementById('loginView');
    var s1View = document.getElementById('signupStep1');
    var s2View = document.getElementById('signupStep2');
    if (lView) lView.style.display = (tab === 'login') ? 'block' : 'none';
    if (s1View) s1View.style.display = (tab === 'signup') ? 'block' : 'none';
    if (s2View) s2View.style.display = 'none';
  }

  function toggleSignupStep(step) {
    var s1View = document.getElementById('signupStep1');
    var s2View = document.getElementById('signupStep2');
    if (s1View) s1View.style.display = (step === 1) ? 'block' : 'none';
    if (s2View) s2View.style.display = (step === 2) ? 'block' : 'none';
  }

  function requestSignupOtp() {
    var name = document.getElementById('signupName').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value.trim();

    if (!name || !email || !password) {
      showMohnaPopup({ type: 'warn', title: 'Missing Fields', message: 'Please fill all required fields.', primaryText: 'OK' });
      return;
    }
    if (password.length < 6) {
      showMohnaPopup({ type: 'warn', title: 'Weak Password', message: 'Password must be at least 6 characters.', primaryText: 'OK' });
      return;
    }

    var btn = document.getElementById('btnRequestSignupOtp');
    btn.classList.add('loading-state');
    var origText = btn.innerText;
    btn.innerText = "⏳ Sending OTP...";
    btn.disabled = true;

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "sendSignupOtp", email: email, role: "customer" })
    }).then(r => r.json()).then(res => {
      btn.classList.remove('loading-state');
      btn.innerText = origText;
      btn.disabled = false;
      if (res.status === "success") {
        document.getElementById('signupTargetEmail').innerText = email;
        toggleSignupStep(2);
      } else {
        showMohnaPopup({ type: 'error', title: 'Verification Failed', message: res.message, primaryText: 'Retry' });
      }
    });
  }

  function verifyAndCompleteSignup() {
    var name = document.getElementById('signupName').value.trim();
    var phone = document.getElementById('signupPhone').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value.trim();
    var otp = document.getElementById('signupOtpCode').value.trim();

    if (!otp || otp.length < 6) {
      showMohnaPopup({ type: 'warn', title: 'Invalid OTP', message: 'Please enter a valid 6-digit verification code.', primaryText: 'OK' });
      return;
    }

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "completeSignup",
        name: name, phone: phone, email: email, password: password, otp: otp,
        lat: userCoords ? userCoords.lat.toFixed(5) : "",
        lng: userCoords ? userCoords.lng.toFixed(5) : ""
      })
    }).then(r => r.json()).then(res => {
      if (res.status === "success") {
        currentUser = res.user;
        localStorage.setItem('mohna_user', JSON.stringify(currentUser));
        updateHeaderAuthUI();
        startSingleSessionGuard();
        window.location.href = 'index.html';
      } else {
        showMohnaPopup({ type: 'error', title: 'Signup Error', message: res.message, primaryText: 'OK' });
      }
    });
  }

  function processUserPasswordLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value.trim();

    if (!email || !password) {
      showMohnaPopup({ type: 'warn', title: 'Missing Credentials', message: 'Please enter both email and password.', primaryText: 'OK' });
      return;
    }

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "userPasswordLogin",
        email: email, password: password,
        lat: userCoords ? userCoords.lat.toFixed(5) : "",
        lng: userCoords ? userCoords.lng.toFixed(5) : ""
      })
    }).then(r => r.json()).then(res => {
      if (res.status === "success") {
        currentUser = res.user;
        localStorage.setItem('mohna_user', JSON.stringify(currentUser));
        updateHeaderAuthUI();
        startSingleSessionGuard();
        window.location.href = 'index.html';
      } else {
        showMohnaPopup({ type: 'error', title: 'Login Failed', message: res.message, primaryText: 'Try Again' });
      }
    });
  }

  function handleAvatarFileSelected(e) {
    var file = e.target.files[0];
    if (!file) return;

    compressImageFile(file, 400, 400, function(compressedBase64) {
      pendingAvatarBase64 = compressedBase64;
      var preview = document.getElementById('profAvatarDisplay');
      if (preview) preview.src = compressedBase64;
      var saveBtn = document.getElementById('btnSaveAvatar');
      if (saveBtn) saveBtn.style.display = 'inline-block';
    });
  }

  function saveSelectedAvatar() {
    if (!currentUser || !pendingAvatarBase64) return;
    var btn = document.getElementById('btnSaveAvatar');
    btn.classList.add('loading-state');
    var origText = btn.innerText;
    btn.innerText = "⏳ Saving...";
    btn.disabled = true;

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "updateUserProfilePic", email: currentUser.email, imageBase64: pendingAvatarBase64 })
    }).then(r => r.json()).then(res => {
      btn.classList.remove('loading-state');
      btn.innerText = origText;
      btn.disabled = false;
      btn.style.display = "none";
      if (res.status === "success") {
        currentUser.avatar = res.avatarUrl;
        localStorage.setItem('mohna_user', JSON.stringify(currentUser));
        updateHeaderAuthUI();
        showMohnaPopup({ type: 'success', title: 'Profile Updated', message: 'Profile picture uploaded and saved successfully!', primaryText: 'Great' });
      }
    });
  }

  function deleteAvatarPhoto() {
    if (!currentUser) return;
    showMohnaPopup({
      type: 'warn',
      title: 'Delete Photo',
      message: 'Are you sure you want to remove your profile picture?',
      primaryText: 'Yes, Delete',
      secondaryText: 'Cancel',
      onPrimary: function() {
        fetch(SPREADSHEET_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "updateUserProfilePic", email: currentUser.email, imageBase64: "" })
        }).then(r => r.json()).then(res => {
          if (res.status === "success") {
            currentUser.avatar = "";
            pendingAvatarBase64 = "";
            localStorage.setItem('mohna_user', JSON.stringify(currentUser));
            var prev = document.getElementById('profAvatarDisplay');
            if (prev) prev.src = "https://via.placeholder.com/96?text=User";
            var saveBtn = document.getElementById('btnSaveAvatar');
            if (saveBtn) saveBtn.style.display = "none";
            updateHeaderAuthUI();
          }
        });
      }
    });
  }

  function logoutCustomer(promptUser) {
    if (promptUser === false) {
      localStorage.removeItem('mohna_user');
      currentUser = null;
      window.location.href = 'index.html';
      return;
    }

    showMohnaPopup({
      type: 'warn',
      title: 'Log Out',
      message: 'Are you sure you want to log out from this device?',
      primaryText: 'Log Out',
      secondaryText: 'Stay',
      onPrimary: function() {
        localStorage.removeItem('mohna_user');
        currentUser = null;
        window.location.href = 'index.html';
      }
    });
  }

  function renderCategoryChips() {
    var chipContainer = document.getElementById('categoryChips');
    if (!chipContainer) return;
    var scopedCategories = rawCategories.filter(c => c.scope === currentTheme || c.scope === 'both');
    chipContainer.innerHTML = '<div class="chip active" onclick="filterCategory(\'all\', this)">All Items</div>' + 
      scopedCategories.map(c => `<div class="chip" onclick="filterCategory('${c.slug}', this)">${c.name}</div>`).join('');
  }

  function switchTheme(theme) {
    currentTheme = theme;
    activeCategory = 'all';
    localStorage.setItem('mohna_theme', theme);
    applyThemeBodyClass(theme);
    renderCategoryChips();
    renderProducts();
  }

  function filterCategory(cat, chipEl) {
    activeCategory = cat;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');
    renderProducts();
  }

  function handleSearch(q) {
    renderProducts(q.trim().toLowerCase());
  }

  function isProductInCart(productId) {
    return cart.some(x => x.id === productId && x.theme === currentTheme);
  }

  function renderProducts(searchQuery = "") {
    var grid = document.getElementById('productGrid');
    if (!grid) return;
    var validSlugs = rawCategories.filter(c => c.scope === currentTheme || c.scope === 'both').map(c => c.slug);
    var filtered = rawProducts.filter(p => validSlugs.includes(p.category) && (p.scope === currentTheme || p.scope === 'both'));
    if (activeCategory !== 'all') filtered = filtered.filter(p => p.category === activeCategory);
    if (searchQuery) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#64748b; padding:40px;">No products available.</div>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      var price = (currentTheme === 'wholesale') ? p.wholesalePrice : p.retailPrice;
      var mrp = p.mrp || (price * 1.25);
      var discount = Math.round(((mrp - price) / mrp) * 100);
      var inCart = isProductInCart(p.id);
      var stock = parseInt(p.stockQty) || 0;
      var isOutOfStock = stock <= 0;

      var pReviews = rawReviews.filter(r => r.productId === p.id);
      var avgRating = 5.0;
      if (pReviews.length > 0) {
        var sum = pReviews.reduce((acc, curr) => acc + curr.rating, 0);
        avgRating = (sum / pReviews.length).toFixed(1);
      }
      var ratingBadge = pReviews.length > 0 ? `⭐ ${avgRating} (${pReviews.length})` : `⭐ New`;

      return `
        <div class="product-card" onclick="${isOutOfStock ? '' : `openProductModal('${p.id}')`}">
          ${isOutOfStock ? '<div class="stockout-badge">OUT OF STOCK</div>' : ''}
          <img src="${p.img || 'https://via.placeholder.com/200?text=Product'}" loading="lazy" class="product-img" alt="${p.name}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span style="font-size:11.5px; font-weight:800; color:#d97706; background:#fef3c7; padding:2px 6px; border-radius:4px;">${ratingBadge}</span>
          </div>
          <div class="product-title">${p.name}</div>
          <div class="product-mrp-strip">
            <span class="product-mrp">₹${mrp}</span>
            <span class="product-off-badge">${discount > 0 ? discount : 10}% OFF</span>
          </div>
          <div class="product-price">₹${price}</div>
          <div class="card-actions-row" onclick="event.stopPropagation();">
            <button class="btn-card-add ${inCart ? 'is-added' : ''}" ${isOutOfStock ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : `onclick="toggleCartItem('${p.id}')"`}>
              ${isOutOfStock ? 'Sold Out' : (inCart ? '✔ Added' : '🛒 Add')}
            </button>
            <button class="btn-card-buy" ${isOutOfStock ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : `onclick="directBuyNow('${p.id}')"`}>
              ${isOutOfStock ? 'Unavailable' : '⚡ Buy Now'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function openProductModal(productId) {
    var p = rawProducts.find(x => x.id === productId);
    if (!p) return;

    currentSelectedProduct = p;
    var price = (currentTheme === 'wholesale') ? p.wholesalePrice : p.retailPrice;
    var mrp = p.mrp || (price * 1.25);
    var discount = Math.round(((mrp - price) / mrp) * 100);
    var inCart = isProductInCart(p.id);
    var stock = parseInt(p.stockQty) || 0;
    var isOutOfStock = stock <= 0;

    var catEl = document.getElementById('modalProdCategory');
    if (catEl) catEl.innerText = p.category;
    var imgEl = document.getElementById('modalProdImg');
    if (imgEl) imgEl.src = p.img || 'https://via.placeholder.com/300?text=Product';
    
    var thumbRow = document.getElementById('modalGalleryThumbnails');
    if (thumbRow) {
      var allImages = [p.img];
      if (p.gallery && Array.isArray(p.gallery)) {
        allImages = allImages.concat(p.gallery);
      }
      
      thumbRow.innerHTML = allImages.map((imgUrl, idx) => `
        <img src="${imgUrl}" class="gallery-thumb ${idx === 0 ? 'active-thumb' : ''}" onclick="switchModalMainImage('${imgUrl}', this)" />
      `).join('');
    }

    var titleEl = document.getElementById('modalProdTitle');
    if (titleEl) titleEl.innerText = p.name;
    var priceEl = document.getElementById('modalProdPrice');
    if (priceEl) priceEl.innerText = `₹${price}`;
    var mrpEl = document.getElementById('modalProdMrp');
    if (mrpEl) mrpEl.innerText = `₹${mrp}`;
    var discEl = document.getElementById('modalProdDiscount');
    if (discEl) discEl.innerText = `${discount > 0 ? discount : 10}% OFF`;
    var feeEl = document.getElementById('modalProdDeliveryFee');
    if (feeEl) feeEl.innerText = p.deliveryFee > 0 ? `₹${p.deliveryFee}` : "FREE";
    var etaEl = document.getElementById('modalProdEta');
    if (etaEl) etaEl.innerText = `${currentMatchedZoneTiming} Mins Guarantee (${currentMatchedZoneName})`;
    var descEl = document.getElementById('modalProdDesc');
    if (descEl) descEl.innerText = p.description || "Fresh and guaranteed fast dispatch item.";
    var specsEl = document.getElementById('modalProdSpecs');
    if (specsEl) specsEl.innerText = p.specifications || "Standard Quality Grade A";
    var termsEl = document.getElementById('modalProdTerms');
    if (termsEl) termsEl.innerText = p.terms || "Returnable upon delivery if damaged.";

    renderPublicReviewsFeed(p.id);

    var addBtn = document.getElementById('modalBtnAddCart');
    var buyBtn = document.getElementById('modalBtnBuyNow');

    if (addBtn && buyBtn) {
      if (isOutOfStock) {
        addBtn.innerText = "Out of Stock";
        addBtn.disabled = true;
        buyBtn.innerText = "Sold Out";
        buyBtn.disabled = true;
      } else {
        addBtn.disabled = false;
        buyBtn.disabled = false;
        addBtn.innerText = inCart ? "✔ Added" : "🛒 Add to Cart";
        addBtn.style.background = inCart ? "#dcfce7" : "#f1f5f9";
        addBtn.style.color = inCart ? "#166534" : "#0f172a";
      }
    }

    var modal = document.getElementById('productDetailsModal');
    if (modal) modal.style.display = 'flex';
  }

  function renderPublicReviewsFeed(productId) {
    var container = document.getElementById('modalPublicReviewsList');
    if (!container) return;
    var pReviews = rawReviews.filter(r => r.productId === productId);

    if (pReviews.length === 0) {
      container.innerHTML = '<p style="color:#94a3b8; text-align:center;">No reviews yet for this product. Purchase and receive items to write verified reviews.</p>';
      return;
    }

    container.innerHTML = pReviews.map(r => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <div><b>${r.userName}</b> <small style="color:#64748b;">(Verified Buyer)</small></div>
          <span style="color:#f59e0b;">${'⭐'.repeat(r.rating)}</span>
        </div>
        <p style="margin:4px 0; color:#334155; font-size:12.5px;">${r.feedback}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:#94a3b8;">
          <span>ID: ${r.id}</span>
          <span>${r.date}</span>
        </div>
      </div>
    `).join('');
  }

  function openMyReviewsModal() {
    if (!currentUser) { window.location.href = 'auth.html'; return; }
    var modal = document.getElementById('myReviewsModal');
    if (modal) modal.style.display = 'flex';

    var container = document.getElementById('myReviewsModalList');
    if (!container) return;
    if (myPublishedReviews.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">You have not published any reviews yet.</p>';
      return;
    }

    container.innerHTML = myPublishedReviews.map(r => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px; font-size:12.5px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <b style="color:#0f172a;">📦 ${r.productName}</b>
          <span style="color:#f59e0b;">${'⭐'.repeat(r.rating)}</span>
        </div>
        <p style="margin:0 0 6px 0; color:#334155;">${r.feedback}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <small style="color:#94a3b8;">${r.date}</small>
          <button type="button" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;" onclick="deleteMyReview('${r.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  function closeMyReviewsModal() {
    var modal = document.getElementById('myReviewsModal');
    if (modal) modal.style.display = 'none';
  }

  function deleteMyReview(reviewId) {
    showMohnaPopup({
      type: 'warn',
      title: 'Delete Review',
      message: 'Are you sure you want to delete this review?',
      primaryText: 'Delete',
      secondaryText: 'Cancel',
      onPrimary: function() {
        fetch(SPREADSHEET_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "deleteReview", reviewId: reviewId })
        })
        .then(r => r.json())
        .then(res => {
          if (res.status === "success") {
            fetchInitialStoreData();
            setTimeout(() => openMyReviewsModal(), 400);
          }
        });
      }
    });
  }

  function submitOrderProductReview(productId, productName) {
    if (!currentUser) { window.location.href = 'auth.html'; return; }

    var ratingSel = document.getElementById(`ord_rev_rating_${productId}`);
    var textInput = document.getElementById(`ord_rev_text_${productId}`);
    if (!ratingSel || !textInput) return;

    var rating = ratingSel.value;
    var feedback = textInput.value.trim();

    if (!feedback) {
      showMohnaPopup({ type: 'warn', title: 'Feedback Required', message: 'Please enter feedback text before posting.', primaryText: 'OK' });
      return;
    }

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "submitReview",
        productId: productId,
        productName: productName,
        userEmail: currentUser.email,
        userName: currentUser.name,
        rating: rating,
        feedback: feedback
      })
    })
    .then(r => r.json())
    .then(res => {
      if (res.status === "success") {
        showMohnaPopup({ type: 'success', title: 'Review Posted', message: 'Your verified product review has been published successfully!', primaryText: 'Awesome' });
        fetchInitialStoreData();
        setTimeout(() => {
          if (activeSelectedModalOrder) {
            var idx = cachedMyOrders.findIndex(o => o.orderId === activeSelectedModalOrder.orderId);
            if (idx !== -1) openOrderModal(idx);
          }
        }, 400);
      } else {
        showMohnaPopup({ type: 'error', title: 'Review Restricted', message: res.message, primaryText: 'Understood' });
      }
    });
  }

  function switchModalMainImage(url, thumbEl) {
    var mainImg = document.getElementById('modalProdImg');
    if (mainImg) mainImg.src = url;
    document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active-thumb'));
    thumbEl.classList.add('active-thumb');
  }

  function closeProductModal() {
    var modal = document.getElementById('productDetailsModal');
    if (modal) modal.style.display = 'none';
  }

  function toggleCartItem(productId) {
    var p = rawProducts.find(x => x.id === productId);
    if (!p) return;
    if ((parseInt(p.stockQty) || 0) <= 0) {
      showMohnaPopup({ type: 'warn', title: 'Out of Stock', message: 'Product is currently out of stock.', primaryText: 'OK' });
      return;
    }

    var existingIdx = cart.findIndex(x => x.id === productId && x.theme === currentTheme);
    var price = (currentTheme === 'wholesale') ? p.wholesalePrice : p.retailPrice;

    if (existingIdx !== -1) {
      cart.splice(existingIdx, 1);
    } else {
      cart.push({
        id: p.id,
        name: p.name,
        price: price,
        deliveryFee: parseInt(p.deliveryFee) || 0,
        qty: 1,
        theme: currentTheme
      });
    }

    updateCartUI();
  }

  function toggleCartFromModal() {
    if (!currentSelectedProduct) return;
    toggleCartItem(currentSelectedProduct.id);
    var inCart = isProductInCart(currentSelectedProduct.id);
    var addBtn = document.getElementById('modalBtnAddCart');
    if (addBtn) {
      addBtn.innerText = inCart ? "✔ Added" : "🛒 Add to Cart";
      addBtn.style.background = inCart ? "#dcfce7" : "#f1f5f9";
      addBtn.style.color = inCart ? "#166534" : "#0f172a";
    }
  }

  function directBuyNow(productId) {
    if (!currentUser) { window.location.href = 'auth.html'; return; }
    var p = rawProducts.find(x => x.id === productId);
    if (!p) return;
    if ((parseInt(p.stockQty) || 0) <= 0) {
      showMohnaPopup({ type: 'warn', title: 'Out of Stock', message: 'Product is currently out of stock.', primaryText: 'OK' });
      return;
    }

    var price = (currentTheme === 'wholesale') ? p.wholesalePrice : p.retailPrice;
    var existing = cart.find(x => x.id === productId && x.theme === currentTheme);
    if (!existing) {
      cart.push({
        id: p.id,
        name: p.name,
        price: price,
        deliveryFee: parseInt(p.deliveryFee) || 0,
        qty: 1,
        theme: currentTheme
      });
    }

    updateCartUI();
    window.location.href = 'checkout.html';
  }

  function directBuyNowFromModal() {
    if (!currentSelectedProduct) return;
    closeProductModal();
    directBuyNow(currentSelectedProduct.id);
  }

  function changeCartItemQty(idx, delta) {
    if (!cart[idx]) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) {
      cart.splice(idx, 1);
    }
    updateCartUI();
    renderCheckoutCart();
  }

  function renderCheckoutCart() {
    var container = document.getElementById('cartItemsContainer');
    if (!container) return;
    evaluateDeliveryZoneEligibility(false);

    var walletBox = document.getElementById('walletCashbackBox');
    if (walletBox) {
      if (userWalletBalance > 0) {
        walletBox.style.display = 'flex';
        var wBal = document.getElementById('chkWalletBal');
        if (wBal) wBal.innerText = `₹${userWalletBalance}`;
      } else {
        walletBox.style.display = 'none';
      }
    }

    if (cart.length === 0) {
      container.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">Your cart is empty. Browse Home to add items.</p>';
      var sub = document.getElementById('chkSubtotal'); if(sub) sub.innerText = '₹0';
      var disc = document.getElementById('chkDiscount'); if(disc) disc.innerText = '-₹0';
      var wDed = document.getElementById('chkWalletDeduction'); if(wDed) wDed.innerText = '-₹0';
      var fee = document.getElementById('chkDeliveryFee'); if(fee) fee.innerText = '₹0';
      var tot = document.getElementById('checkoutTotalDisplay'); if(tot) tot.innerText = '₹0';
      var cPay = document.getElementById('confirmPayBtn'); if(cPay) cPay.disabled = true;
      return;
    }

    var subtotal = 0;
    var maxDeliveryFee = 0;

    container.innerHTML = cart.map((item, idx) => {
      var itemTotal = item.price * item.qty;
      subtotal += itemTotal;
      if (item.deliveryFee > maxDeliveryFee) maxDeliveryFee = item.deliveryFee;

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px;">
          <div>
            <b>${item.name}</b>
            <div style="font-size:11px; color:#64748b;">₹${item.price} each</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="display:flex; align-items:center; gap:6px; background:white; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px;">
              <button onclick="changeCartItemQty(${idx}, -1)" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; color:#ef4444;">-</button>
              <span style="font-weight:bold; font-size:13px; min-width:16px; text-align:center;">${item.qty}</span>
              <button onclick="changeCartItemQty(${idx}, 1)" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; color:#16a34a;">+</button>
            </div>
            <b style="color:#16a34a; min-width:55px; text-align:right;">₹${itemTotal}</b>
          </div>
        </div>
      `;
    }).join('');

    var discountAmount = Math.round((subtotal * appliedDiscountPercent) / 100);
    var netBeforeWallet = Math.max(0, subtotal - discountAmount + maxDeliveryFee);
    var useWallet = document.getElementById('chkUseWallet')?.checked;
    var walletDeduction = (useWallet && userWalletBalance > 0) ? Math.min(netBeforeWallet, userWalletBalance) : 0;
    var grandTotal = Math.max(0, netBeforeWallet - walletDeduction);

    var subEl = document.getElementById('chkSubtotal'); if(subEl) subEl.innerText = `₹${subtotal}`;
    var discEl = document.getElementById('chkDiscount'); if(discEl) discEl.innerText = `-₹${discountAmount}`;
    var wDedEl = document.getElementById('chkWalletDeduction'); if(wDedEl) wDedEl.innerText = `-₹${walletDeduction}`;
    var feeEl = document.getElementById('chkDeliveryFee'); if(feeEl) feeEl.innerText = maxDeliveryFee > 0 ? `₹${maxDeliveryFee}` : 'FREE';
    var totEl = document.getElementById('checkoutTotalDisplay'); if(totEl) totEl.innerText = `₹${grandTotal}`;

    var payBtn = document.getElementById('confirmPayBtn');
    if (payBtn) payBtn.disabled = !isDeliverableLocation;
  }

  function applyCouponCode() {
    var cInput = document.getElementById('couponCodeInput');
    if (!cInput) return;
    var inputCode = cInput.value.trim().toUpperCase();
    var msg = document.getElementById('couponStatusMsg');

    if (!inputCode) { if(msg) { msg.innerText = "Please enter a code"; msg.style.color = "#ef4444"; } return; }
    
    var currentZoneId = "all";
    if (adminZonesData && adminZonesData.features && userCoords) {
      for (var f = 0; f < adminZonesData.features.length; f++) {
        var feature = adminZonesData.features[f];
        if (feature.geometry && feature.geometry.type === "Polygon") {
          var ring = feature.geometry.coordinates[0];
          if (isPointInsidePolygon([userCoords.lng, userCoords.lat], ring)) {
            currentZoneId = feature.properties.id || "zone_" + f;
            break;
          }
        }
      }
    }

    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "validateCoupon", code: inputCode, zoneId: currentZoneId })
    })
    .then(r => r.json())
    .then(res => {
      if (msg) {
        msg.style.color = res.valid ? "#16a34a" : "#ef4444";
        msg.innerText = res.message;
      }
      if (res.valid) {
        appliedDiscountPercent = res.discountPercent;
        renderCheckoutCart();
      } else {
        appliedDiscountPercent = 0;
        renderCheckoutCart();
      }
    });
  }

  function initiateRazorpayPayment() {
    if (!currentUser) { window.location.href = 'auth.html'; return; }
    if (cart.length === 0) {
      showMohnaPopup({ type: 'warn', title: 'Cart Empty', message: 'Your cart is empty. Add items before checking out.', primaryText: 'OK' });
      return;
    }

    if (!evaluateDeliveryZoneEligibility(false)) {
      showMohnaPopup({
        type: 'error',
        title: 'Delivery Restricted',
        message: 'Your current GPS location is outside our operational service areas. Cannot proceed with order.',
        primaryText: 'Close'
      });
      return;
    }

    var subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    var maxDeliveryFee = Math.max(0, ...cart.map(i => i.deliveryFee));
    var discountAmount = Math.round((subtotal * appliedDiscountPercent) / 100);
    var netBeforeWallet = Math.max(0, subtotal - discountAmount + maxDeliveryFee);
    var useWallet = document.getElementById('chkUseWallet')?.checked;
    var walletDeduction = (useWallet && userWalletBalance > 0) ? Math.min(netBeforeWallet, userWalletBalance) : 0;
    var finalAmount = Math.max(0, netBeforeWallet - walletDeduction);
    var amountInPaise = Math.round(finalAmount * 100);

    var btn = document.getElementById('confirmPayBtn');
    if (btn) {
      btn.classList.add('loading-state');
      btn.innerText = "⏳ Generating Secure Order...";
      btn.disabled = true;
    }

    // Request server-side Razorpay Order ID for proper dashboard tracking
    fetch(SPREADSHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "createRazorpayOrder", amount: amountInPaise })
    })
    .then(r => r.json())
    .then(res => {
      if (res.status !== "success" || !res.orderId) {
        if (btn) {
          btn.classList.remove('loading-state');
          btn.innerText = "💳 Pay Securely with Razorpay";
          btn.disabled = false;
        }
        showMohnaPopup({ type: 'error', title: 'Gateway Error', message: res.message || 'Could not initialize gateway order.', primaryText: 'OK' });
        return;
      }

      var razorpayOrderId = res.orderId;
      var rawPhone = (currentUser.phone || "9876543210").toString().replace(/[^0-9]/g, "");
      var cleanPhone = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone.padStart(10, "0");
      var cleanEmail = (currentUser.email || "customer@mohnaexpress.com").trim();

      var options = {
        "key": RAZORPAY_KEY_ID,
        "amount": amountInPaise,
        "currency": "INR",
        "name": "Mohna Express",
        "description": `Guaranteed ${currentMatchedZoneTiming} Min Dispatch`,
        "order_id": razorpayOrderId,
        "image": "https://via.placeholder.com/128?text=Mohna",
        "prefill": {
          "name": currentUser.name || "Customer",
          "email": cleanEmail,
          "contact": cleanPhone
        },
        "theme": { "color": "#2563eb" },
        "modal": {
          "confirm_close": true,
          "ondismiss": function() { 
            if (btn) {
              btn.classList.remove('loading-state');
              btn.innerText = "💳 Pay Securely with Razorpay";
              btn.disabled = false;
            }
          }
        },
        "handler": function (response) {
          var razorpayPaymentId = response.razorpay_payment_id;
          saveOrderToBackend(razorpayPaymentId, finalAmount, subtotal, discountAmount, maxDeliveryFee, walletDeduction);
        }
      };

      if (btn) {
        btn.classList.remove('loading-state');
        btn.innerText = "💳 Pay Securely with Razorpay";
        btn.disabled = false;
      }

      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        showMohnaPopup({ 
          type: 'error', 
          title: 'Payment Failed', 
          message: response.error.description || 'The transaction was declined or failed.', 
          primaryText: 'Try Again' 
        });
      });
      rzp.open();

    })
    .catch(err => {
      if (btn) {
        btn.classList.remove('loading-state');
        btn.innerText = "💳 Pay Securely with Razorpay";
        btn.disabled = false;
      }
      showMohnaPopup({ type: 'error', title: 'Network Error', message: 'Failed to communicate with payment server.', primaryText: 'OK' });
    });
  }

  function saveOrderToBackend(paymentId, finalAmount, subtotal, promoDiscount, maxDeliveryFee, walletDeduction) {
    var orderId = "MHN-" + Math.floor(100000 + Math.random() * 900000);
    var itemSummary = cart.map(i => `${i.name} (x${i.qty})`).join(', ');
    var totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    var nowMs = Date.now();

    var btn = document.getElementById('confirmPayBtn');
    if (btn) {
      btn.classList.add('loading-state');
      btn.innerText = "⏳ Confirming & Placing Order...";
      btn.disabled = true;
    }

    var addrInput = document.getElementById('orderAddress');
    var payload = {
      action: "saveOrder",
      orderId: orderId,
      orderTimestampMs: nowMs,
      paymentId: paymentId,
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone,
      address: addrInput ? addrInput.value || resolvedAddressString : resolvedAddressString,
      item: itemSummary,
      qty: totalQty,
      amount: "₹" + finalAmount,
      subtotal: "₹" + subtotal,
      discount: "₹" + promoDiscount,
      walletDiscount: "₹" + walletDeduction,
      deliveryFee: maxDeliveryFee > 0 ? "₹" + maxDeliveryFee : "FREE",
      lat: userCoords ? userCoords.lat.toFixed(5) : "0.0",
      lng: userCoords ? userCoords.lng.toFixed(5) : "0.0",
      etaMinutes: currentMatchedZoneTiming,
      cartItems: cart,
      walletDeduction: walletDeduction
    };

    fetch(SPREADSHEET_API_URL, { 
      method: "POST", 
      headers: { "Content-Type": "text/plain;charset=utf-8" }, 
      body: JSON.stringify(payload) 
    })
    .then(r => r.json())
    .then((res) => {
      cart = [];
      appliedDiscountPercent = 0;
      var cpnInput = document.getElementById('couponCodeInput');
      if (cpnInput) cpnInput.value = "";
      var cpnMsg = document.getElementById('couponStatusMsg');
      if (cpnMsg) cpnMsg.innerText = "";

      updateCartUI();

      showMohnaPopup({
        type: 'success',
        title: 'Order Confirmed! 🎉',
        message: `Order #${orderId} placed successfully. Starting live countdown...`,
        primaryText: 'View Order Status',
        onPrimary: function() {
          window.location.href = 'orders.html';
        }
      });

    })
    .catch(function() {
      if (btn) {
        btn.classList.remove('loading-state');
        btn.innerText = "💳 Pay Securely with Razorpay";
        btn.disabled = false;
      }
      showMohnaPopup({ type: 'error', title: 'Order Failed', message: 'Order could not be saved. Check connection.', primaryText: 'Retry' });
    });
  }

  function renderProfilePage() {
    if (!currentUser) { window.location.href = 'auth.html'; return; }
    var w = document.getElementById('profWallet'); if(w) w.value = `₹${userWalletBalance}`;
    var n = document.getElementById('profName'); if(n) n.value = currentUser.name || "";
    var p = document.getElementById('profPhone'); if(p) p.value = currentUser.phone || "";
    var e = document.getElementById('profEmail'); if(e) e.value = currentUser.email || "";
    var rg = document.getElementById('profRegCoords'); if(rg) rg.value = `${currentUser.regLat || ''}, ${currentUser.regLng || ''}`;
    var lg = document.getElementById('profLoginCoords'); if(lg) lg.value = `${currentUser.loginLat || userCoords?.lat || ''}, ${currentUser.loginLng || userCoords?.lng || ''}`;
    var st = document.getElementById('profStatus'); if(st) st.value = currentUser.status || "Active";
    var av = document.getElementById('profAvatarDisplay'); if(av) av.src = currentUser.avatar || "https://via.placeholder.com/96?text=User";
    var sv = document.getElementById('btnSaveAvatar'); if(sv) sv.style.display = "none";
  }

  function checkAndResumeActiveOrderTimer() {
    if (!cachedMyOrders || cachedMyOrders.length === 0) return;
    var latestOrder = cachedMyOrders[0];
    var startMs = parseAnyDateToMs(latestOrder.orderTimestampMs || latestOrder.date);
    var expiryMs = Number(latestOrder.expiryTimestamp) || (startMs + (Number(latestOrder.etaMinutes) || 20) * 60000);
    
    startPersistentCountdown(
      expiryMs,
      latestOrder.orderId,
      latestOrder.status,
      latestOrder.deliveredTimestamp || 0,
      startMs,
      latestOrder.etaMinutes || 20,
      latestOrder.riderName,
      latestOrder.riderPhone,
      latestOrder.riderCoords
    );
  }

  function startPersistentCountdown(targetExpiryTimestamp, orderId, status, deliveredTimestamp, orderStartMsInput, etaMinutes, riderName, riderPhone, riderCoords) {
    var box = document.getElementById('persistentTrackerBox');
    if (!box) return;
    var clock = document.getElementById('persistentTimerDisplay');
    var orderDisplay = document.getElementById('activeOrderIdDisplay');
    var header = document.getElementById('pTrackerHeader');
    var subtext = document.getElementById('timerSubtext');

    box.style.display = 'block';
    if(orderDisplay) orderDisplay.innerText = `Order ID: ${orderId}`;
    clearInterval(persistentTimerInterval);

    var startMs = parseAnyDateToMs(orderStartMsInput);
    var expMs = Number(targetExpiryTimestamp) || (startMs + (etaMinutes * 60000));

    if (status && status.includes('Delivered')) {
      var endMs = parseAnyDateToMs(deliveredTimestamp) || Date.now();
      var totalElapsedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
      var timeFormatted = formatTimeHms(totalElapsedSec);

      if (endMs <= expMs) {
        if(clock) { clock.style.color = "#22c55e"; clock.innerText = `✔ ${timeFormatted}`; }
        if(header) { header.style.background = "rgba(34, 197, 94, 0.2)"; header.style.color = "#22c55e"; header.innerText = "⚡ ORDER DELIVERED ON TIME"; }
        if(subtext) subtext.innerHTML = `<b style="color:#22c55e;">Delivered within ${etaMinutes} mins guarantee.</b>`;
      } else {
        if(clock) { clock.style.color = "#ef4444"; clock.innerText = `⚠️ ${timeFormatted}`; }
        if(header) { header.style.background = "rgba(239, 68, 68, 0.2)"; header.style.color = "#ef4444"; header.innerText = "⚠️ ORDER DELIVERED (LATE - CASHBACK CREDITED)"; }
        if(subtext) subtext.innerHTML = `<b style="color:#ef4444;">₹25 late delivery guarantee credited to your Wallet!</b>`;
      }
      return;
    }

    if(header) { header.style.background = "rgba(56, 189, 248, 0.2)"; header.style.color = "#38bdf8"; header.innerText = "⚡ LIVE DISPATCH COUNTDOWN ACTIVE"; }
    if(clock) clock.style.color = "#38bdf8";
    if(subtext) subtext.innerText = "Synchronized with Mohna Express Dispatch Hub";

    persistentTimerInterval = setInterval(() => {
      var remainingMs = expMs - Date.now();
      if (remainingMs <= 0) {
        clearInterval(persistentTimerInterval);
        if(clock) { clock.innerText = "0m 00s"; clock.style.color = "#ef4444"; }
        if(subtext) subtext.innerHTML = "⚡ <b style='color:#ef4444;'>Delivery Time Guarantee Reached (Cashback Eligible)</b>";
        return;
      }
      var totalSec = Math.floor(remainingMs / 1000);
      if(clock) clock.innerText = formatTimeHms(totalSec);
    }, 1000);
  }

  function renderCustomerOrdersList() {
    var container = document.getElementById('customerOrdersList');
    if (!container) return;
    if (!currentUser) {
      container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">Please log in to view order history.</p>';
      return;
    }

    if (cachedMyOrders.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">No past orders found.</p>';
      return;
    }

    container.innerHTML = cachedMyOrders.map((o, idx) => {
      var startMs = parseAnyDateToMs(o.orderTimestampMs || o.date);
      var expiryMs = Number(o.expiryTimestamp) || (startMs + (Number(o.etaMinutes) || 20) * 60000);
      var isDelivered = o.status && o.status.includes('Delivered');
      var isOut = o.status && (o.status.includes('OUT') || o.status.includes('Out'));
      var isPacked = o.status && o.status.includes('PACKED');

      var timerHtml = isDelivered 
        ? calculateDeliveryStatusBadge(startMs, o.etaMinutes || 20, expiryMs, o.deliveredTimestamp || 0)
        : `<span id="card_timer_${o.orderId}" data-expiry="${expiryMs}" class="badge-ticking">⏱️ Loading...</span>`;

      var trackRiderBtn = (isOut && o.riderName)
        ? `<div style="text-align:center; margin-top:8px;" onclick="event.stopPropagation();">
             <button type="button" class="btn-track-rider" onclick="openLiveRiderTrackingModal(${idx})">
               🛵 View Live Rider Location & Radar
             </button>
           </div>`
        : '';

      return `
        <div class="order-history-card" onclick="openOrderModal(${idx})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <b>${o.orderId}</b>
            <span style="background:${isOut ? '#fed7aa' : (isPacked ? '#dbeafe' : '#dcfce7')}; color:${isOut ? '#9a3412' : (isPacked ? '#1e40af' : '#166534')}; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:12px;">${o.status || 'PAID'}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin:6px 0;">
            <p style="margin:0; font-size:13.5px; color:#1e293b; font-weight:600; flex:1;">${o.item}</p>
            <div style="flex:1; text-align:center;">${timerHtml}</div>
            <b style="color:#16a34a; font-size:15px; flex:1; text-align:right;">${o.amount}</b>
          </div>

          ${trackRiderBtn}

          <div style="font-size:12px; color:#64748b; margin-top:4px;">
            🕒 Timestamp (IST): <b style="color:#0f172a;">${formatIndianDate(startMs)}</b><br>
            📍 Address: <b style="color:#334155;">${o.address || 'GPS Location'}</b>
          </div>
        </div>
      `;
    }).join('');

    startCardTimersCountdown();
  }

  function startCardTimersCountdown() {
    clearInterval(cardTickersInterval);
    cardTickersInterval = setInterval(() => {
      var now = Date.now();
      document.querySelectorAll('[id^="card_timer_"]').forEach(el => {
        var expiry = parseInt(el.getAttribute('data-expiry'));
        var diff = expiry - now;

        if (diff <= 0) {
          el.className = "badge-late";
          el.innerText = "0m 00s (EXPIRED)";
        } else {
          el.className = "badge-ticking";
          var totalSec = Math.floor(diff / 1000);
          el.innerText = `⏱️ ${formatTimeHms(totalSec)}`;
        }
      });
    }, 1000);
  }

  function openLiveRiderTrackingModal(orderIdx) {
    var order = cachedMyOrders[orderIdx];
    if (!order) return;

    var rNameEl = document.getElementById('trackModalRiderName'); if(rNameEl) rNameEl.innerText = order.riderName || "Delivery Partner";
    var rCallEl = document.getElementById('trackModalRiderCall'); if(rCallEl) rCallEl.href = "tel:" + (order.riderPhone || "");
    var tModal = document.getElementById('liveTrackingModal'); if(tModal) tModal.style.display = 'flex';

    var qrContainer = document.getElementById('custDeliveryQrBox');
    var qrTarget = document.getElementById('custHandoverQrTarget');
    if (qrTarget) qrTarget.innerHTML = "";

    var isOut = order.status && (order.status.includes('OUT') || order.status.includes('Out'));
    if (isOut && order.deliveryToken && qrContainer && qrTarget) {
      qrContainer.style.display = 'flex';
      new QRCode(qrTarget, {
        text: JSON.stringify({
          type: "MOHNA_DELIVERY_HANDOVER",
          orderId: order.orderId,
          deliveryToken: order.deliveryToken
        }),
        width: 140,
        height: 140
      });
    } else if (qrContainer) {
      qrContainer.style.display = 'none';
    }

    setTimeout(function() {
      var rLat = 25.6000, rLng = 85.1300;
      if (order.riderCoords && order.riderCoords.includes(',')) {
        var parts = order.riderCoords.split(',');
        rLat = parseFloat(parts[0]) || rLat;
        rLng = parseFloat(parts[1]) || rLng;
      }

      var uLat = userCoords ? userCoords.lat : (order.coords ? parseFloat(order.coords.split(',')[0]) : rLat);
      var uLng = userCoords ? userCoords.lng : (order.coords ? parseFloat(order.coords.split(',')[1]) : rLng);

      var dist = calculateDistanceKm(rLat, rLng, uLat, uLng);
      var distEl = document.getElementById('trackModalDistance');
      if (distEl) distEl.innerText = `📍 Delivery partner is ~${dist} km away from your location`;

      if (!trackingLeafletMap) {
        var mapEl = document.getElementById('liveTrackingMap');
        if (!mapEl) return;
        trackingLeafletMap = L.map('liveTrackingMap').setView([rLat, rLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(trackingLeafletMap);

        var riderIcon = L.divIcon({ html: '<div style="font-size:26px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🛵</div>', className: '', iconSize: [30, 30] });
        riderMapMarker = L.marker([rLat, rLng], { icon: riderIcon }).addTo(trackingLeafletMap).bindPopup(`<b>${order.riderName || 'Rider'}</b> (In Transit)`);

        var userIcon = L.divIcon({ html: '<div style="font-size:26px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🏠</div>', className: '', iconSize: [30, 30] });
        userMapMarker = L.marker([uLat, uLng], { icon: userIcon }).addTo(trackingLeafletMap).bindPopup("Your Delivery Address");

        var bounds = new L.LatLngBounds([[rLat, rLng], [uLat, uLng]]);
        trackingLeafletMap.fitBounds(bounds, { padding: [40, 40] });
      } else {
        trackingLeafletMap.invalidateSize();
        if (riderMapMarker) riderMapMarker.setLatLng([rLat, rLng]);
        if (userMapMarker) userMapMarker.setLatLng([uLat, uLng]);
        var b = new L.LatLngBounds([[rLat, rLng], [uLat, uLng]]);
        trackingLeafletMap.fitBounds(b, { padding: [40, 40] });
      }
    }, 250);
  }

  function closeTrackingModal() {
    var modal = document.getElementById('liveTrackingModal');
    if (modal) modal.style.display = 'none';
  }

  function openOrderModal(orderIndex) {
    var order = cachedMyOrders[orderIndex];
    if (!order) return;
    activeSelectedModalOrder = order;

    var startMs = parseAnyDateToMs(order.orderTimestampMs || order.date);

    var dId = document.getElementById('dtlOrderId'); if(dId) dId.innerText = order.orderId;
    var dTs = document.getElementById('dtlTimestamp'); if(dTs) dTs.innerText = formatIndianDate(startMs);
    var dQty = document.getElementById('dtlTotalQty'); if(dQty) dQty.innerText = order.qty;
    
    var itemizedContainer = document.getElementById('dtlItemizedList');
    var isDelivered = order.status && order.status.includes('Delivered');
    var deliveryTimeMs = Number(order.deliveredTimestamp) || 0;
    var sixHoursMs = 6 * 60 * 60 * 1000;
    var isWithin6Hours = isDelivered && (Date.now() - deliveryTimeMs <= sixHoursMs);

    if (itemizedContainer && order.items && Array.isArray(order.items) && order.items.length > 0) {
      itemizedContainer.innerHTML = order.items.map(it => {
        var existingReview = rawReviews.find(r => r.productId === it.id && r.userEmail.toLowerCase() === (currentUser ? currentUser.email.toLowerCase() : ""));
        var reviewFormHtml = "";

        if (isDelivered && isWithin6Hours && !existingReview) {
          reviewFormHtml = `
            <div style="margin-top:6px; background:#eff6ff; padding:8px; border-radius:6px; border:1px solid #bfdbfe;">
              <span style="font-size:11px; font-weight:800; color:#1e40af; display:block; margin-bottom:2px;">⭐ Review this Item (6hr Window Active)</span>
              <div style="display:flex; gap:4px; margin-bottom:4px;">
                <select id="ord_rev_rating_${it.id}" style="width:75px; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;">
                  <option value="5">5 ⭐</option><option value="4">4 ⭐</option><option value="3">3 ⭐</option><option value="2">2 ⭐</option><option value="1">1 ⭐</option>
                </select>
                <input type="text" id="ord_rev_text_${it.id}" placeholder="Write feedback..." style="flex:1; padding:4px 8px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;" />
              </div>
              <button type="button" class="btn-submit" style="padding:4px 8px; font-size:11px; background:#16a34a;" onclick="submitOrderProductReview('${it.id}', '${it.name}')">Post Verified Review</button>
            </div>
          `;
        } else if (existingReview) {
          reviewFormHtml = `<div style="font-size:11px; color:#166534; font-weight:bold; margin-top:4px;">✔ Review Posted: ${'⭐'.repeat(existingReview.rating)} "${existingReview.feedback}"</div>`;
        } else if (isDelivered && !isWithin6Hours) {
          reviewFormHtml = `<div style="font-size:11px; color:#b91c1c; margin-top:4px;">⏰ Review window expired (6h limit passed).</div>`;
        }

        return `
          <div style="padding:6px 0; border-bottom:1px dashed #e2e8f0;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
              <div><b>${it.name}</b> <small style="color:#64748b;">(₹${it.price} × ${it.qty})</small></div>
              <b style="color:#16a34a;">₹${it.price * it.qty}</b>
            </div>
            ${reviewFormHtml}
          </div>
        `;
      }).join('');
    } else if (itemizedContainer) {
      itemizedContainer.innerHTML = `<div style="font-size:12.5px; color:#334155;">${order.item} (Qty: ${order.qty})</div>`;
    }

    var sub = document.getElementById('dtlSubtotal'); if(sub) sub.innerText = order.subtotal || order.amount;
    var disc = document.getElementById('dtlDiscount'); if(disc) disc.innerText = order.discount ? `-${order.discount}` : "-₹0";
    var wDis = document.getElementById('dtlWalletDiscount'); if(wDis) wDis.innerText = order.walletDiscount ? `-${order.walletDiscount}` : "-₹0";
    var fee = document.getElementById('dtlDeliveryFee'); if(fee) fee.innerText = order.deliveryFee || "FREE";
    var amt = document.getElementById('dtlAmount'); if(amt) amt.innerText = order.amount;

    var addr = document.getElementById('dtlAddress'); if(addr) addr.innerText = order.address || "Customer GPS Coordinates";
    var eta = document.getElementById('dtlEta'); if(eta) eta.innerText = `${order.etaMinutes || 20} Minutes`;
    var stat = document.getElementById('dtlStatus'); if(stat) stat.innerText = order.status || "PAID";

    var isOut = order.status && (order.status.includes('OUT') || order.status.includes('Out'));
    var modalRiderBox = document.getElementById('dtlModalRiderBox');
    if (isOut && order.riderName && modalRiderBox) {
      modalRiderBox.style.display = 'block';
      var rName = document.getElementById('dtlModalRiderName'); if(rName) rName.innerText = `${order.riderName} (${order.riderPhone || 'In Transit'})`;
      var rCall = document.getElementById('dtlModalRiderCallBtn'); if(rCall) rCall.href = "tel:" + (order.riderPhone || "");
    } else if (modalRiderBox) {
      modalRiderBox.style.display = 'none';
    }

    var expiryMs = Number(order.expiryTimestamp) || (startMs + (Number(order.etaMinutes) || 20) * 60000);
    var timerBadge = document.getElementById('dtlLiveTimer');

    if (timerBadge) {
      if (order.status && order.status.includes('Delivered')) {
        timerBadge.innerHTML = calculateDeliveryStatusBadge(startMs, order.etaMinutes || 20, expiryMs, order.deliveredTimestamp || 0);
      } else {
        timerBadge.className = "badge-ticking";
        var remainingMs = expiryMs - Date.now();
        if (remainingMs <= 0) {
          timerBadge.className = "badge-late";
          timerBadge.innerText = "0m 00s (EXPIRED)";
        } else {
          var totalSec = Math.floor(remainingMs / 1000);
          timerBadge.innerText = `⏱️ ${formatTimeHms(totalSec)}`;
        }
      }
    }

    var oModal = document.getElementById('orderDetailsModal');
    if (oModal) oModal.style.display = 'flex';
  }

  function closeOrderModal() {
    var modal = document.getElementById('orderDetailsModal');
    if (modal) modal.style.display = 'none';
    activeSelectedModalOrder = null;
  }

  function downloadSelectedOrderReceipt() {
    if (!activeSelectedModalOrder) return;
    if (activeSelectedModalOrder.receiptPdfUrl && activeSelectedModalOrder.receiptPdfUrl.includes('drive.google.com')) {
      window.open(activeSelectedModalOrder.receiptPdfUrl, '_blank');
    }
  }
