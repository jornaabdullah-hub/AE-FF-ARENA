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
  limit
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const toursRef = collection(db, "tournaments");
const regsRef = collection(db, "registrations");

let tours = [];
let regsCount = 0;
let regsUnsub = null;
let walletUnsubs = [];
let isSignup = true;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

function showModal(id) {
  $(id)?.classList.add("show");
}

function hideModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
}

document.querySelectorAll("[data-close]").forEach(b => b.onclick = hideModals);

document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", e => {
    if (e.target === m) hideModals();
  });
});

function setText(id, value) {
  if ($(id)) $(id).textContent = value;
}

function setHTML(id, value) {
  if ($(id)) $(id).innerHTML = value;
}

function listen(ref, callback, errorCallback) {
  return onSnapshot(ref, callback, errorCallback || (err => console.error(err)));
}

function isAdmin(user = auth.currentUser) {
  return !!user &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function stopWalletListeners() {
  walletUnsubs.forEach(unsub => unsub());
  walletUnsubs = [];
}

function stopAdminListeners() {
  if (regsUnsub) {
    regsUnsub();
    regsUnsub = null;
  }
}

// ---------------- ADMIN LOGIN ----------------

$("adminBtn")?.addEventListener("click", () => showModal("adminModal"));

$("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );

    hideModals();
  } catch (err) {
    alert("Admin Login হয়নি: " + err.message);
  }
});

$("logout")?.addEventListener("click", () => signOut(auth));

// ---------------- PLAYER LOGIN / SIGNUP ----------------

$("playerBtn")?.addEventListener("click", () => {
  isSignup = true;
  updatePlayerForm();
  showModal("playerModal");
});

$("walletLoginBtn")?.addEventListener("click", () => {
  isSignup = false;
  updatePlayerForm();
  showModal("playerModal");
});

function updatePlayerForm() {
  setText("playerFormTitle", isSignup ? "Player Registration" : "Player Login");
  setText("playerSubmit", isSignup ? "CREATE ACCOUNT" : "LOGIN");
  setText("togglePlayerMode", isSignup
    ? "Already have an account? Login"
    : "New player? Create account");

  if ($("playerNameLabel")) {
    $("playerNameLabel").hidden = !isSignup;
  }

  if ($("playerName")) {
    $("playerName").required = isSignup;
  }
}

$("togglePlayerMode")?.addEventListener("click", () => {
  isSignup = !isSignup;
  updatePlayerForm();
});

$("playerForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const email = $("playerEmail").value.trim();
  const password = $("playerPassword").value;
  const name = $("playerName")?.value.trim() || "";

  try {
    if (isSignup) {
      if (password.length < 6) {
        return alert("Password কমপক্ষে ৬ অক্ষরের হতে হবে।");
      }

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (name) {
        await updateProfile(result.user, {
          displayName: name
        });
      }

      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: name,
        contact: "",
        createdAt: serverTimestamp()
      });

      alert("Player account তৈরি হয়েছে!");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Player Login সফল হয়েছে!");
    }

    hideModals();
    e.target.reset();

  } catch (err) {
    alert("Player account error: " + err.message);
  }
});

$("playerLogout")?.addEventListener("click", () => signOut(auth));

// ---------------- AUTH STATE ----------------

onAuthStateChanged(auth, async user => {
  stopWalletListeners();
  stopAdminListeners();

  const admin = isAdmin(user);

  if ($("loginBox")) $("loginBox").hidden = admin;
  if ($("dashboard")) $("dashboard").hidden = !admin;

  if ($("playerLoggedOut")) {
    $("playerLoggedOut").hidden = !!user;
  }

  if ($("playerDashboard")) {
    $("playerDashboard").hidden = !user || admin;
  }

  if ($("playerBtn")) {
    $("playerBtn").hidden = !!user;
  }

  if ($("walletLoginBtn")) {
    $("walletLoginBtn").hidden = !!user;
  }

  if ($("playerLogout")) {
    $("playerLogout").hidden = !user || admin;
  }

  if (!user) {
    return;
  }

  if (admin) {
    setText("adminIdentity", "Signed in: " + user.email);
    startAdminListeners();
    return;
  }

  setText("playerIdentity", user.displayName || user.email);
  startPlayerWallet(user.uid);
});

// ---------------- TOURNAMENTS ----------------

