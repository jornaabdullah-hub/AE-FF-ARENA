import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

// ===============================
// FIREBASE INITIALIZATION
// ===============================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isSignup = true;
let tournamentsCache = [];
let unsubscribePlayer = [];
let unsubscribeAdmin = [];

const $ = id => document.getElementById(id);

function showMessage(id, message, success = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = success ? "#80d99c" : "#ff7777";
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function openModal(id) {
  $(id)?.classList.add("active");
}

function closeModal(id) {
  $(id)?.classList.remove("active");
}

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => closeModal(button.dataset.close));
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.classList.remove("active");
  });
});

$("menuToggle")?.addEventListener("click", () => {
  $("mainNav")?.classList.toggle("open");
});

document.querySelectorAll("#mainNav a").forEach(link => {
  link.addEventListener("click", () => $("mainNav")?.classList.remove("open"));
});

// ===============================
// AUTH MODALS
// ===============================

function setAuthMode(signup) {
  isSignup = signup;

  $("playerModalTitle").textContent = signup ? "CREATE ACCOUNT" : "PLAYER LOGIN";
  $("playerSubmitBtn").textContent = signup ? "Create Account" : "Login";
  $("signupFields").classList.toggle("hidden", !signup);

  $("playerName").required = signup;
  $("playerFFUID").required = signup;
  $("playerPhone").required = signup;

  $("authSwitchText").innerHTML = signup
    ? 'Already have an account? <button id="switchAuthBtn" type="button">Login</button>'
    : 'New player? <button id="switchAuthBtn" type="button">Create Account</button>';

  $("switchAuthBtn").addEventListener("click", () => setAuthMode(!isSignup));
  showMessage("playerAuthMessage", "");
}

$("playerBtn")?.addEventListener("click", () => {
  setAuthMode(true);
  openModal("playerModal");
});

$("heroRegisterBtn")?.addEventListener("click", () => {
  setAuthMode(true);
  openModal("playerModal");
});

$("walletLoginBtn")?.addEventListener("click", () => {
  setAuthMode(false);
  openModal("playerModal");
});

$("playerAuthForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("playerEmail").value.trim();
  const password = $("playerPassword").value;

  try {
    if (isSignup) {
      const name = $("playerName").value.trim();
      const ffUID = $("playerFFUID").value.trim();
      const phone = $("playerPhone").value.trim();

      if (!name || !ffUID || !phone) {
        throw new Error("সব তথ্য পূরণ করো।");
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(result.user, { displayName: name });

      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: name,
        ffUID,
        phone,
        email,
        createdAt: serverTimestamp()
      });

      toast("Account তৈরি হয়েছে!");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      toast("Login successful!");
    }

    closeModal("playerModal");
    $("playerAuthForm").reset();
  } catch (error) {
    showMessage("playerAuthMessage", error.message);
  }
});

// ===============================
// AUTH STATE
// ===============================

onAuthStateChanged(auth, async user => {
  currentUser = user;

  unsubscribePlayer.forEach(unsubscribe => unsubscribe());
  unsubscribeAdmin.forEach(unsubscribe => unsubscribe());
  unsubscribePlayer = [];
  unsubscribeAdmin = [];

  if (!user) {
    $("walletLoggedOut").classList.remove("hidden");
    $("walletDashboard").classList.add("hidden");
    $("adminLogin").classList.remove("hidden");
    $("adminDashboard").classList.add("hidden");
    return;
  }

  if (isAdmin(user)) {
    $("adminLogin").classList.add("hidden");
    $("adminDashboard").classList.remove("hidden");
    $("walletLoggedOut").classList.remove("hidden");
    $("walletDashboard").classList.add("hidden");
    startAdminDashboard();
  } else {
    $("walletLoggedOut").classList.add("hidden");
    $("walletDashboard").classList.remove("hidden");
    $("walletPlayerName").textContent = user.displayName || user.email;
    startPlayerWallet(user.uid);
  }
});

