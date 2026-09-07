// =========================================================================
// 1. DATABASE SCHEMA & GOOGLE DRIVE PERMISSION ENGINE
// =========================================================================
function authorizeDriveAccess() {
  try {
    var mediaFolders = DriveApp.getFoldersByName("Mohna_Media_Drive");
    if (!mediaFolders.hasNext()) {
      var mf = DriveApp.createFolder("Mohna_Media_Drive");
      mf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    var receiptFolders = DriveApp.getFoldersByName("Mohna_Order_Receipts");
    if (!receiptFolders.hasNext()) {
      var rf = DriveApp.createFolder("Mohna_Order_Receipts");
      rf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    Logger.log("Drive permissions and storage folders ready!");
  } catch (err) {
    Logger.log("Drive notice: " + err.toString());
  }
}

function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = {
    "Users": ["User ID", "Date", "Name", "Phone", "Email", "Password", "Registered Lat", "Registered Lng", "Last Login Lat", "Last Login Lng", "Last Login Date", "Status", "Profile Pic URL", "Session Token", "Wallet Balance", "Username"],
    "Riders": ["Rider ID", "Date", "Name", "Phone", "Email", "Password", "Vehicle Info", "Status", "Last Login Date", "Profile Pic URL", "Session Token", "Live Lat", "Live Lng"],
    "Orders": ["Order ID", "Date", "Name", "Phone", "Email", "Address", "Item Summary", "Total Quantity", "Amount", "Payment ID", "Status", "Coordinates", "Maps Link", "ETA Minutes", "Expiry Timestamp", "Receipt PDF URL", "Delivered Timestamp", "Subtotal", "Discount", "Delivery Fee", "Rider Name", "Rider Phone", "Rider Coords", "Wallet Discount", "Order Timestamp Ms", "Parcel Token", "Delivery Token", "Items JSON"],
    "Settings": [],
    "Products": ["Product ID", "Name", "Category", "Scope", "Retail Price", "Wholesale Price", "MRP", "Stock Qty", "Delivery Fee", "Description", "Specifications", "Terms", "Image URL", "Gallery Images JSON"],
    "Categories": ["Category ID", "Name", "Slug", "Scope"],
    "Coupons": ["Coupon ID", "Code", "Discount %", "Valid Until", "Zone Scope", "Usage Limit", "Times Used"],
    "Reviews": ["Review ID", "Product ID", "Product Name", "User Email", "User Name", "Rating", "Feedback", "Date"]
  };

  for (var tabName in tabs) {
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    if (tabs[tabName].length > 0 && sheet.getLastRow() === 0) {
      sheet.appendRow(tabs[tabName]);
      sheet.getRange(1, 1, 1, tabs[tabName].length).setFontWeight("bold").setBackground("#f1f5f9");
    }
  }
  Logger.log("Database tables initialized with Verified Purchase Reviews & Multi-Image Product columns!");
}

function generateSecureToken(orderId, salt) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("MOHNA_SECRET_KEY") || "MOHNA_KEY_2026";
  var raw = String(orderId) + "_" + String(salt) + "_" + secret;
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var hex = "";
  for (var i = 0; i < signature.length; i++) {
    var b = (signature[i] < 0 ? signature[i] + 256 : signature[i]).toString(16);
    hex += (b.length === 1 ? "0" + b : b);
  }
  return "TK_" + hex.substring(0, 24);
}

function saveBase64ImageToDrive(base64Data, filename, folderName) {
  try {
    if (!base64Data || base64Data.length < 30) return "";
    var folders = DriveApp.getFoldersByName(folderName || "Mohna_Media_Drive");
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName || "Mohna_Media_Drive");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var contentType = "image/jpeg";
    var cleanBase64 = base64Data;

    if (base64Data.indexOf(",") !== -1) {
      var splitData = base64Data.split(",");
      var mimeMatch = splitData[0].match(/:(.*?);/);
      if (mimeMatch && mimeMatch[1]) {
        contentType = mimeMatch[1];
      }
      cleanBase64 = splitData[1];
    }

    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, contentType, filename);

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (err) {
    Logger.log("Drive Error: " + err.toString());
    return "";
  }
}

function getIndianDateTimeString(ms) {
  var d = ms ? new Date(Number(ms)) : new Date();
  return Utilities.formatDate(d, "Asia/Kolkata", "dd MMM yyyy, hh:mm a");
}

// =========================================================================
// 2. UNIFIED REQUEST DISPATCHER (ZERO-FAIL CORS TRANSPORT)
// =========================================================================
function doGet(e) {
  return handleUnifiedRequest(e);
}

function doPost(e) {
  return handleUnifiedRequest(e);
}