function renderTours() {
  setText("countT", tours.length);
  setText("countR", regsCount);

  setHTML("tournaments", tours.map(t => `
    <article class="card">
      <span class="tag">${esc(t.mode)} / ${esc(t.status)}</span>
      <h3>${esc(t.name)}</h3>
      <p class="muted">${esc(t.date || "তারিখ জানানো হবে")}</p>
      <div class="meta">
        <span>PRIZE POOL</span>
        <b>${esc(t.prize || "—")}</b>
      </div>
      <div class="meta">
        <span>SLOTS</span>
        <b>${esc(t.slots || "—")}</b>
      </div>
      <button class="cta" data-join="${esc(t.id)}">JOIN TOURNAMENT ↗</button>
    </article>
  `).join("") || "<p>এখনো কোনো Tournament নেই।</p>");

  fillRoomSelect();

  setHTML("adminTourList", tours.map(t => `
    <div>
      <b>${esc(t.name)}</b> — ${esc(t.mode)}
      <button class="ghost" data-edit="${esc(t.id)}">Edit</button>
      <button class="ghost" data-delete="${esc(t.id)}">Delete</button>
    </div>
  `).join(""));
}

listen(toursRef, snap => {
  tours = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTours();
  setText("connection", "● FIREBASE CONNECTED");
}, err => {
  setText("connection", "Firebase error");
  console.error(err);
});

listen(regsRef, snap => {
  regsCount = snap.size;
  setText("countR", regsCount);
});

// ---------------- JOIN TOURNAMENT ----------------

$("tournaments")?.addEventListener("click", e => {
  const id = e.target.dataset.join;
  if (!id) return;

  $("joinTournament").value = id;
  showModal("joinModal");
});

$("joinForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const id = $("joinTournament").value;
  const t = tours.find(x => x.id === id);

  if (!t) return alert("Tournament পাওয়া যায়নি");

  const name = $("pname").value.trim();
  const uid = $("puid").value.trim();
  const contact = $("pcontact").value.trim();

  try {
    await addDoc(regsRef, {
      name,
      uid,
      contact,
      tournamentId: id,
      tournamentName: t.name,
      createdAt: serverTimestamp()
    });

    e.target.reset();
    hideModals();
    alert("রেজিস্ট্রেশন সফল হয়েছে!");

  } catch (err) {
    alert("Registration error: " + err.message);
  }
});

// ---------------- ADMIN LISTENERS ----------------

function startAdminListeners() {
  regsUnsub = listen(
    query(regsRef, orderBy("createdAt", "desc")),
    snap => {
      setHTML("registrationList", snap.docs.map(d => {
        const r = d.data();

        return `
          <div>
            <b>${esc(r.name)}</b> |
            UID: ${esc(r.uid)} |
            ${esc(r.contact)} |
            ${esc(r.tournamentName || r.tournamentId)}
          </div>
        `;
      }).join("") || "কোনো রেজিস্ট্রেশন নেই");
    },
    err => setText("registrationList", "Load error: " + err.message)
  );

  startAdminWalletListeners();
  fillRoomSelect();
}

$("refreshRegs")?.addEventListener("click", startAdminListeners);

// ---------------- ADMIN TOURNAMENT CONTROL ----------------

$("tourForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!isAdmin()) return alert("Admin login required");

  const data = {
    name: $("tname").value.trim(),
    mode: $("mode").value,
    date: $("date").value.trim(),
    prize: $("prize").value.trim(),
    slots: Number($("slots").value),
    status: $("status").value,
    updatedAt: serverTimestamp()
  };

  try {
    const id = $("tid").value;

    if (id) {
      await setDoc(doc(db, "tournaments", id), data, { merge: true });
    } else {
      await addDoc(toursRef, {
        ...data,
        createdAt: serverTimestamp()
      });
    }

    e.target.reset();
    $("tid").value = "";
    alert("Tournament saved");

  } catch (err) {
    alert(err.message);
  }
});

$("resetTour")?.addEventListener("click", () => {
  $("tourForm").reset();
  $("tid").value = "";
});

function fillRoomSelect() {
  if (!$("roomTournament")) return;

  $("roomTournament").innerHTML = tours.map(t =>
    `<option value="${esc(t.id)}">${esc(t.name)}</option>`
  ).join("");
}

$("roomForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!isAdmin()) return alert("Admin login required");

  const id = $("roomTournament").value;
  if (!id) return;

  try {
    await setDoc(doc(db, "tournament_private", id), {
      roomId: $("roomId").value.trim(),
      roomPassword: $("roomPassword").value.trim(),
      updatedAt: serverTimestamp()
    });

    alert("Private room details saved");

  } catch (err) {
    alert(err.message);
  }
});