function isAdmin(user) {
  return !!user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// ===============================
// ADMIN LOGIN / LOGOUT
// ===============================

$("adminBtn")?.addEventListener("click", () => {
  openModal("adminModal");
  if (currentUser && isAdmin(currentUser)) {
    $("adminLogin").classList.add("hidden");
    $("adminDashboard").classList.remove("hidden");
  }
});

$("adminLoginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const email = $("adminEmail").value.trim();

    if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      throw new Error("এই Email Admin Email নয়।");
    }

    await signInWithEmailAndPassword(auth, email, $("adminPassword").value);
    showMessage("adminLoginMessage", "Login successful!", true);
  } catch (error) {
    showMessage("adminLoginMessage", error.message);
  }
});

$("adminLogoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  closeModal("adminModal");
  toast("Admin logout হয়েছে।");
});

// ===============================
// TOURNAMENT LIST
// ===============================

function startTournamentListener() {
  const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, snapshot => {
    tournamentsCache = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderTournaments();
    renderAdminTournaments();
    renderRoomTournamentOptions();

    $("tournamentCount").textContent = tournamentsCache.length;
  }, error => {
    console.error(error);
    $("tournamentList").innerHTML = '<div class="empty-state">Tournament load হয়নি।</div>';
  });

  return unsubscribe;
}

function renderTournaments() {
  const container = $("tournamentList");
  if (!container) return;

  if (!tournamentsCache.length) {
    container.innerHTML = '<div class="empty-state">এখনো কোনো Tournament নেই।</div>';
    return;
  }

  container.innerHTML = tournamentsCache.map(t => `
    <article class="card">
      <span class="eyebrow">${escapeHTML(t.status || "Open")}</span>
      <h3>${escapeHTML(t.name)}</h3>
      <div class="tournament-info">
        <p>🎮 Mode: ${escapeHTML(t.mode || "Squad")}</p>
        <p>🏆 Prize: ৳${money(t.prize)}</p>
        <p>👥 Slots: ${escapeHTML(t.slots || 0)}</p>
        <p>📅 Date: ${escapeHTML(t.date || "Not set")}</p>
      </div>
      <button class="btn btn-primary full join-button"
        data-join="${escapeHTML(t.id)}"
        ${t.status === "Completed" ? "disabled" : ""}>
        Join Tournament
      </button>
    </article>
  `).join("");

  container.querySelectorAll("[data-join]").forEach(button => {
    button.addEventListener("click", () => openJoinForm(button.dataset.join));
  });
}

function openJoinForm(tournamentId) {
  $("joinTournamentId").value = tournamentId;
  $("joinForm").reset();
  $("joinTournamentId").value = tournamentId;

  if (currentUser && !isAdmin(currentUser)) {
    $("joinPlayerName").value = currentUser.displayName || "";
  }

  showMessage("joinMessage", "");
  openModal("joinModal");
}

$("joinForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const tournamentId = $("joinTournamentId").value;
    const tournament = tournamentsCache.find(t => t.id === tournamentId);

    if (!tournament) throw new Error("Tournament পাওয়া যায়নি।");
    if (tournament.status === "Completed") throw new Error("এই Tournament শেষ হয়েছে।");

    const ffUID = $("joinFFUID").value.trim();

    await addDoc(collection(db, "registrations"), {
      tournamentId,
      tournamentName: tournament.name,
      playerName: $("joinPlayerName").value.trim(),
      ffUID,
      contact: $("joinContact").value.trim(),
      playerUid: currentUser && !isAdmin(currentUser) ? currentUser.uid : null,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    showMessage("joinMessage", "Registration সফল হয়েছে!", true);
    toast("Tournament registration complete!");
    $("joinForm").reset();
  } catch (error) {
    showMessage("joinMessage", error.message);
  }
});

// ===============================
// PLAYER WALLET
// ===============================