function handleUnifiedRequest(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = {};

    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (jsonErr) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = data.action;
    var cache = CacheService.getScriptCache();
    var props = PropertiesService.getScriptProperties();

    if (["addProduct", "updateProduct", "deleteProduct", "addCategory", "deleteCategory", "addCoupon", "deleteCoupon", "saveZone", "clearZone", "saveOrder", "submitReview", "deleteReview", "updateReview", "saveAdminPopup"].includes(action)) {
      cache.remove("INIT_STORE_GENERAL");
    }

    // =========================================================================
    // RAZORPAY PAYMENT ORDER GENERATOR
    // =========================================================================
    if (action === "createRazorpayOrder") {
      var RAZORPAY_KEY_ID = props.getProperty("RAZORPAY_KEY_ID") || "rzp_test_TYINZpDJ5bh2CP";
      var RAZORPAY_KEY_SECRET = props.getProperty("RAZORPAY_KEY_SECRET") || "wYLjDG2oz63cPw5ZGL7JlX0c";
      
      var rupeeAmount = parseFloat(data.amount) || 0;
      var formattedRupees = parseFloat(rupeeAmount.toFixed(2));
      var amountInPaise = Math.round(formattedRupees * 100);

      var payload = { 
        amount: amountInPaise, 
        currency: "INR", 
        receipt: "rcpt_" + Date.now() 
      };
      
      var options = {
        method: "POST",
        headers: { 
          "Authorization": "Basic " + Utilities.base64Encode(RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET), 
          "Content-Type": "application/json" 
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      try {
        var response = UrlFetchApp.fetch("https://api.razorpay.com/v1/orders", options);
        var json = JSON.parse(response.getContentText());
        return ContentService.createTextOutput(JSON.stringify({ 
          status: json.id ? "success" : "error", 
          orderId: json.id,
          raw: json 
        })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "error", 
          message: "Razorpay connection failed: " + err.toString() 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // =========================================================================
    // FORGOT PASSWORD: SEND OTP
    // =========================================================================
    if (action === "sendForgotPasswordOtp") {
      var email = (data.email || "").trim().toLowerCase();
      var usersSheet = ss.getSheetByName("Users");
      var userExists = false;
      if (usersSheet) {
        var uData = usersSheet.getDataRange().getValues();
        for (var u = 1; u < uData.length; u++) {
          if (uData[u][4] && uData[u][4].toString().trim().toLowerCase() === email) {
            userExists = true; break;
          }
        }
      }
      if (!userExists) return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Account with this email does not exist." })).setMimeType(ContentService.MimeType.JSON);

      var otp = Math.floor(100000 + Math.random() * 900000).toString();
      cache.put("RESET_OTP_" + email, otp, 600);
      try {
        MailApp.sendEmail({
          to: email, name: "Mohna Express", subject: otp + " is your Password Reset Code",
          htmlBody: `<div style="font-family:sans-serif; padding:20px; border:1px solid #e2e8f0; border-radius:10px; max-width:400px; margin:auto;">
            <h2 style="color:#2563eb;">🔐 Password Reset</h2>
            <p>Your OTP to reset your password is:</p>
            <div style="font-size:32px; font-weight:900; letter-spacing:6px; text-align:center; padding:12px; background:#f8fafc; border-radius:8px; font-family:monospace;">${otp}</div>
            <p style="font-size:12px; color:#64748b; margin-top:10px;">Valid for 10 minutes. Do not share this code.</p>
          </div>`
        });
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Reset OTP sent to your email." })).setMimeType(ContentService.MimeType.JSON);
      } catch(e) { return ContentService.createTextOutput(JSON.stringify({ status: "error", message: e.toString() })).setMimeType(ContentService.MimeType.JSON); }
    }

    // =========================================================================
    // FORGOT PASSWORD: RESET PASSWORD
    // =========================================================================
    if (action === "resetUserPassword") {
      var email = (data.email || "").trim().toLowerCase();
      var otp = (data.otp || "").toString().trim();
      var newPassword = (data.newPassword || "").toString().trim();
      var cachedOtp = cache.get("RESET_OTP_" + email);
      if (!cachedOtp || cachedOtp !== otp) return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid or expired OTP." })).setMimeType(ContentService.MimeType.JSON);

      var usersSheet = ss.getSheetByName("Users");
      if (usersSheet) {
        var uData = usersSheet.getDataRange().getValues();
        for (var u = 1; u < uData.length; u++) {
          if (uData[u][4] && uData[u][4].toString().trim().toLowerCase() === email) {
            usersSheet.getRange(u + 1, 6).setValue(newPassword);
            cache.remove("RESET_OTP_" + email);
            return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Password updated successfully!" })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "User account not found." })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // CHECK UNIQUE USERNAME AVAILABILITY
    // =========================================================================
    if (action === "checkUsernameAvailability") {
      var username = String(data.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      var currentEmail = (data.email || "").trim().toLowerCase();
      var usersSheet = ss.getSheetByName("Users");
      var isAvailable = true;
      if (usersSheet && username.length >= 3) {
        var uData = usersSheet.getDataRange().getValues();
        for (var u = 1; u < uData.length; u++) {
          var rowEmail = uData[u][4] ? uData[u][4].toString().trim().toLowerCase() : "";
          var rowUsername = uData[u][15] ? uData[u][15].toString().trim().toLowerCase() : "";
          if (rowUsername === username && rowEmail !== currentEmail) {
            isAvailable = false; break;
          }
        }
      } else if (username.length < 3) {
        isAvailable = false;
      }
      return ContentService.createTextOutput(JSON.stringify({ available: isAvailable, username: username })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // WALLET TOP-UP / ADMIN BALANCE ADJUSTMENT
    // =========================================================================
    if (action === "addWalletBalance") {
      var email = (data.email || "").trim().toLowerCase();
      var addAmount = Number(data.amount) || 0;
      var usersSheet = ss.getSheetByName("Users");
      if (usersSheet && email && addAmount !== 0) {
        var uData = usersSheet.getDataRange().getValues();
        for (var u = 1; u < uData.length; u++) {
          if (uData[u][4] && uData[u][4].toString().trim().toLowerCase() === email) {
            var currentBal = Number(uData[u][14]) || 0;
            var newBal = Math.max(0, currentBal + addAmount);
            usersSheet.getRange(u + 1, 15).setValue(newBal);
            return ContentService.createTextOutput(JSON.stringify({ status: "success", newBalance: newBal })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "User not found or invalid amount." })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // SAVE & GET ADMIN ANNOUNCEMENT POPUPS
    // =========================================================================
    if (action === "saveAdminPopup") {
      var settingsSheet = ss.getSheetByName("Settings") || ss.insertSheet("Settings");
      settingsSheet.getRange("B1").setValue(JSON.stringify(data.popupConfig || {}));
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getAdminPopup") {
      var settingsSheet = ss.getSheetByName("Settings");
      var popupVal = settingsSheet ? settingsSheet.getRange("B1").getValue() : null;
      var parsedPopup = null;
      if (popupVal) { try { parsedPopup = typeof popupVal === "string" ? JSON.parse(popupVal) : popupVal; } catch(e){} }
      return ContentService.createTextOutput(JSON.stringify({ popup: parsedPopup })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Initial Store Data Loader
    if (action === "getInitStoreData") {
      var userEmail = (data.userEmail || "").trim().toLowerCase();
      var cachedGeneral = cache.get("INIT_STORE_GENERAL");
      var generalData = null;

      if (cachedGeneral) {
        try { generalData = JSON.parse(cachedGeneral); } catch (err) { generalData = null; }
      }

      if (!generalData) {
        var prodSheet = ss.getSheetByName("Products");
        var prodData = prodSheet ? prodSheet.getDataRange().getValues() : [];
        var products = [];
        for (var i = 1; i < prodData.length; i++) {
          if (prodData[i][0]) {
            var galleryImgs = [];
            try {
              if (prodData[i][13]) galleryImgs = JSON.parse(prodData[i][13]);
            } catch(e) {}

            products.push({
              id: prodData[i][0],
              name: prodData[i][1],
              category: prodData[i][2],
              scope: (prodData[i][3] || "both").toString().trim().toLowerCase(),
              retailPrice: prodData[i][4],
              wholesalePrice: prodData[i][5],
              mrp: prodData[i][6] || prodData[i][4],
              stockQty: prodData[i][7] || 0,
              deliveryFee: prodData[i][8] || 0,
              description: prodData[i][9] || "",
              specifications: prodData[i][10] || "",
              terms: prodData[i][11] || "",
              img: prodData[i][12] || "",
              gallery: galleryImgs
            });
          }
        }

        var catSheet = ss.getSheetByName("Categories");
        var catData = catSheet ? catSheet.getDataRange().getValues() : [];
        var categories = [];
        for (var j = 1; j < catData.length; j++) {
          if (catData[j][0]) {
            categories.push({ 
              id: catData[j][0], 
              name: catData[j][1], 
              slug: catData[j][2], 
              scope: (catData[j][3] || "both").toString().trim().toLowerCase() 
            });
          }
        }

        var cpnSheet = ss.getSheetByName("Coupons");
        var cpnData = cpnSheet ? cpnSheet.getDataRange().getValues() : [];
        var coupons = [];
        for (var k = 1; k < cpnData.length; k++) {
          if (cpnData[k][0]) {
            coupons.push({ id: cpnData[k][0], code: cpnData[k][1], discountPercent: cpnData[k][2], validUntil: cpnData[k][3], zoneScope: cpnData[k][4], limit: Number(cpnData[k][5]) || 0, used: Number(cpnData[k][6]) || 0 });
          }
        }

        var revSheet = ss.getSheetByName("Reviews");
        var revData = revSheet ? revSheet.getDataRange().getValues() : [];
        var reviews = [];
        for (var r = 1; r < revData.length; r++) {
          if (revData[r][0]) {
            reviews.push({
              id: revData[r][0],
              productId: revData[r][1],
              productName: revData[r][2],
              userEmail: revData[r][3],
              userName: revData[r][4],
              rating: Number(revData[r][5]) || 5,
              feedback: revData[r][6],
              date: revData[r][7]
            });
          }
        }

        var settingsSheet = ss.getSheetByName("Settings");
        var zoneData = settingsSheet ? settingsSheet.getRange("A1").getValue() : null;
        var popupData = settingsSheet ? settingsSheet.getRange("B1").getValue() : null;
        var parsedZone = null, parsedPopup = null;
        if (zoneData) {
          try { parsedZone = (typeof zoneData === "string") ? JSON.parse(zoneData) : zoneData; } catch (err) { parsedZone = null; }
        }
        if (popupData) {
          try { parsedPopup = (typeof popupData === "string") ? JSON.parse(popupData) : popupData; } catch (err) { parsedPopup = null; }
        }

        generalData = { products: products, categories: categories, coupons: coupons, reviews: reviews, zone: parsedZone, popupConfig: parsedPopup };
        cache.put("INIT_STORE_GENERAL", JSON.stringify(generalData), 300);
      }

      var userOrders = [];
      var walletBalance = 0;
      var currentUsername = "";
      var myReviews = [];

      if (userEmail) {
        var usersSheet = ss.getSheetByName("Users");
        if (usersSheet) {
          var uData = usersSheet.getDataRange().getValues();
          for (var u = 1; u < uData.length; u++) {
            if (uData[u][4] && uData[u][4].toString().trim().toLowerCase() === userEmail) {
              walletBalance = Number(uData[u][14]) || 0;
              currentUsername = uData[u][15] || "";
              break;
            }
          }
        }

        myReviews = generalData.reviews.filter(function(rv) {
          return rv.userEmail.toLowerCase() === userEmail;
        });

        var ordersSheet = ss.getSheetByName("Orders");
        var ordersData = ordersSheet ? ordersSheet.getDataRange().getValues() : [];
        for (var m = 1; m < ordersData.length; m++) {
          if (ordersData[m][4] && ordersData[m][4].toString().trim().toLowerCase() === userEmail) {
            var startMs = Number(ordersData[m][24]) || new Date(ordersData[m][1]).getTime();
            var parsedItems = [];
            try {
              if (ordersData[m][27]) parsedItems = JSON.parse(ordersData[m][27]);
            } catch(e) {}

            userOrders.push({
              orderId: ordersData[m][0],
              date: ordersData[m][1],
              orderTimestampMs: startMs,
              name: ordersData[m][2],
              phone: ordersData[m][3],
              email: ordersData[m][4],
              address: ordersData[m][5],
              item: ordersData[m][6],
              qty: ordersData[m][7],
              amount: ordersData[m][8],
              paymentId: ordersData[m][9],
              status: ordersData[m][10],
              coords: ordersData[m][11],
              etaMinutes: Number(ordersData[m][13]) || 20,
              expiryTimestamp: Number(ordersData[m][14]) || (startMs + (Number(ordersData[m][13]) || 20) * 60000),
              receiptPdfUrl: ordersData[m][15] || "",
              deliveredTimestamp: Number(ordersData[m][16]) || 0,
              subtotal: ordersData[m][17] || ordersData[m][8],
              discount: ordersData[m][18] || "₹0",
              deliveryFee: ordersData[m][19] || "FREE",
              riderName: ordersData[m][20] || "",
              riderPhone: ordersData[m][21] || "",
              riderCoords: ordersData[m][22] || "",
              walletDiscount: ordersData[m][23] || "₹0",
              deliveryToken: (ordersData[m][26] || "").toString().replace(/^'+/, ''),
              items: parsedItems
            });
          }
        }
        userOrders.reverse();
      }

      var payload = JSON.stringify({
        products: generalData.products,
        categories: generalData.categories,
        coupons: generalData.coupons,
        reviews: generalData.reviews,
        myReviews: myReviews,
        zone: generalData.zone,
        popupConfig: generalData.popupConfig,
        myOrders: userOrders,
        walletBalance: walletBalance,
        username: currentUsername
      });

      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }

    // Submit or Update Product Review with Verified Purchase & 6-Hour Window Validation
    if (action === "submitReview" || action === "updateReview") {
      var userEmail = (data.userEmail || "").trim().toLowerCase();
      var productId = data.productId;
      var rating = Number(data.rating) || 5;
      var feedback = (data.feedback || "").trim();

      if (!userEmail || !productId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing user or product information." })).setMimeType(ContentService.MimeType.JSON);
      }

      var revSheet = ss.getSheetByName("Reviews") || ss.insertSheet("Reviews");
      var ordersSheet = ss.getSheetByName("Orders");
      
      var hasPurchasedAndDelivered = false;
      var deliveryTimeMs = 0;

      if (ordersSheet) {
        var oRows = ordersSheet.getDataRange().getValues();
        for (var i = 1; i < oRows.length; i++) {
          var rowEmail = oRows[i][4] ? oRows[i][4].toString().trim().toLowerCase() : "";
          var rowStatus = oRows[i][10] ? oRows[i][10].toString() : "";
          var itemsJsonStr = oRows[i][27] || "[]";
          var itemSummary = oRows[i][6] || "";

          if (rowEmail === userEmail && rowStatus.includes("Delivered")) {
            var isMatch = false;
            try {
              var parsedList = JSON.parse(itemsJsonStr);
              for (var p = 0; p < parsedList.length; p++) {
                if (parsedList[p].id === productId) {
                  isMatch = true;
                  break;
                }
              }
            } catch(e) {
              if (itemSummary.toLowerCase().includes(data.productName ? data.productName.toLowerCase() : "")) {
                isMatch = true;
              }
            }

            if (isMatch) {
              hasPurchasedAndDelivered = true;
              deliveryTimeMs = Number(oRows[i][16]) || Date.now();
              break;
            }
          }
        }
      }

      if (!hasPurchasedAndDelivered) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "🚫 You can only review products that you have purchased and successfully received." })).setMimeType(ContentService.MimeType.JSON);
      }

      var sixHoursMs = 6 * 60 * 60 * 1000;
      var nowMs = Date.now();
      if (nowMs - deliveryTimeMs > sixHoursMs) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "⏰ Review window expired: Feedback can only be posted within 6 hours of product delivery." })).setMimeType(ContentService.MimeType.JSON);
      }

      var rows = revSheet.getDataRange().getValues();
      var existingReviewRow = -1;
      var reviewId = data.reviewId || ("REV-" + Date.now());

      for (var r = 1; r < rows.length; r++) {
        var rEmail = rows[r][3] ? rows[r][3].toString().trim().toLowerCase() : "";
        var rProdId = rows[r][1] ? rows[r][1].toString().trim() : "";
        var rId = rows[r][0] ? rows[r][0].toString().trim() : "";

        if (rId === data.reviewId || (rEmail === userEmail && rProdId === productId)) {
          existingReviewRow = r + 1;
          reviewId = rId || reviewId;
          break;
        }
      }

      var reviewDate = getIndianDateTimeString(nowMs);

      if (existingReviewRow !== -1 && action === "submitReview") {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "⚠️ You have already submitted a review for this product." })).setMimeType(ContentService.MimeType.JSON);
      }

      if (existingReviewRow !== -1) {
        revSheet.getRange(existingReviewRow, 1, 1, 8).setValues([[
          reviewId, productId, data.productName || "", userEmail, data.userName || "", rating, feedback, reviewDate
        ]]);
      } else {
        revSheet.appendRow([
          reviewId, productId, data.productName || "", userEmail, data.userName || "", rating, feedback, reviewDate
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", reviewId: reviewId })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "deleteReview") {
      var revSheet = ss.getSheetByName("Reviews");
      if (revSheet) {
        var rows = revSheet.getDataRange().getValues();
        for (var r = 1; r < rows.length; r++) {
          if (rows[r][0] && rows[r][0].toString().trim() === data.reviewId) {
            revSheet.deleteRow(r + 1);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // Validate Coupon Specific Scope & Usage Limits
    if (action === "validateCoupon") {
      var code = (data.code || "").trim().toUpperCase();
      var currentZoneId = (data.zoneId || "").trim();

      var cpnSheet = ss.getSheetByName("Coupons");
      if (!cpnSheet) return ContentService.createTextOutput(JSON.stringify({ valid: false, message: "Coupon not found." })).setMimeType(ContentService.MimeType.JSON);

      var cpData = cpnSheet.getDataRange().getValues();
      var foundCoupon = null;

      for (var k = 1; k < cpData.length; k++) {
        if (cpData[k][1] && cpData[k][1].toString().trim().toUpperCase() === code) {
          foundCoupon = {
            code: cpData[k][1],
            discountPercent: Number(cpData[k][2]) || 0,
            zoneScope: (cpData[k][4] || "all").toString().trim(),
            limit: Number(cpData[k][5]) || 0,
            used: Number(cpData[k][6]) || 0
          };
          break;
        }
      }

      if (!foundCoupon) {
        return ContentService.createTextOutput(JSON.stringify({ valid: false, message: "❌ Invalid coupon code." })).setMimeType(ContentService.MimeType.JSON);
      }

      if (foundCoupon.limit > 0 && foundCoupon.used >= foundCoupon.limit) {
        return ContentService.createTextOutput(JSON.stringify({ valid: false, message: `🚫 Coupon limit of ${foundCoupon.limit} uses reached.` })).setMimeType(ContentService.MimeType.JSON);
      }

      var scope = foundCoupon.zoneScope.toLowerCase();
      if (scope !== "all" && scope !== "" && scope !== currentZoneId.toLowerCase()) {
        return ContentService.createTextOutput(JSON.stringify({ 
          valid: false, 
          message: "🚫 This coupon is not valid for your current delivery zone." 
        })).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        valid: true, 
        discountPercent: foundCoupon.discountPercent,
        message: `✅ "${foundCoupon.code}" applied! ${foundCoupon.discountPercent}% OFF` 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Validate Session Token
    if (action === "validateSession") {
      var email = (data.email || "").trim().toLowerCase();
      var token = (data.sessionToken || "").trim();
      var type = data.type || "customer";
      var sheetName = type === "rider" ? "Riders" : "Users";
      var tokenCol = type === "rider" ? 10 : 13;
      var targetSheet = ss.getSheetByName(sheetName);
      var isValid = false;

      if (targetSheet && email && token) {
        var records = targetSheet.getDataRange().getValues();
        for (var u = 1; u < records.length; u++) {
          if (records[u][4] && records[u][4].toString().trim().toLowerCase() === email) {
            if (records[u][tokenCol] && records[u][tokenCol].toString().trim() === token) {
              isValid = true;
            }
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ valid: isValid })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Send Registration OTP
    if (action === "sendSignupOtp") {
      var email = (data.email || "").trim().toLowerCase();
      var role = data.role || "customer";
      if (!email || !email.includes("@")) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Valid email is required." })).setMimeType(ContentService.MimeType.JSON);
      }

      var targetSheet = ss.getSheetByName(role === "rider" ? "Riders" : "Users");
      if (targetSheet) {
        var records = targetSheet.getDataRange().getValues();
        for (var u = 1; u < records.length; u++) {
          if (records[u][4] && records[u][4].toString().trim().toLowerCase() === email) {
            return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "An account with this email already exists. Please Log In." })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      var otp = Math.floor(100000 + Math.random() * 900000).toString();
      cache.put("SIGNUP_OTP_" + email, otp, 600);

      try {
        MailApp.sendEmail({
          to: email,
          name: "Mohna Express",
          subject: otp + " is your Mohna Express verification code",
          body: "Your verification code is: " + otp + ". Valid for 10 minutes.",
          htmlBody: `
            <div style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:24px; border:1px solid #e2e8f0; border-radius:12px; max-width:440px; margin:auto; background:#ffffff;">
              <div style="font-size:20px; font-weight:800; color:#2563eb; margin-bottom:8px;">⚡ Mohna Express</div>
              <p style="color:#475569; font-size:14px; margin-bottom:16px;">Use the verification code below to complete registration:</p>
              <div style="font-size:32px; font-weight:900; letter-spacing:6px; text-align:center; padding:16px; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:8px; color:#0f172a; font-family:monospace;">${otp}</div>
              <p style="color:#94a3b8; font-size:12px; margin-top:16px;">Valid for 10 minutes. Do not share this code.</p>
            </div>
          `
        });
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "OTP sent to your email." })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Failed to send OTP: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 4. Complete Customer Signup
    if (action === "completeSignup") {
      var email = (data.email || "").trim().toLowerCase();
      var otp = (data.otp || "").toString().trim();
      var cachedOtp = cache.get("SIGNUP_OTP_" + email);

      if (!cachedOtp || cachedOtp !== otp) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid or expired verification OTP." })).setMimeType(ContentService.MimeType.JSON);
      }
      cache.remove("SIGNUP_OTP_" + email);

      var usersSheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
      var userId = "USR-" + Math.floor(100000 + Math.random() * 900000);
      var regDate = getIndianDateTimeString(Date.now());
      var regLat = data.lat || "";
      var regLng = data.lng || "";
      var sessionToken = "TOKEN_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      var username = String(data.username || ("user_" + Math.floor(1000 + Math.random() * 9000))).toLowerCase().replace(/[^a-z0-9_]/g, "");

      usersSheet.appendRow([
        userId, regDate, data.name || "Customer", String(data.phone || ""), email,
        data.password || "", regLat, regLng, regLat, regLng, regDate,
        "Active", "", sessionToken, 0, username
      ]);

      var userPayload = {
        id: userId, name: data.name, phone: data.phone, email: email,
        regLat: regLat, regLng: regLng, loginLat: regLat, loginLng: regLng,
        status: "Active", avatar: "", sessionToken: sessionToken, walletBalance: 0, username: username
      };

      return ContentService.createTextOutput(JSON.stringify({ status: "success", user: userPayload })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. Complete Rider Signup
    if (action === "completeRiderSignup") {
      var email = (data.email || "").trim().toLowerCase();
      var otp = (data.otp || "").toString().trim();
      var cachedOtp = cache.get("SIGNUP_OTP_" + email);

      if (!cachedOtp || cachedOtp !== otp) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid or expired verification OTP." })).setMimeType(ContentService.MimeType.JSON);
      }
      cache.remove("SIGNUP_OTP_" + email);

      var ridersSheet = ss.getSheetByName("Riders") || ss.insertSheet("Riders");
      var riderId = "RDR-" + Math.floor(100000 + Math.random() * 900000);
      var regDate = getIndianDateTimeString(Date.now());
      var vehicle = data.vehicle || "Motorcycle";

      ridersSheet.appendRow([
        riderId, regDate, data.name || "Rider Partner", String(data.phone || ""), email,
        data.password || "", vehicle, "Pending Verification", regDate, "", "", "", ""
      ]);

      return ContentService.createTextOutput(JSON.stringify({
        status: "pending_approval",
        message: "Registration submitted successfully! Your account is pending admin verification."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. Rider Password Login
    if (action === "riderPasswordLogin") {
      var email = (data.email || "").trim().toLowerCase();
      var password = (data.password || "").toString().trim();
      var loginDate = getIndianDateTimeString(Date.now());
      var ridersSheet = ss.getSheetByName("Riders") || ss.insertSheet("Riders");
      var riders = ridersSheet.getDataRange().getValues();
      var targetRow = -1;
      var riderObj = null;

      for (var i = 1; i < riders.length; i++) {
        var sheetEmail = riders[i][4] ? riders[i][4].toString().trim().toLowerCase() : "";
        var sheetPassword = riders[i][5] ? riders[i][5].toString().trim() : "";

        if (sheetEmail === email) {
          if (sheetPassword === password) {
            targetRow = i + 1;
            riderObj = {
              id: riders[i][0], date: riders[i][1], name: riders[i][2], phone: riders[i][3],
              email: riders[i][4], vehicle: riders[i][6], status: riders[i][7] || "Pending Verification",
              avatar: riders[i][9] || ""
            };
          } else {
            return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Incorrect password." })).setMimeType(ContentService.MimeType.JSON);
          }
          break;
        }
      }

      if (targetRow === -1 || !riderObj) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Rider account not found." })).setMimeType(ContentService.MimeType.JSON);
      }

      var normalizedStatus = (riderObj.status || "").toString().trim().toLowerCase();

      if (normalizedStatus.includes("pending")) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "blocked",
          rider: riderObj,
          message: "Profile pending approval. Verification mandatory."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (normalizedStatus.includes("block")) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "blocked",
          rider: riderObj,
          message: "Your rider partner account has been blocked."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var newSessionToken = "TOKEN_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      ridersSheet.getRange(targetRow, 9).setValue(loginDate);
      ridersSheet.getRange(targetRow, 11).setValue(newSessionToken);

      riderObj.lastLoginDate = loginDate;
      riderObj.sessionToken = newSessionToken;
      riderObj.status = "Active";

      return ContentService.createTextOutput(JSON.stringify({ status: "success", rider: riderObj, user: riderObj })).setMimeType(ContentService.MimeType.JSON);
    }

    // 7. Customer Password Login
    if (action === "userPasswordLogin") {
      var email = (data.email || "").trim().toLowerCase();
      var password = (data.password || "").toString().trim();
      var loginLat = data.lat || "";
      var loginLng = data.lng || "";
      var loginDate = getIndianDateTimeString(Date.now());
      var usersSheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
      var users = usersSheet.getDataRange().getValues();
      var targetRow = -1;
      var userObj = null;

      for (var i = 1; i < users.length; i++) {
        var sheetEmail = users[i][4] ? users[i][4].toString().trim().toLowerCase() : "";
        var sheetPassword = users[i][5] ? users[i][5].toString().trim() : "";

        if (sheetEmail === email) {
          if (sheetPassword === password) {
            targetRow = i + 1;
            userObj = {
              id: users[i][0], date: users[i][1], name: users[i][2], phone: users[i][3],
              email: users[i][4], regLat: users[i][6], regLng: users[i][7],
              status: users[i][11] || "Active", avatar: users[i][12] || "",
              walletBalance: Number(users[i][14]) || 0, username: users[i][15] || ""
            };
          } else {
            return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Incorrect password." })).setMimeType(ContentService.MimeType.JSON);
          }
          break;
        }
      }

      if (targetRow === -1 || !userObj) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Account not found." })).setMimeType(ContentService.MimeType.JSON);
      }

      if ((userObj.status || "").toString().toLowerCase().includes("block")) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Account suspended." })).setMimeType(ContentService.MimeType.JSON);
      }

      var newSessionToken = "TOKEN_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      usersSheet.getRange(targetRow, 9).setValue(loginLat);
      usersSheet.getRange(targetRow, 10).setValue(loginLng);
      usersSheet.getRange(targetRow, 11).setValue(loginDate);
      usersSheet.getRange(targetRow, 14).setValue(newSessionToken);

      userObj.loginLat = loginLat;
      userObj.loginLng = loginLng;
      userObj.lastLoginDate = loginDate;
      userObj.sessionToken = newSessionToken;

      return ContentService.createTextOutput(JSON.stringify({ status: "success", user: userObj })).setMimeType(ContentService.MimeType.JSON);
    }

    // 8. Check Rider Status
    if (action === "checkRiderStatus") {
      var email = (data.email || "").trim().toLowerCase();
      var ridersSheet = ss.getSheetByName("Riders");
      var riderStatus = "Pending Verification";

      if (ridersSheet) {
        var rData = ridersSheet.getDataRange().getValues();
        for (var i = 1; i < rData.length; i++) {
          if (rData[i][4] && rData[i][4].toString().trim().toLowerCase() === email) {
            riderStatus = rData[i][7] || "Pending Verification";
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", riderStatus: riderStatus })).setMimeType(ContentService.MimeType.JSON);
    }

    // 9. Fetch Orders Feed
    if (action === "getRiderOrders" || action === "getOrders") {
      var ordersSheet = ss.getSheetByName("Orders");
      var oData = ordersSheet ? ordersSheet.getDataRange().getValues() : [];
      var orders = [];
      for (var i = 1; i < oData.length; i++) {
        if (oData[i][0]) {
          var startMs = Number(oData[i][24]) || new Date(oData[i][1]).getTime();
          var parsedItems = [];
          try {
            if (oData[i][27]) parsedItems = JSON.parse(oData[i][27]);
          } catch(e) {}

          orders.push({
            orderId: oData[i][0],
            date: oData[i][1],
            orderTimestampMs: startMs,
            name: oData[i][2],
            phone: oData[i][3],
            email: oData[i][4],
            address: oData[i][5],
            item: oData[i][6],
            qty: oData[i][7],
            amount: oData[i][8],
            paymentId: oData[i][9],
            status: oData[i][10],
            coords: oData[i][11],
            mapsUrl: oData[i][12],
            etaMinutes: Number(oData[i][13]) || 20,
            expiryTimestamp: Number(oData[i][14]) || (startMs + (Number(oData[i][13]) || 20) * 60000),
            receiptPdfUrl: oData[i][15] || "",
            deliveredTimestamp: Number(oData[i][16]) || 0,
            subtotal: oData[i][17] || oData[i][8],
            discount: oData[i][18] || "₹0",
            deliveryFee: oData[i][19] || "FREE",
            riderName: oData[i][20] || "",
            riderPhone: oData[i][21] || "",
            riderCoords: oData[i][22] || "",
            walletDiscount: oData[i][23] || "₹0",
            parcelToken: (oData[i][25] || "").toString().replace(/^'+/, ''),
            deliveryToken: (oData[i][26] || "").toString().replace(/^'+/, ''),
            items: parsedItems
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ orders: orders.reverse() })).setMimeType(ContentService.MimeType.JSON);
    }

    // 10. Update Live Rider Telemetry
    if (action === "updateRiderTelemetry") {
      var rEmail = (data.email || "").trim().toLowerCase();
      var rLat = data.lat || "";
      var rLng = data.lng || "";
      var ridersSheet = ss.getSheetByName("Riders");
      if (ridersSheet && rEmail) {
        var rRows = ridersSheet.getDataRange().getValues();
        for (var r = 1; r < rRows.length; r++) {
          if (rRows[r][4] && rRows[r][4].toString().trim().toLowerCase() === rEmail) {
            ridersSheet.getRange(r + 1, 12).setValue(rLat);
            ridersSheet.getRange(r + 1, 13).setValue(rLng);
            break;
          }
        }
      }

      var ordersSheet = ss.getSheetByName("Orders");
      if (ordersSheet && rEmail) {
        var oRows = ordersSheet.getDataRange().getValues();
        for (var o = 1; o < oRows.length; o++) {
          if (oRows[o][10] && oRows[o][10].toString().includes("OUT") && oRows[o][20] && oRows[o][20].toString().trim() !== "") {
            ordersSheet.getRange(o + 1, 23).setValue(rLat + "," + rLng);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 11. Fetch Users Database
    if (action === "getUsers") {
      var usersSheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
      var uData = usersSheet.getDataRange().getValues();
      var users = [];
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][0]) {
          users.push({
            id: uData[i][0],
            date: uData[i][1],
            name: uData[i][2],
            phone: uData[i][3],
            email: uData[i][4],
            regLat: uData[i][6],
            regLng: uData[i][7],
            loginLat: uData[i][8],
            loginLng: uData[i][9],
            lastLoginDate: uData[i][10],
            status: uData[i][11] || "Active",
            avatar: uData[i][12] || "",
            walletBalance: Number(uData[i][14]) || 0,
            username: uData[i][15] || ""
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ users: users.reverse() })).setMimeType(ContentService.MimeType.JSON);
    }

    // 12. Fetch Riders Database
    if (action === "getRiders") {
      var ridersSheet = ss.getSheetByName("Riders") || ss.insertSheet("Riders");
      var rData = ridersSheet.getDataRange().getValues();
      var riders = [];
      for (var i = 1; i < rData.length; i++) {
        if (rData[i][0]) {
          riders.push({
            id: rData[i][0],
            date: rData[i][1],
            name: rData[i][2],
            phone: rData[i][3],
            email: rData[i][4],
            vehicle: rData[i][6] || "Bike",
            status: rData[i][7] || "Pending Verification",
            lastLoginDate: rData[i][8] || "",
            avatar: rData[i][9] || "",
            liveLat: rData[i][11] || "",
            liveLng: rData[i][12] || ""
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ riders: riders.reverse() })).setMimeType(ContentService.MimeType.JSON);
    }

    // 13. Toggle Rider Verification / Block Status
    if (action === "toggleRiderStatus") {
      var ridersSheet = ss.getSheetByName("Riders");
      if (ridersSheet) {
        var rows = ridersSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          var rId = rows[i][0] ? rows[i][0].toString().trim() : "";
          var rEmail = rows[i][4] ? rows[i][4].toString().trim().toLowerCase() : "";
          if (rId === (data.riderId || "").toString().trim() || rEmail === (data.email || "").toString().trim().toLowerCase()) {
            ridersSheet.getRange(i + 1, 8).setValue(data.newStatus);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 14. Assign Rider to Order (Continuous QR Scan or Manual)
    if (action === "assignRiderToOrder" || action === "assignRiderViaScan") {
      var ordersSheet = ss.getSheetByName("Orders");
      var orderId = (data.orderId || "").toString().trim();
      var parcelToken = (data.parcelToken || "").toString().replace(/^'+/, '').trim().toLowerCase();
      var riderName = data.riderName || "Delivery Partner";
      var riderPhone = data.riderPhone || "";

      if (ordersSheet) {
        var rows = ordersSheet.getDataRange().getValues();
        var headers = rows[0];
        var colOrderId = 0;
        var colParcelToken = headers.indexOf("Parcel Token") !== -1 ? headers.indexOf("Parcel Token") : 25;
        var colStatus = headers.indexOf("Status") !== -1 ? headers.indexOf("Status") : 10;
        var colRiderName = 20;
        var colRiderPhone = 21;

        for (var i = 1; i < rows.length; i++) {
          if (rows[i][colOrderId].toString().trim() === orderId) {
            var currentStatus = (rows[i][colStatus] || "").toString();
            var expectedToken = (rows[i][colParcelToken] || "").toString().replace(/^'+/, '').trim().toLowerCase();

            if (!currentStatus.includes("PACKED")) {
              return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Order #" + orderId + " is not packed yet." })).setMimeType(ContentService.MimeType.JSON);
            }

            if (parcelToken && expectedToken && parcelToken !== expectedToken) {
              return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Cryptographic validation failed for Order #" + orderId })).setMimeType(ContentService.MimeType.JSON);
            }

            ordersSheet.getRange(i + 1, colStatus + 1).setValue("OUT FOR DELIVERY");
            ordersSheet.getRange(i + 1, colRiderName + 1).setValue(riderName);
            ordersSheet.getRange(i + 1, colRiderPhone + 1).setValue(riderPhone);
            return ContentService.createTextOutput(JSON.stringify({ status: "success", orderId: orderId })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Order not found." })).setMimeType(ContentService.MimeType.JSON);
    }

    // 14.5. Update Order Status
    if (action === "updateOrderStatus") {
      var ordersSheet = ss.getSheetByName("Orders");
      var orderId = data.orderId;
      var newStatus = data.newStatus || "PACKED & READY FOR PICKUP";

      if (ordersSheet) {
        var rows = ordersSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == orderId) {
            ordersSheet.getRange(i + 1, 11).setValue(newStatus);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 15. Update Profile Picture in Drive
    if (action === "updateUserProfilePic") {
      var usersSheet = ss.getSheetByName("Users");
      var email = (data.email || "").trim().toLowerCase();
      var newAvatarUrl = "";

      if (data.imageBase64 && data.imageBase64.length > 20) {
        newAvatarUrl = saveBase64ImageToDrive(data.imageBase64, "avatar_" + Date.now() + ".jpg", "Mohna_Media_Drive");
      }

      if (usersSheet) {
        var rows = usersSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][4].toString().trim().toLowerCase() === email) {
            usersSheet.getRange(i + 1, 13).setValue(newAvatarUrl);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", avatarUrl: newAvatarUrl })).setMimeType(ContentService.MimeType.JSON);
    }

    // 16. Send 4-Digit Handover PIN to Customer Email
    if (action === "sendDeliveryOtp") {
      var orderId = data.orderId;
      var ordersSheet = ss.getSheetByName("Orders");
      var targetEmail = "", targetName = "";

      if (ordersSheet) {
        var rows = ordersSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == orderId) {
            targetEmail = rows[i][4];
            targetName = rows[i][2];
            break;
          }
        }
      }

      if (!targetEmail || !targetEmail.includes("@")) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Customer email not found for this order." })).setMimeType(ContentService.MimeType.JSON);
      }

      var deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
      cache.put("DELIV_OTP_" + orderId, deliveryOtp, 1800);

      var emailParts = targetEmail.split("@");
      var namePart = emailParts[0];
      var maskedName = namePart.length > 3 ? (namePart.slice(0, 2) + "*******" + namePart.slice(-2)) : (namePart + "***");
      var maskedEmailHint = maskedName + "@" + emailParts[1];

      try {
        MailApp.sendEmail({
          to: targetEmail,
          name: "Mohna Express Delivery",
          subject: "Your Delivery PIN for Order " + orderId + " is " + deliveryOtp,
          body: "Hi " + targetName + ",\n\nYour delivery partner has arrived with Order " + orderId + ".\n\nPlease share this 4-digit PIN to collect your parcel:\n" + deliveryOtp + "\n\nThank you.",
          htmlBody: `
            <div style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:24px; border:1px solid #e2e8f0; border-radius:12px; max-width:440px; margin:auto; background:#ffffff;">
              <div style="font-size:18px; font-weight:800; color:#16a34a; margin-bottom:6px;">🛵 Delivery Partner Has Arrived!</div>
              <p style="color:#334155; font-size:14px; margin-bottom:12px;">Hi <b>${targetName}</b>, share this PIN with your rider to receive your parcel:</p>
              <div style="font-size:34px; font-weight:900; letter-spacing:8px; text-align:center; padding:14px; background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; color:#15803d; font-family:monospace;">${deliveryOtp}</div>
              <div style="margin-top:14px; padding:10px; background:#f8fafc; border-radius:6px; font-size:12px; color:#64748b;">
                <b>Order ID:</b> ${orderId}<br>
                Inspect your parcel before sharing the code.
              </div>
            </div>
          `
        });
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Delivery PIN sent to customer email.", emailHint: maskedEmailHint })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Mail Error: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 17. Verify Delivery Handover (Dual: 2-Step QR Verification OR PIN)
    if (action === "verifyDeliveryOtp" || action === "verifyTwoFactorQrDelivery") {
      var orderId = (data.orderId || "").toString().trim();
      var ordersSheet = ss.getSheetByName("Orders");
      var deliveredTimestamp = Date.now();
      var orderCustEmail = "";
      var orderExpiry = 0;
      var isVerified = false;

      if (!ordersSheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Orders sheet not found." })).setMimeType(ContentService.MimeType.JSON);
      }

      var rVals = ordersSheet.getDataRange().getValues();
      var headers = rVals[0];

      var colOrderId = 0;
      var colParcelToken = headers.indexOf("Parcel Token") !== -1 ? headers.indexOf("Parcel Token") : 25;
      var colDeliveryToken = headers.indexOf("Delivery Token") !== -1 ? headers.indexOf("Delivery Token") : 26;
      var colStatus = headers.indexOf("Status") !== -1 ? headers.indexOf("Status") : 10;
      var colDeliveredTime = headers.indexOf("Delivered Timestamp") !== -1 ? headers.indexOf("Delivered Timestamp") : 16;
      var colCustEmail = headers.indexOf("Email") !== -1 ? headers.indexOf("Email") : 4;
      var colExpiry = headers.indexOf("Expiry Timestamp") !== -1 ? headers.indexOf("Expiry Timestamp") : 14;

      if (action === "verifyDeliveryOtp") {
        var enteredOtp = (data.otp || "").toString().trim();
        var cachedOtp = cache.get("DELIV_OTP_" + orderId);
        if (cachedOtp && cachedOtp === enteredOtp) {
          isVerified = true;
          cache.remove("DELIV_OTP_" + orderId);
        } else {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid delivery PIN." })).setMimeType(ContentService.MimeType.JSON);
        }
      } else if (action === "verifyTwoFactorQrDelivery") {
        var scannedParcelToken = (data.parcelToken || "").toString().replace(/^'+/, '').trim().toLowerCase();
        var scannedDeliveryToken = (data.deliveryToken || "").toString().replace(/^'+/, '').trim().toLowerCase();

        var targetRowIndex = -1;
        for (var r = 1; r < rVals.length; r++) {
          if (rVals[r][colOrderId].toString().trim() === orderId) {
            targetRowIndex = r;
            var rawExpectedParcel = (rVals[r][colParcelToken] || "").toString().replace(/^'+/, '').trim().toLowerCase();
            var rawExpectedDelivery = (rVals[r][colDeliveryToken] || "").toString().replace(/^'+/, '').trim().toLowerCase();

            if (!rawExpectedParcel || !rawExpectedDelivery) {
              rawExpectedParcel = generateSecureToken(orderId, "PARCEL_LABEL").toLowerCase();
              rawExpectedDelivery = generateSecureToken(orderId, "CUSTOMER_HANDOVER").toLowerCase();
              ordersSheet.getRange(r + 1, colParcelToken + 1).setValue("'" + rawExpectedParcel);
              ordersSheet.getRange(r + 1, colDeliveryToken + 1).setValue("'" + rawExpectedDelivery);
            }

            if (scannedParcelToken === rawExpectedParcel && scannedDeliveryToken === rawExpectedDelivery) {
              isVerified = true;
            } else {
              Logger.log("Order: " + orderId);
              Logger.log("P-Expected: " + rawExpectedParcel + " | Got: " + scannedParcelToken);
              Logger.log("D-Expected: " + rawExpectedDelivery + " | Got: " + scannedDeliveryToken);
            }
            break;
          }
        }

        if (targetRowIndex === -1) {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Order ID not found." })).setMimeType(ContentService.MimeType.JSON);
        }

        if (!isVerified) {
          return ContentService.createTextOutput(JSON.stringify({ 
            status: "error", 
            message: "QR Verification failed: Scanned tokens do not match this order." 
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      if (isVerified) {
        var orderFound = false;
        for (var i = 1; i < rVals.length; i++) {
          if (rVals[i][colOrderId].toString().trim() === orderId) {
            orderFound = true;
            orderCustEmail = rVals[i][colCustEmail] ? rVals[i][colCustEmail].toString().trim().toLowerCase() : "";
            orderExpiry = Number(rVals[i][colExpiry]) || 0;
            ordersSheet.getRange(i + 1, colStatus + 1).setValue("Delivered (Verified)");
            ordersSheet.getRange(i + 1, colDeliveredTime + 1).setValue(deliveredTimestamp);
            break;
          }
        }

        if (!orderFound) {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Order ID not found in database." })).setMimeType(ContentService.MimeType.JSON);
        }

        if (orderCustEmail && orderExpiry > 0 && deliveredTimestamp > orderExpiry) {
          var usersSheet = ss.getSheetByName("Users");
          if (usersSheet) {
            var uRows = usersSheet.getDataRange().getValues();
            for (var u = 1; u < uRows.length; u++) {
              if (uRows[u][4] && uRows[u][4].toString().trim().toLowerCase() === orderCustEmail) {
                var currentBal = Number(uRows[u][14]) || 0;
                usersSheet.getRange(u + 1, 15).setValue(currentBal + 25);
                break;
              }
            }
          }
        }

        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          deliveredTimestamp: deliveredTimestamp 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 18. Save Order with Cryptographic Tokens & Itemized Breakdown
    if (action === "saveOrder") {
      var ordersSheet = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
      var prodSheet = ss.getSheetByName("Products");
      var usersSheet = ss.getSheetByName("Users");
      var cpnSheet = ss.getSheetByName("Coupons");

      if (data.appliedCouponCode && cpnSheet) {
        var cData = cpnSheet.getDataRange().getValues();
        for (var c = 1; c < cData.length; c++) {
          if (cData[c][1] && cData[c][1].toString().trim().toUpperCase() === data.appliedCouponCode.toUpperCase()) {
            var currentUsed = Number(cData[c][6]) || 0;
            cpnSheet.getRange(c + 1, 7).setValue(currentUsed + 1);
            break;
          }
        }
      }

      var mapsUrl = "https://www.google.com/maps/dir/?api=1&destination=" + (data.lat || "") + "," + (data.lng || "");
      
      var nowMs = Number(data.orderTimestampMs) || Date.now();
      var orderDate = getIndianDateTimeString(nowMs);
      var etaMinutes = parseInt(data.etaMinutes) || 20;
      var expiryTimestamp = nowMs + (etaMinutes * 60 * 1000);
      var targetExpectedTime = Utilities.formatDate(new Date(expiryTimestamp), "Asia/Kolkata", "hh:mm a");

      var subtotalStr = data.subtotal || data.amount || "₹0";
      var discountStr = data.discount || "₹0";
      var walletDiscountStr = data.walletDiscount || "₹0";
      var deliveryFeeStr = data.deliveryFee || "FREE";
      var customerEmail = (data.email || "").trim().toLowerCase();

      var parcelToken = generateSecureToken(data.orderId, "PARCEL_LABEL");
      var deliveryToken = generateSecureToken(data.orderId, "CUSTOMER_HANDOVER");
      var itemsArrayJson = data.cartItems && Array.isArray(data.cartItems) ? JSON.stringify(data.cartItems) : "[]";

      if (prodSheet && data.cartItems && Array.isArray(data.cartItems)) {
        var prodData = prodSheet.getDataRange().getValues();
        data.cartItems.forEach(function(cartItem) {
          for (var p = 1; p < prodData.length; p++) {
            if (prodData[p][0] == cartItem.id) {
              var currentStock = Number(prodData[p][7]) || 0;
              var newStock = Math.max(0, currentStock - (Number(cartItem.qty) || 1));
              prodSheet.getRange(p + 1, 8).setValue(newStock);
              break;
            }
          }
        });
      }

      if (usersSheet && customerEmail && data.walletDeduction && Number(data.walletDeduction) > 0) {
        var uRows = usersSheet.getDataRange().getValues();
        for (var u = 1; u < uRows.length; u++) {
          if (uRows[u][4] && uRows[u][4].toString().trim().toLowerCase() === customerEmail) {
            var currentBal = Number(uRows[u][14]) || 0;
            var updatedBal = Math.max(0, currentBal - Number(data.walletDeduction));
            usersSheet.getRange(u + 1, 15).setValue(updatedBal);
            break;
          }
        }
      }

      var pdfItemsRows = "";
      if (data.cartItems && Array.isArray(data.cartItems)) {
        data.cartItems.forEach(function(item) {
          pdfItemsRows += `<tr>
            <td>${item.name || ""}</td>
            <td style="text-align:center;">${item.qty || 1}</td>
            <td style="text-align:right;">₹${item.price || 0}</td>
            <td style="text-align:right;">₹${(item.price || 0) * (item.qty || 1)}</td>
          </tr>`;
        });
      } else {
        pdfItemsRows = `<tr><td>${data.item || ""}</td><td style="text-align:center;">${data.qty || 1}</td><td style="text-align:right;">${subtotalStr}</td><td style="text-align:right;">${subtotalStr}</td></tr>`;
      }

      var invoiceHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><style>
        body { font-family: Helvetica, Arial, sans-serif; padding: 25px; color: #1e293b; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; }
        .title { color: #2563eb; font-size: 22px; font-weight: bold; margin: 0; }
        .meta-table, .item-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .meta-table td { padding: 5px 0; font-size: 13px; }
        .item-table th { background: #f1f5f9; padding: 10px; font-size: 12px; text-align: left; }
        .item-table td { padding: 10px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
        .total-row td { font-size: 15px; font-weight: bold; color: #15803d; }
      </style></head>
      <body>
        <div class="header">
          <h1 class="title">⚡ MOHNA EXPRESS</h1>
          <p style="margin:2px 0; color:#64748b; font-size:12px;">Official Paid Tax Invoice & Itemized Delivery Voucher</p>
        </div>
        <table class="meta-table">
          <tr><td><b>Order ID:</b> ${data.orderId || ""}</td><td align="right"><b>Order Timestamp (IST):</b> ${orderDate}</td></tr>
          <tr><td><b>Customer Name:</b> ${data.name || ""}</td><td align="right"><b>Payment Ref:</b> ${data.paymentId || 'N/A'}</td></tr>
          <tr><td><b>Phone:</b> ${data.phone || ""}</td><td align="right"><b>Status:</b> PAID</td></tr>
          <tr><td colspan="2" style="padding-top:6px;"><b>Delivery Destination:</b> ${data.address || ""}</td></tr>
        </table>
        <table class="item-table">
          <thead>
            <tr><th>Item Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>
            ${pdfItemsRows}
            <tr><td colspan="3">Promo Coupon Discount</td><td style="text-align:right; color:#dc2626;">-${discountStr}</td></tr>
            <tr><td colspan="3">Cashback Wallet Applied</td><td style="text-align:right; color:#16a34a;">-${walletDiscountStr}</td></tr>
            <tr><td colspan="3">Delivery Fee</td><td style="text-align:right;">${deliveryFeeStr}</td></tr>
            <tr class="total-row"><td colspan="3">Grand Total Paid</td><td style="text-align:right;">${data.amount || "₹0"}</td></tr>
          </tbody>
        </table>
        <p style="text-align:center; font-size:11px; color:#94a3b8; margin-top:30px;">
          Guaranteed Delivery by ${targetExpectedTime}.
        </p>
      </body></html>`;

      var pdfFileName = "Invoice_" + (data.orderId || Date.now()) + ".pdf";
      var pdfBlob = Utilities.newBlob(invoiceHtml, "text/html", "invoice.html").getAs("application/pdf").setName(pdfFileName);
      var receiptPdfUrl = "";

      try {
        var receiptFolders = DriveApp.getFoldersByName("Mohna_Order_Receipts");
        var receiptFolder = receiptFolders.hasNext() ? receiptFolders.next() : DriveApp.createFolder("Mohna_Order_Receipts");
        receiptFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var driveFile = receiptFolder.createFile(pdfBlob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        receiptPdfUrl = driveFile.getDownloadUrl() || "https://drive.google.com/uc?export=download&id=" + driveFile.getId();
      } catch (dErr) {
        Logger.log("Receipt Drive Save Notice: " + dErr.toString());
      }

      ordersSheet.appendRow([
        data.orderId || "", orderDate, data.name || "", String(data.phone || ""), data.email || "",
        data.address || "", data.item || "", data.qty || "", data.amount || "", data.paymentId || "",
        "PAID (Verified)", (data.lat || "") + ", " + (data.lng || ""), mapsUrl, etaMinutes, expiryTimestamp, receiptPdfUrl, "",
        subtotalStr, discountStr, deliveryFeeStr, "", "", "", walletDiscountStr, nowMs, "'" + parcelToken, "'" + deliveryToken, itemsArrayJson
      ]);

      if (data.email && data.email.includes("@")) {
        try {
          var cleanPhone = String(data.phone || "").replace(/[^0-9]/g, "");
          var whatsappSupport = "https://wa.me/91" + cleanPhone.slice(-10) + "?text=" + encodeURIComponent("Hi Mohna Express Support, need help with Order: " + (data.orderId || ""));

          var emailHtml = `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"></head>
          <body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:25px 10px;">
              <tr><td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
                  <tr><td align="center" style="background-color:#2563eb; padding:30px 20px; color:#ffffff;">
                    <h1 style="margin:0; font-size:24px; font-weight:800;">⚡ Mohna Express</h1>
                    <p style="margin:4px 0 0; font-size:13px; opacity:0.95;">Fast ${etaMinutes} Min Delivery Guarantee</p>
                  </td></tr>
                  <tr><td style="padding:24px 28px 10px;">
                    <span style="background-color:#dcfce7; color:#166534; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700;">● PAYMENT CONFIRMED</span>
                    <h2 style="margin:12px 0 4px; font-size:22px; color:#0f172a;">Thanks for your order, ${data.name || "Valued Customer"}!</h2>
                    <p style="margin:0; font-size:13.5px; color:#64748b;">We've received your payment and our dispatch hub is packing your parcel.</p>
                  </td></tr>
                  <tr><td style="padding:10px 28px 6px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eff6ff; border:1.5px dashed #3b82f6; border-radius:10px; padding:14px; text-align:center;">
                      <tr><td align="center">
                        <span style="font-size:11px; font-weight:700; color:#1e40af; text-transform:uppercase; letter-spacing:0.5px;">⚡ LIVE ORDER COUNTDOWN STARTED</span>
                        <div style="font-size:26px; font-weight:900; color:#1d4ed8; margin:6px 0; font-family:monospace;">⏱️ ${etaMinutes}:00 MINS</div>
                        <div style="font-size:12px; color:#475569; font-weight:600;">Guaranteed Arrival By: <b style="color:#0f172a;">${targetExpectedTime}</b></div>
                      </td></tr>
                    </table>
                  </td></tr>
                  <tr><td style="padding:12px 28px 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px;">
                      <tr><td style="color:#64748b; font-size:13px;">Order ID:</td><td align="right" style="font-weight:700; color:#0f172a;">${data.orderId || ""}</td></tr>
                      <tr><td style="color:#64748b; font-size:13px;">Timestamp (IST):</td><td align="right" style="font-weight:600; color:#475569;">${orderDate}</td></tr>
                      <tr><td style="color:#64748b; font-size:13px;">Transaction Ref:</td><td align="right" style="font-weight:600; color:#2563eb;">${data.paymentId || 'N/A'}</td></tr>
                      <tr><td style="color:#64748b; font-size:13px;">Estimated Arrival:</td><td align="right" style="font-weight:700; color:#16a34a;">⚡ ${etaMinutes} Mins</td></tr>
                    </table>
                  </td></tr>
                  <tr><td style="padding:0 28px 16px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr style="border-bottom:1px solid #e2e8f0;"><th align="left" style="font-size:11px; color:#64748b;">ITEM</th><th align="center" style="font-size:11px; color:#64748b;">QTY</th><th align="right" style="font-size:11px; color:#64748b;">TOTAL</th></tr>
                      <tr><td style="padding:10px 0; font-weight:600;">${data.item || ""}</td><td align="center">${data.qty || 1}</td><td align="right" style="font-weight:600;">${subtotalStr}</td></tr>
                      <tr><td colspan="2" style="font-size:12px; color:#64748b;">Promo Coupon Discount:</td><td align="right" style="color:#dc2626;">-${discountStr}</td></tr>
                      <tr><td colspan="2" style="font-size:12px; color:#64748b;">Cashback Wallet Applied:</td><td align="right" style="color:#16a34a;">-${walletDiscountStr}</td></tr>
                      <tr><td colspan="2" style="font-size:12px; color:#64748b;">Delivery Fee:</td><td align="right">${deliveryFeeStr}</td></tr>
                      <tr style="border-top:1px solid #e2e8f0;"><td colspan="2" style="padding-top:10px; font-weight:700;">Grand Total Paid:</td><td align="right" style="padding-top:10px; font-size:18px; font-weight:800; color:#16a34a;">${data.amount || "₹0"}</td></tr>
                    </table>
                  </td></tr>
                  <tr><td style="padding:0 28px 20px;">
                    <a href="${mapsUrl}" target="_blank" style="display:block; background-color:#2563eb; color:#ffffff; text-decoration:none; padding:12px; border-radius:8px; font-weight:700; font-size:14px; text-align:center;">🗺️ View Delivery Coordinates on Google Maps</a>
                  </td></tr>
                  <tr><td style="padding:0 28px 24px; text-align:center;">
                    <a href="${whatsappSupport}" target="_blank" style="display:inline-block; background-color:#16a34a; color:#ffffff; text-decoration:none; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:700;">💬 Contact WhatsApp Support</a>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body></html>`;

          MailApp.sendEmail({
            to: data.email,
            name: "Mohna Express",
            subject: "⚡ Order Confirmed: " + data.orderId + " (" + etaMinutes + "-Min Countdown Started)",
            htmlBody: emailHtml,
            attachments: [pdfBlob]
          });
        } catch (err) {
          Logger.log("Email Delivery Notice: " + err.toString());
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        expiryTimestamp: expiryTimestamp, 
        etaMinutes: etaMinutes,
        receiptPdfUrl: receiptPdfUrl,
        deliveryToken: deliveryToken
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 19. Products, Categories, Zones, Coupons, Reviews
    if (action === "getProducts") {
      var pSheet = ss.getSheetByName("Products") || ss.insertSheet("Products");
      var pData = pSheet.getDataRange().getValues();
      var prods = [];
      for (var i = 1; i < pData.length; i++) {
        if (pData[i][0]) {
          var galleryImgs = [];
          try {
            if (pData[i][13]) galleryImgs = JSON.parse(pData[i][13]);
          } catch(e) {}

          prods.push({
            id: pData[i][0],
            name: pData[i][1],
            category: pData[i][2],
            scope: (pData[i][3] || "both").toString().trim().toLowerCase(),
            retailPrice: pData[i][4],
            wholesalePrice: pData[i][5],
            mrp: pData[i][6],
            stockQty: pData[i][7],
            deliveryFee: pData[i][8],
            description: pData[i][9],
            specifications: pData[i][10],
            terms: pData[i][11],
            img: pData[i][12],
            gallery: galleryImgs
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ products: prods })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "addProduct" || action === "updateProduct") {
      var prodSheet = ss.getSheetByName("Products") || ss.insertSheet("Products");
      var prodId = data.id || ("PRD-" + Date.now());
      var finalThumbnailUrl = data.img || "";
      var galleryUrls = [];

      if (data.imageBase64 && data.imageBase64.length > 20) {
        finalThumbnailUrl = saveBase64ImageToDrive(data.imageBase64, "prod_thumb_" + Date.now() + ".jpg", "Mohna_Media_Drive");
      }

      if (data.galleryImagesBase64 && Array.isArray(data.galleryImagesBase64)) {
        data.galleryImagesBase64.forEach(function(base64Str, idx) {
          if (base64Str && base64Str.length > 20) {
            var gUrl = saveBase64ImageToDrive(base64Str, "prod_gallery_" + Date.now() + "_" + idx + ".jpg", "Mohna_Media_Drive");
            if (gUrl) galleryUrls.push(gUrl);
          }
        });
      }

      var rows = prodSheet.getDataRange().getValues();
      var targetRowIdx = -1;
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0].toString().trim() === prodId.toString().trim()) {
          targetRowIdx = i + 1;
          break;
        }
      }

      if (targetRowIdx !== -1) {
        if (!finalThumbnailUrl) finalThumbnailUrl = rows[targetRowIdx - 1][12];
        if (galleryUrls.length === 0) {
          try { galleryUrls = JSON.parse(rows[targetRowIdx - 1][13] || "[]"); } catch(e) { galleryUrls = []; }
        }

        prodSheet.getRange(targetRowIdx, 1, 1, 14).setValues([[
          prodId,
          data.name || "",
          data.category || "",
          data.scope || "both",
          data.retailPrice || 0,
          data.wholesalePrice || 0,
          data.mrp || data.retailPrice || 0,
          data.stockQty || 0,
          data.deliveryFee || 0,
          data.description || "",
          data.specifications || "",
          data.terms || "",
          finalThumbnailUrl,
          JSON.stringify(galleryUrls)
        ]]);
      } else {
        prodSheet.appendRow([
          prodId, data.name || "", data.category || "", data.scope || "both",
          data.retailPrice || 0, data.wholesalePrice || 0, data.mrp || data.retailPrice || 0,
          data.stockQty || 0, data.deliveryFee || 0, data.description || "",
          data.specifications || "", data.terms || "", finalThumbnailUrl, JSON.stringify(galleryUrls)
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: prodId, img: finalThumbnailUrl, gallery: galleryUrls })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "deleteProduct") {
      var prodSheet = ss.getSheetByName("Products");
      if (prodSheet) {
        var rows = prodSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.id) { prodSheet.deleteRow(i + 1); break; }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getCategories") {
      var catSheet = ss.getSheetByName("Categories") || ss.insertSheet("Categories");
      var cData = catSheet.getDataRange().getValues();
      var cats = [];
      for (var i = 1; i < cData.length; i++) {
        if (cData[i][0]) cats.push({ id: cData[i][0], name: cData[i][1], slug: cData[i][2], scope: (cData[i][3] || "both").toString().trim().toLowerCase() });
      }
      return ContentService.createTextOutput(JSON.stringify({ categories: cats })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "addCategory") {
      var catSheet = ss.getSheetByName("Categories") || ss.insertSheet("Categories");
      var catId = "CAT-" + Date.now();
      var safeName = String(data.name || "");
      var slug = safeName.toLowerCase().replace(/[^a-z0-9]/g, "");
      catSheet.appendRow([catId, safeName, slug, data.scope || "both"]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: catId, slug: slug })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "deleteCategory") {
      var catSheet = ss.getSheetByName("Categories");
      if (catSheet) {
        var rows = catSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.id) { catSheet.deleteRow(i + 1); break; }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getZone") {
      var settingsSheet = ss.getSheetByName("Settings");
      var zoneData = settingsSheet ? settingsSheet.getRange("A1").getValue() : null;
      var parsedZone = null;
      if (zoneData) {
        try { parsedZone = (typeof zoneData === "string") ? JSON.parse(zoneData) : zoneData; } catch (err) { parsedZone = null; }
      }
      return ContentService.createTextOutput(JSON.stringify({ zone: parsedZone })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "saveZone") {
      var settingsSheet = ss.getSheetByName("Settings") || ss.insertSheet("Settings");
      settingsSheet.getRange("A1").setValue(JSON.stringify(data.zone || {}));
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "clearZone") {
      var settingsSheet = ss.getSheetByName("Settings");
      if (settingsSheet) settingsSheet.getRange("A1").clearContent();
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getCoupons") {
      var cpnSheet = ss.getSheetByName("Coupons") || ss.insertSheet("Coupons");
      var cpData = cpnSheet.getDataRange().getValues();
      var cpns = [];
      for (var i = 1; i < cpData.length; i++) {
        if (cpData[i][0]) cpns.push({ id: cpData[i][0], code: cpData[i][1], discountPercent: cpData[i][2], validUntil: cpData[i][3], zoneScope: cpData[i][4], limit: Number(cpData[i][5]) || 0, used: Number(cpData[i][6]) || 0 });
      }
      return ContentService.createTextOutput(JSON.stringify({ coupons: cpns })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "addCoupon") {
      var cpnSheet = ss.getSheetByName("Coupons") || ss.insertSheet("Coupons");
      var cpnId = "CPN-" + Date.now();
      var limit = Number(data.usageLimit) || 0;
      var code = String(data.code || "").toUpperCase();
      cpnSheet.appendRow([cpnId, code, data.discountPercent, data.validUntil, data.zoneScope, limit, 0]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: cpnId })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "deleteCoupon") {
      var cpnSheet = ss.getSheetByName("Coupons");
      if (cpnSheet) {
        var rows = cpnSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.id || rows[i][1] == data.code) { cpnSheet.deleteRow(i + 1); break; }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "toggleUserStatus") {
      var usersSheet = ss.getSheetByName("Users");
      if (usersSheet) {
        var rows = usersSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (rows[i][0] == data.userId || rows[i][4] == data.email || rows[i][3] == data.phone) {
            usersSheet.getRange(i + 1, 12).setValue(data.newStatus);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