$("adminTourList")?.addEventListener("click", async e => {
  const edit = e.target.dataset.edit;
  const del = e.target.dataset.delete;

  if (edit) {
    const t = tours.find(x => x.id === edit);
    if (!t) return;

    $("tid").value = t.id;
    $("tname").value = t.name || "";
    $("mode").value = t.mode || "SOLO";
    $("date").value = t.date || "";
    $("prize").value = t.prize || "";
    $("slots").value = t.slots || 1;
    $("status").value = t.status || "OPEN";
    $("tname").focus();
  }

  if (del) {
    if (!confirm("এই Tournament delete করবেন?")) return;

    try {
      await deleteDoc(doc(db, "tournaments", del));
      await deleteDoc(doc(db, "tournament_private", del));
      alert("Tournament deleted");
    } catch (err) {
      alert(err.message);
    }
  }
});

// ---------------- PLAYER WALLET ----------------

function startPlayerWallet(uid) {
  const walletRef = doc(db, "wallets", uid);

  walletUnsubs.push(listen(walletRef, snap => {
    const balance = snap.exists()
      ? Number(snap.data().balance || 0)
      : 0;

    setText("walletBalance", "৳ " + balance.toFixed(2));
  }));

  const txRef = query(
    collection(db, "transactions"),
    where("uid", "==", uid),
    limit(50)
  );

  walletUnsubs.push(listen(txRef, snap => {
    const items = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    items.sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    });

    setHTML("transactionHistory", items.map(t => `
      <div>
        <b>${esc(t.type || "Transaction")}</b>
        — ৳${esc(t.amount)}
        <br>
        <span class="muted">${esc(t.reason || "")}</span>
      </div>
    `).join("") || "এখনো কোনো Transaction নেই");
  }));

  ["add_money_requests", "withdraw_requests"].forEach(colName => {
    const q = query(
      collection(db, colName),
      where("uid", "==", uid),
      limit(50)
    );

    walletUnsubs.push(listen(q, snap => {
      const items = snap.docs.map(d => d.data());

      const html = items.map(r => `
        <div>
          <b>${colName === "withdraw_requests" ? "Withdraw" : "Add Money"}</b>
          — ৳${esc(r.amount)}
          <br>
          <span class="status-${esc(String(r.status || "PENDING").toLowerCase())}">
            ${esc(r.status || "PENDING")}
          </span>
        </div>
      `).join("");

      if (colName === "withdraw_requests") {
        setHTML("myRequests", html || "কোনো Request নেই");
      } else {
        const old = $("myRequests")?.innerHTML || "";
        setHTML("myRequests", old + html);
      }
    }));
  });
}

// ---------------- ADD MONEY REQUEST ----------------

$("addMoneyForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user || isAdmin(user)) return alert("Player Login করো");

  const amount = Number($("addAmount").value);
  const method = $("addMethod").value;
  const accountNumber = $("addAccount").value.trim();
  const transactionId = $("addTrx").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return alert("সঠিক Amount দাও");
  }

  try {
    await addDoc(collection(db, "add_money_requests"), {
      uid: user.uid,
      amount,
      method,
      accountNumber,
      transactionId,
      status: "PENDING",
      createdAt: serverTimestamp()
    });

    e.target.reset();
    alert("Add Money Request পাঠানো হয়েছে। Admin যাচাই করবে।");

  } catch (err) {
    alert("Request error: " + err.message);
  }
});

// ---------------- WITHDRAW REQUEST ----------------

$("withdrawForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user || isAdmin(user)) return alert("Player Login করো");

  const amount = Number($("withdrawAmount").value);
  const method = $("withdrawMethod").value;
  const accountHolderName = $("withdrawName").value.trim();
  const accountNumber = $("withdrawAccount").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return alert("সঠিক Amount দাও");
  }

  if (!accountHolderName || !accountNumber) {
    return alert("Account Holder Name এবং Number দাও");
  }

  try {
    await addDoc(collection(db, "withdraw_requests"), {
      uid: user.uid,
      amount,
      method,
      accountHolderName,
      accountNumber,
      status: "PENDING",
      createdAt: serverTimestamp()
    });

    e.target.reset();
    alert("Withdraw Request পাঠানো হয়েছে। Admin যাচাই করবে।");

  } catch (err) {
    alert("Withdraw error: " + err.message);
  }
});

// ---------------- ADMIN WALLET CONTROL ----------------