function startPlayerWallet(uid) {
  const walletRef = doc(db, "wallets", uid);

  const unsubWallet = onSnapshot(walletRef, snapshot => {
    $("walletBalance").textContent = money(snapshot.data()?.balance || 0);
  });

  const unsubTransactions = onSnapshot(
    query(collection(db, "transactions"), where("uid", "==", uid), limit(50)),
    snapshot => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      $("transactionHistory").innerHTML = items.length
        ? items.map(item => `
          <div class="request-row">
            <span>${escapeHTML(item.description || item.type || "Transaction")}</span>
            <strong>৳${money(item.amount)}</strong>
          </div>
        `).join("")
        : "No transactions yet.";
    }
  );

  const unsubAdd = onSnapshot(
    query(collection(db, "add_money_requests"), where("uid", "==", uid)),
    snapshot => renderMyRequests(snapshot, "Add Money")
  );

  const unsubWithdraw = onSnapshot(
    query(collection(db, "withdraw_requests"), where("uid", "==", uid)),
    snapshot => renderMyRequests(snapshot, "Withdraw")
  );

  unsubscribePlayer.push(unsubWallet, unsubTransactions, unsubAdd, unsubWithdraw);
}

function renderMyRequests(snapshot, type) {
  const container = $("myRequests");
  const existing = container.dataset.items
    ? JSON.parse(container.dataset.items)
    : [];

  const incoming = snapshot.docs.map(d => ({
    id: d.id,
    type,
    ...d.data()
  }));

  const others = existing.filter(item => item.type !== type);
  const combined = [...others, ...incoming];

  container.dataset.items = JSON.stringify(combined);

  container.innerHTML = combined.length
    ? combined.map(item => `
      <div class="request-row">
        <span>${escapeHTML(item.type)} — ৳${money(item.amount)}</span>
        <strong>${escapeHTML(item.status || "Pending")}</strong>
      </div>
    `).join("")
    : "No requests yet.";
}

$("addMoneyForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || isAdmin(currentUser)) return toast("Player login করো।");

  try {
    const amount = Number($("addAmount").value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("সঠিক Amount দাও।");

    await addDoc(collection(db, "add_money_requests"), {
      uid: currentUser.uid,
      email: currentUser.email,
      amount,
      method: $("addMethod").value,
      sender: $("addSender").value.trim(),
      trxId: $("addTrx").value.trim(),
      status: "Pending",
      createdAt: serverTimestamp()
    });

    $("addMoneyForm").reset();
    toast("Add Money request পাঠানো হয়েছে।");
  } catch (error) {
    toast(error.message);
  }
});