function startAdminWalletListeners() {
  const addRef = query(
    collection(db, "add_money_requests"),
    limit(100)
  );

  const withdrawRef = query(
    collection(db, "withdraw_requests"),
    limit(100)
  );

  walletUnsubs.push(listen(addRef, snap => {
    setHTML("adminAddRequests", snap.docs.map(d => {
      const r = d.data();

      return `
        <div class="action-row">
          <div>
            <b>৳${esc(r.amount)} — ${esc(r.method)}</b>
            <br>UID: ${esc(r.uid)}
            <br>Number: ${esc(r.accountNumber)}
            <br>Transaction ID: ${esc(r.transactionId)}
            <br>Status: ${esc(r.status)}
          </div>
          <div>
            <button class="ghost" data-request-action="APPROVED"
              data-request-id="${esc(d.id)}" data-request-type="add_money_requests">
              Approve
            </button>
            <button class="ghost danger" data-request-action="REJECTED"
              data-request-id="${esc(d.id)}" data-request-type="add_money_requests">
              Reject
            </button>
          </div>
        </div>
      `;
    }).join("") || "কোনো Add Money Request নেই");
  }));

  walletUnsubs.push(listen(withdrawRef, snap => {
    setHTML("adminWithdrawRequests", snap.docs.map(d => {
      const r = d.data();

      return `
        <div class="action-row">
          <div>
            <b>৳${esc(r.amount)} — ${esc(r.method)}</b>
            <br>UID: ${esc(r.uid)}
            <br>Account Name: ${esc(r.accountHolderName)}
            <br>Account Number: ${esc(r.accountNumber)}
            <br>Status: ${esc(r.status)}
          </div>
          <div>
            <button class="ghost" data-request-action="APPROVED"
              data-request-id="${esc(d.id)}" data-request-type="withdraw_requests">
              Approve
            </button>
            <button class="ghost danger" data-request-action="REJECTED"
              data-request-id="${esc(d.id)}" data-request-type="withdraw_requests">
              Reject
            </button>
          </div>
        </div>
      `;
    }).join("") || "কোনো Withdraw Request নেই");
  }));
}

// Request approve/reject only changes request status.
// It does NOT transfer money or change wallet balance.
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-request-action]");
  if (!btn) return;

  if (!isAdmin()) return alert("Admin login required");

  const action = btn.dataset.requestAction;
  const id = btn.dataset.requestId;
  const type = btn.dataset.requestType;

  if (!confirm("Request " + action + " করবেন?")) return;

  try {
    await updateDoc(doc(db, type, id), {
      status: action,
      reviewedAt: serverTimestamp()
    });

    alert("Request status updated. Balance আলাদাভাবে Admin-কে update করতে হবে।");

  } catch (err) {
    alert("Update error: " + err.message);
  }
});

// ---------------- ADMIN ADD / DEDUCT BALANCE ----------------

$("adminWalletForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!isAdmin()) return alert("Admin login required");

  const uid = $("walletPlayerUid").value.trim();
  const amount = Number($("adminWalletAmount").value);
  const action = $("walletAction").value;
  const reason = $("walletReason").value.trim();

  if (!uid || !Number.isFinite(amount) || amount <= 0) {
    return alert("Player UID এবং সঠিক Amount দাও");
  }

  try {
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await getDoc(walletRef);

    const oldBalance = walletSnap.exists()
      ? Number(walletSnap.data().balance || 0)
      : 0;

    const newBalance = action === "DEDUCT"
      ? oldBalance - amount
      : oldBalance + amount;

    if (newBalance < 0) {
      return alert("Wallet-এ পর্যাপ্ত Balance নেই");
    }

    await setDoc(walletRef, {
      uid,
      balance: newBalance,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await addDoc(collection(db, "transactions"), {
      uid,
      amount,
      type: action,
      reason: reason || "Admin wallet adjustment",
      createdAt: serverTimestamp()
    });

    e.target.reset();
    alert("Wallet balance updated: ৳" + newBalance.toFixed(2));

  } catch (err) {
    alert("Wallet update error: " + err.message);
  }
});

// ---------------- WITHDRAW FEE SETTINGS ----------------

$("walletSettingsForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!isAdmin()) return alert("Admin login required");

  const feeType = $("withdrawFeeType").value;
  const fee = Number($("withdrawFee").value);

  if (!Number.isFinite(fee) || fee < 0) {
    return alert("সঠিক Fee দাও");
  }

  try {
    await setDoc(doc(db, "wallet_settings", "main"), {
      feeType,
      fee,
      updatedAt: serverTimestamp()
    });

    alert("Wallet settings saved");

  } catch (err) {
    alert("Settings error: " + err.message);
  }
});

// ---------------- SERVICE WORKER ----------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(console.warn);
  });
}