$("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || isAdmin(currentUser)) return toast("Player login করো।");

  try {
    const amount = Number($("withdrawAmount").value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("সঠিক Amount দাও।");

    const walletSnap = await getDoc(doc(db, "wallets", currentUser.uid));
    const balance = Number(walletSnap.data()?.balance || 0);

    if (amount > balance) throw new Error("তোমার Wallet-এ পর্যাপ্ত Balance নেই।");

    await addDoc(collection(db, "withdraw_requests"), {
      uid: currentUser.uid,
      email: currentUser.email,
      amount,
      method: $("withdrawMethod").value,
      holder: $("withdrawHolder").value.trim(),
      number: $("withdrawNumber").value.trim(),
      status: "Pending",
      createdAt: serverTimestamp()
    });

    $("withdrawForm").reset();
    toast("Withdraw request পাঠানো হয়েছে।");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// ADMIN DASHBOARD LISTENERS
// ===============================

function startAdminDashboard() {
  unsubscribeAdmin.push(startTournamentListener());

  const regUnsub = onSnapshot(
    query(collection(db, "registrations"), limit(100)),
    snapshot => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      $("adminRegistrations").innerHTML = items.length
        ? items.map(item => `
          <div class="request-row">
            <span>
              <b>${escapeHTML(item.playerName)}</b><br>
              ${escapeHTML(item.tournamentName)}<br>
              UID: ${escapeHTML(item.ffUID)}<br>
              Phone: ${escapeHTML(item.contact)}
            </span>
            <strong>${escapeHTML(item.status || "Pending")}</strong>
          </div>
        `).join("")
        : "No registrations.";
    }
  );

  const addUnsub = onSnapshot(
    query(collection(db, "add_money_requests"), limit(100)),
    snapshot => renderAdminRequests(snapshot, "add_money_requests", "adminAddRequests")
  );

  const withdrawUnsub = onSnapshot(
    query(collection(db, "withdraw_requests"), limit(100)),
    snapshot => renderAdminRequests(snapshot, "withdraw_requests", "adminWithdrawRequests")
  );

  unsubscribeAdmin.push(regUnsub, addUnsub, withdrawUnsub);

  loadWebsiteSettings();
  loadFeeSettings();
}

function renderAdminRequests(snapshot, collectionName, containerId) {
  const container = $(containerId);
  const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  container.innerHTML = items.length
    ? items.map(item => `
      <div class="request-row request-admin">
        <div>
          <b>৳${money(item.amount)}</b> — ${escapeHTML(item.method)}<br>
          Player: ${escapeHTML(item.email || item.uid)}<br>
          ${collectionName === "add_money_requests"
            ? `Sender: ${escapeHTML(item.sender)}<br>TRX: ${escapeHTML(item.trxId)}`
            : `Name: ${escapeHTML(item.holder)}<br>Number: ${escapeHTML(item.number)}`}
          <br>Status: ${escapeHTML(item.status || "Pending")}
        </div>
        ${item.status === "Pending" ? `
          <div class="request-buttons">
            <button class="btn btn-primary" data-approve="${item.id}" data-collection="${collectionName}">Approve</button>
            <button class="btn btn-outline" data-reject="${item.id}" data-collection="${collectionName}">Reject</button>
          </div>
        ` : ""}
      </div>
    `).join("")
    : "No requests.";

  container.querySelectorAll("[data-approve]").forEach(button => {
    button.addEventListener("click", () => reviewRequest(
      button.dataset.collection, button.dataset.approve, true
    ));
  });

  container.querySelectorAll("[data-reject]").forEach(button => {
    button.addEventListener("click", () => reviewRequest(
      button.dataset.collection, button.dataset.reject, false
    ));
  });
}

// ===============================
// APPROVE / REJECT WALLET REQUEST
// ===============================

async function reviewRequest(collectionName, requestId, approve) {
  if (!currentUser || !isAdmin(currentUser)) return;

  try {
    const requestRef = doc(db, collectionName, requestId);

    await runTransaction(db, async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists()) throw new Error("Request পাওয়া যায়নি।");

      const requestData = requestSnap.data();
      if (requestData.status !== "Pending") throw new Error("এই Request আগে Review হয়েছে।");

      const walletRef = doc(db, "wallets", requestData.uid);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = Number(walletSnap.data()?.balance || 0);

      if (approve && collectionName === "add_money_requests") {
        transaction.set(walletRef, {
          uid: requestData.uid,
          balance: currentBalance + Number(requestData.amount),
          updatedAt: serverTimestamp()
        }, { merge: true });

        const transactionRef = doc(collection(db, "transactions"));
        transaction.set(transactionRef, {
          uid: requestData.uid,
          amount: Number(requestData.amount),
          type: "credit",
          description: "Add Money Approved",
          createdAt: serverTimestamp()
        });
      }

      if (approve && collectionName === "withdraw_requests") {
        const feeSnap = await transaction.get(doc(db, "wallet_settings", "main"));
        const feePercent = Number(feeSnap.data()?.fee || 0);
        const amount = Number(requestData.amount);
        const fee = amount * feePercent / 100;
        const total = amount + fee;

        if (currentBalance < total) {
          throw new Error("Player-এর পর্যাপ্ত Balance নেই।");
        }

        transaction.set(walletRef, {
          uid: requestData.uid,
          balance: currentBalance - total,
          updatedAt: serverTimestamp()
        }, { merge: true });

        const transactionRef = doc(collection(db, "transactions"));
        transaction.set(transactionRef, {
          uid: requestData.uid,
          amount,
          type: "debit",
          description: "Withdraw Approved",
          createdAt: serverTimestamp()
        });
      }

      transaction.update(requestRef, {
        status: approve ? "Approved" : "Rejected",
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.email
      });
    });

    toast(approve ? "Request Approved!" : "Request Rejected!");
  } catch (error) {
    toast(error.message);
  }
}

// ===============================
// ADMIN TOURNAMENT MANAGEMENT
// ===============================

$("tournamentForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return;

  try {
    const id = $("editTournamentId").value;

    const data = {
      name: $("tournamentName").value.trim(),
      mode: $("tournamentMode").value,
      date: $("tournamentDate").value,
      prize: Number($("tournamentPrize").value),
      slots: Number($("tournamentSlots").value),
      status: $("tournamentStatus").value,
      updatedAt: serverTimestamp()
    };

    if (id) {
      await updateDoc(doc(db, "tournaments", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "tournaments"), data);
    }

    $("tournamentForm").reset();
    $("editTournamentId").value = "";
    toast("Tournament Save হয়েছে!");
  } catch (error) {
    toast(error.message);
  }
});

function renderAdminTournaments() {
  const container = $("adminTournamentList");
  if (!container) return;

  container.innerHTML = tournamentsCache.map(t => `
    <div class="request-row">
      <span>${escapeHTML(t.name)}<br>${escapeHTML(t.status || "Open")}</span>
      <span>
        <button class="btn btn-outline" data-edit="${t.id}">Edit</button>
        <button class="btn btn-outline" data-delete="${t.id}">Delete</button>
      </span>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const t = tournamentsCache.find(item => item.id === button.dataset.edit);
      if (!t) return;

      $("editTournamentId").value = t.id;
      $("tournamentName").value = t.name || "";
      $("tournamentMode").value = t.mode || "Squad";
      $("tournamentDate").value = t.date || "";
      $("tournamentPrize").value = t.prize || 0;
      $("tournamentSlots").value = t.slots || 1;
      $("tournamentStatus").value = t.status || "Open";

      $("tournamentForm").scrollIntoView({ behavior: "smooth" });
    });
  });

  container.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("এই Tournament Delete করবে?")) return;

      try {
        await deleteDoc(doc(db, "tournaments", button.dataset.delete));
        toast("Tournament Delete হয়েছে।");
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderRoomTournamentOptions() {
  const select = $("roomTournament");
  if (!select) return;

  const oldValue = select.value;

  select.innerHTML = '<option value="">Select Tournament</option>' +
    tournamentsCache.map(t =>
      `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`
    ).join("");

  if (oldValue) select.value = oldValue;
}

$("roomForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return;

  try {
    const tournamentId = $("roomTournament").value;
    if (!tournamentId) throw new Error("Tournament Select করো।");

    await setDoc(doc(db, "tournament_private", tournamentId), {
      tournamentId,
      roomId: $("roomId").value.trim(),
      roomPassword: $("roomPassword").value.trim(),
      updatedAt: serverTimestamp()
    });

    $("roomForm").reset();
    toast("Room details Save হয়েছে।");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// ADMIN BALANCE CONTROL
// ===============================

$("balanceForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return;

  try {
    const uid = $("balanceUID").value.trim();
    const amount = Number($("balanceAmount").value);
    const action = $("balanceAction").value;

    if (!uid || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("সঠিক UID ও Amount দাও।");
    }

    const walletRef = doc(db, "wallets", uid);

    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(walletRef);
      const balance = Number(snapshot.data()?.balance || 0);
      const nextBalance = action === "add" ? balance + amount : balance - amount;

      if (nextBalance < 0) throw new Error("Balance শূন্যের নিচে হতে পারবে না।");

      transaction.set(walletRef, {
        uid,
        balance: nextBalance,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const transactionRef = doc(collection(db, "transactions"));
      transaction.set(transactionRef, {
        uid,
        amount,
        type: action === "add" ? "credit" : "debit",
        description: action === "add" ? "Admin Added Balance" : "Admin Deducted Balance",
        createdAt: serverTimestamp()
      });
    });

    $("balanceForm").reset();
    toast("Player Balance Update হয়েছে!");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// WEBSITE SETTINGS
// ===============================

async function loadWebsiteSettings() {
  try {
    const snapshot = await getDoc(doc(db, "settings", "website"));
    if (!snapshot.exists()) return;

    const data = snapshot.data();

    $("settingTitle").value = data.title || "AE FF ARENA";
    $("settingHeroTitle").value = data.heroTitle || "";
    $("settingDescription").value = data.description || "";
    $("settingKeywords").value = data.keywords || "";
    $("settingPhone").value = data.phone || "";
    $("settingWhatsApp").value = data.whatsapp || "";
    $("settingFacebook").value = data.facebook || "";
    $("settingYouTube").value = data.youtube || "";

    applyWebsiteSettings(data);
  } catch (error) {
    console.error(error);
  }
}

function applyWebsiteSettings(data) {
  if (data.title) document.title = data.title;

  if (data.phone) $("contactPhone").textContent = data.phone;
  if (data.whatsapp) $("contactWhatsApp").textContent = data.whatsapp;
  if (data.facebook) $("contactFacebook").textContent = data.facebook;
  if (data.youtube) $("contactYouTube").textContent = data.youtube;

  if (data.heroTitle) {
    const parts = data.heroTitle.split(" ");
    const first = parts.slice(0, -1).join(" ");
    const last = parts.slice(-1).join("");
    document.querySelector(".hero h1").innerHTML =
      `${escapeHTML(first)}<br><span>${escapeHTML(last)}</span>`;
  }

  if (data.description) {
    document.querySelector(".hero-content > p").textContent = data.description;
  }

  if (data.bannerUrl) {
    document.querySelector(".hero-visual").style.backgroundImage =
      `linear-gradient(#0008,#0008), url("${data.bannerUrl.replace(/["\\]/g, "")}")`;
    document.querySelector(".hero-visual").style.backgroundSize = "cover";
    document.querySelector(".hero-visual").style.backgroundPosition = "center";
  }
}

$("settingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return;

  try {
    const data = {
      title: $("settingTitle").value.trim(),
      heroTitle: $("settingHeroTitle").value.trim(),
      description: $("settingDescription").value.trim(),
      keywords: $("settingKeywords").value.trim(),
      phone: $("settingPhone").value.trim(),
      whatsapp: $("settingWhatsApp").value.trim(),
      facebook: $("settingFacebook").value.trim(),
      youtube: $("settingYouTube").value.trim(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "settings", "website"), data, { merge: true });
    applyWebsiteSettings(data);
    toast("Website settings Save হয়েছে!");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// BANNER URL
// ===============================

$("saveBanner")?.addEventListener("click", async () => {
  if (!isAdmin(currentUser)) return;

  const url = $("bannerUrl").value.trim();
  if (!/^https:\/\/.+/i.test(url)) return toast("সঠিক HTTPS Image URL দাও।");

  try {
    await setDoc(doc(db, "settings", "website"), {
      bannerUrl: url,
      updatedAt: serverTimestamp()
    }, { merge: true });

    applyWebsiteSettings({ bannerUrl: url });
    $("bannerPreview").innerHTML =
      `<img src="${escapeHTML(url)}" alt="Banner preview" style="width:100%;border-radius:12px">`;

    toast("Banner URL Save হয়েছে!");
  } catch (error) {
    toast(error.message);
  }
});

$("deleteBanner")?.addEventListener("click", async () => {
  if (!isAdmin(currentUser)) return;

  try {
    await updateDoc(doc(db, "settings", "website"), {
      bannerUrl: ""
    });

    $("bannerUrl").value = "";
    $("bannerPreview").innerHTML = "";
    document.querySelector(".hero-visual").style.backgroundImage = "";
    toast("Banner Remove হয়েছে।");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// WITHDRAW FEE SETTINGS
// ===============================

async function loadFeeSettings() {
  try {
    const snapshot = await getDoc(doc(db, "wallet_settings", "main"));
    if (snapshot.exists()) {
      $("withdrawFee").value = snapshot.data().fee || 0;
    }
  } catch (error) {
    console.error(error);
  }
}

$("feeForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return;

  try {
    const fee = Number($("withdrawFee").value);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      throw new Error("Fee 0 থেকে 100 এর মধ্যে হতে হবে।");
    }

    await setDoc(doc(db, "wallet_settings", "main"), {
      fee,
      updatedAt: serverTimestamp()
    }, { merge: true });

    toast("Withdraw fee Save হয়েছে!");
  } catch (error) {
    toast(error.message);
  }
});

// ===============================
// START PUBLIC TOURNAMENT LISTENER
// ===============================

startTournamentListener();

// ===============================
// SERVICE WORKER
// ===============================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(error => {
      console.log("Service worker:", error);
    });
  });
}
