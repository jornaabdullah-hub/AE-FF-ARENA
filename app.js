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
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

// FIREBASE INITIALIZATION

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const ADMIN = (ADMIN_EMAIL || "jornaabdullah@gmail.com").toLowerCase();

let currentUser = null;
let isSignup = false;
let tournamentsCache = [];
let publicTournamentUnsub = null;
let unsubscribePlayer = [];
let unsubscribeAdmin = [];
let walletBalanceValue = 0;
let authReady = false;

let playerAddRequests = [];
let playerWithdrawRequests = [];

function isAdmin() {
  return !!currentUser &&
    currentUser.email?.toLowerCase() === ADMIN;
}

// COMMON FUNCTIONS

function money(value) {
  return Number(value || 0).toLocaleString("en-BD");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function toast(message) {
  const element = $("toast");
  if (!element) return;

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 3000);
}

function showMessage(id, message, color = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = color || "#00c8ff";
}

function openModal(id) {
  $(id)?.classList.add("active");
}

function closeModal(id) {
  $(id)?.classList.remove("active");
}

function errorText(error) {
  const messages = {
    "auth/invalid-credential": "Email অথবা Password ভুল হয়েছে।",
    "auth/user-not-found": "এই Email দিয়ে Account পাওয়া যায়নি।",
    "auth/wrong-password": "Password সঠিক নয়।",
    "auth/email-already-in-use": "এই Email দিয়ে আগে Account খোলা হয়েছে।",
    "auth/weak-password": "কমপক্ষে ৬ অক্ষরের Password দিন।",
    "auth/invalid-email": "সঠিক Email Address দিন।",
    "auth/network-request-failed": "Internet Connection পরীক্ষা করুন।",
    "permission-denied": "আপনার এই কাজের অনুমতি নেই।"
  };

  return messages[error.code] || error.message || "কাজটি সম্পন্ন হয়নি।";
}

// MODALS

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    closeModal(button.dataset.close);
  });
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      modal.classList.remove("active");
    }
  });
});

// MOBILE MENU

$("menuToggle")?.addEventListener("click", () => {
  $("mainNav")?.classList.toggle("open");
});

document.querySelectorAll("#mainNav a").forEach(link => {
  link.addEventListener("click", () => {
    $("mainNav")?.classList.remove("open");
  });
});

// PLAYER LOGIN AND SIGNUP

function setAuthMode(signup) {
  isSignup = signup;

  $("playerModalTitle").textContent =
    signup ? "Create Player Account" : "Player Login";

  $("playerSubmitBtn").textContent =
    signup ? "Create Account" : "Login";

  $("signupFields").style.display =
    signup ? "block" : "none";

  ["playerName", "playerFFUID", "playerPhone"].forEach(id => {
    if ($(id)) $(id).required = signup;
  });

  $("authSwitchText").textContent =
    signup ? "Already have an account?" : "Don't have an account?";

  $("switchAuthBtn").textContent =
    signup ? "Player Login" : "Create Account";

  showMessage("playerAuthMessage", "");
}

function openPlayerLogin() {
  if (!authReady) {
    toast("একটু অপেক্ষা করে আবার চেষ্টা করুন।");
    return;
  }

  if (currentUser && !isAdmin()) {
    showPlayerMenu();
    return;
  }

  setAuthMode(false);
  openModal("playerModal");
}

$("playerBtn")?.addEventListener("click", openPlayerLogin);
$("walletLoginBtn")?.addEventListener("click", openPlayerLogin);

$("heroRegisterBtn")?.addEventListener("click", () => {
  setAuthMode(true);
  openModal("playerModal");
});

$("switchAuthBtn")?.addEventListener("click", () => {
  setAuthMode(!isSignup);
});

// PLAYER AUTH FORM

$("playerAuthForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("playerEmail").value.trim();
  const password = $("playerPassword").value;

  const submitButton = $("playerSubmitBtn");

  try {
    submitButton.disabled = true;
    showMessage("playerAuthMessage", "Please wait...");

    if (isSignup) {
      const name = $("playerName").value.trim();
      const ffUID = $("playerFFUID").value.trim();
      const phone = $("playerPhone").value.trim();

      if (!name || !ffUID || !phone) {
        throw new Error("সব তথ্য পূরণ করুন।");
      }

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(result.user, {
        displayName: name
      });

      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: name,
        ffUID,
        phone,
        email,
        createdAt: serverTimestamp()
      });

      toast("Account Created Successfully!");
      closeModal("playerModal");
      $("playerAuthForm").reset();

    } else {
      await signInWithEmailAndPassword(auth, email, password);

      toast("Player Login Successful!");
      closeModal("playerModal");
      $("playerAuthForm").reset();
    }

  } catch (error) {
    showMessage(
      "playerAuthMessage",
      errorText(error),
      "#ff7777"
    );
  } finally {
    submitButton.disabled = false;
  }
});

// PLAYER ACCOUNT MENU

function removePlayerMenu() {
  $("playerAccountMenu")?.remove();
}

function showPlayerMenu() {
  if (!$("mainNav") || !currentUser || isAdmin()) return;

  removePlayerMenu();

  const menu = document.createElement("div");
  menu.id = "playerAccountMenu";

  menu.innerHTML = `
    <button type="button" id="playerAccountButton">
      ${escapeHTML(currentUser.displayName || "My Account")} ▼
    </button>

    <div id="playerAccountDropdown">
      <button type="button" data-action="profile">My Profile</button>
      <button type="button" data-action="wallet">My Wallet</button>
      <button type="button" data-action="add">Add Money</button>
      <button type="button" data-action="withdraw">Withdraw</button>
      <button type="button" data-action="transactions">My Transactions</button>
      <button type="button" data-action="tournaments">My Tournament</button>
      <button type="button" data-action="logout">Logout</button>
    </div>
  `;

  $("mainNav").appendChild(menu);

  if ($("playerBtn")) {
    $("playerBtn").style.display = "none";
  }

  $("playerAccountButton").addEventListener("click", () => {
    $("playerAccountDropdown").classList.toggle("open");
  });

  menu.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", async () => {
      $("playerAccountDropdown").classList.remove("open");

      const action = button.dataset.action;

      if (action === "profile") {
        await showMyProfile();
      }

      if (action === "wallet") {
        location.hash = "wallet";
      }

      if (action === "add") {
        location.hash = "wallet";
        $("addAmount")?.focus();
      }

      if (action === "withdraw") {
        location.hash = "wallet";
        $("withdrawAmount")?.focus();
      }

      if (action === "transactions") {
        location.hash = "wallet";
        $("transactionHistory")?.scrollIntoView({
          behavior: "smooth"
        });
      }

      if (action === "tournaments") {
        await showMyTournaments();
      }

      if (action === "logout") {
        await signOut(auth);
        toast("Logged out successfully!");
      }
    });
  });
}

// PLAYER PROFILE

async function showMyProfile() {
  if (!currentUser || isAdmin()) return;

  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    const data = snap.exists() ? snap.data() : {};

    let modal = $("playerInfoModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "playerInfoModal";
      modal.className = "modal";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content">
        <button class="close-modal" id="closePlayerInfo">×</button>
        <h2>My Profile</h2>

        <p><b>Name:</b> ${escapeHTML(data.displayName || currentUser.displayName || "")}</p>
        <p><b>FF UID:</b> ${escapeHTML(data.ffUID || "Not added")}</p>
        <p><b>Phone:</b> ${escapeHTML(data.phone || "Not added")}</p>
        <p><b>Email:</b> ${escapeHTML(currentUser.email)}</p>

        <button class="btn" id="editProfileBtn">Edit Profile</button>
      </div>
    `;

    modal.classList.add("active");

    $("closePlayerInfo").onclick = () => {
      modal.classList.remove("active");
    };

    $("editProfileBtn").onclick = () => {
      editMyProfile(data);
    };

  } catch (error) {
    toast(errorText(error));
  }
}

async function editMyProfile(data) {
  if (!currentUser || isAdmin()) return;

  const name = prompt("Player Name:", data.displayName || "");
  if (name === null) return;

  const ffUID = prompt("Free Fire UID:", data.ffUID || "");
  if (ffUID === null) return;

  const phone = prompt("Phone Number:", data.phone || "");
  if (phone === null) return;

  if (!name.trim() || !ffUID.trim() || !phone.trim()) {
    return toast("সব তথ্য পূরণ করুন।");
  }

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      displayName: name.trim(),
      ffUID: ffUID.trim(),
      phone: phone.trim()
    });

    await updateProfile(currentUser, {
      displayName: name.trim()
    });

    toast("Profile Updated!");

    $("playerInfoModal")?.classList.remove("active");

    showPlayerMenu();

  } catch (error) {
    toast(errorText(error));
  }
}

// MY TOURNAMENTS

async function showMyTournaments() {
  if (!currentUser || isAdmin()) return;

  try {
    const q = query(
      collection(db, "registrations"),
      where("playerUid", "==", currentUser.uid)
    );

    const snap = await getDocs(q);

    const items = snap.docs.map(item => item.data());

    let modal = $("playerInfoModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "playerInfoModal";
      modal.className = "modal";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content">
        <button class="close-modal" id="closePlayerInfo">×</button>
        <h2>My Tournaments</h2>

        ${
          items.length
            ? items.map(item => `
              <div class="list-item">
                <h3>${escapeHTML(item.tournamentName)}</h3>
                <p>Status: ${escapeHTML(item.status || "Pending")}</p>
                <p>FF UID: ${escapeHTML(item.ffUID)}</p>
              </div>
            `).join("")
            : "<p>You have not joined any tournaments yet.</p>"
        }
      </div>
    `;

    modal.classList.add("active");

    $("closePlayerInfo").onclick = () => {
      modal.classList.remove("active");
    };

  } catch (error) {
    toast(errorText(error));
  }
}

// AUTH STATE - ONLY ONE LISTENER

function clearSubscriptions() {
  unsubscribePlayer.forEach(unsubscribe => unsubscribe());
  unsubscribeAdmin.forEach(unsubscribe => unsubscribe());

  unsubscribePlayer = [];
  unsubscribeAdmin = [];

  playerAddRequests = [];
  playerWithdrawRequests = [];
}

onAuthStateChanged(auth, async user => {
  clearSubscriptions();

  currentUser = user;
  authReady = true;

  if (user && isAdmin()) {
    removePlayerMenu();

    if ($("playerBtn")) {
      $("playerBtn").style.display = "inline-flex";
    }

    $("walletLoggedOut").style.display = "block";
    $("walletDashboard").style.display = "none";

    $("adminLogin").style.display = "none";
    $("adminDashboard").style.display = "block";

    // Automatically open Admin Panel after login or refresh
    openModal("adminModal");

    showAdminDashboard();

  } else if (user) {
    closeModal("adminModal");

    $("adminLogin").style.display = "block";
    $("adminDashboard").style.display = "none";

    $("walletLoggedOut").style.display = "none";
    $("walletDashboard").style.display = "block";

    showPlayerMenu();
    startPlayerListeners();

  } else {
    removePlayerMenu();

    if ($("playerBtn")) {
      $("playerBtn").style.display = "inline-flex";
    }

    $("walletLoggedOut").style.display = "block";
    $("walletDashboard").style.display = "none";

    $("adminLogin").style.display = "block";
    $("adminDashboard").style.display = "none";

    walletBalanceValue = 0;
  }
});

// ADMIN LOGIN

$("adminBtn")?.addEventListener("click", () => {
  if (isAdmin()) {
    openModal("adminModal");
    return;
  }

  openModal("adminModal");
});

$("adminLoginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const email = $("adminEmail").value.trim();

    if (email.toLowerCase() !== ADMIN) {
      throw new Error("এই Email Admin হিসেবে অনুমোদিত নয়।");
    }

    showMessage("adminLoginMessage", "Please wait...");

    await signInWithEmailAndPassword(
      auth,
      email,
      $("adminPassword").value
    );

    showMessage(
      "adminLoginMessage",
      "Admin Login Successful!",
      "#35d98b"
    );

  } catch (error) {
    showMessage(
      "adminLoginMessage",
      errorText(error),
      "#ff7777"
    );
  }
});

$("adminLogoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  closeModal("adminModal");
  toast("Admin logged out!");
});

// PUBLIC TOURNAMENTS

function startTournamentListener() {
  if (publicTournamentUnsub) {
    publicTournamentUnsub();
  }

  publicTournamentUnsub = onSnapshot(
    collection(db, "tournaments"),

    snapshot => {
      tournamentsCache = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderTournaments();
      renderRoomTournamentOptions();
      renderAdminTournaments();
    },

    error => {
      console.error(error);
      toast(errorText(error));
    }
  );
}

function renderTournaments() {
  if (!$("tournamentList")) return;

  if (!tournamentsCache.length) {
    $("tournamentList").innerHTML =
      "<p>No tournaments available right now.</p>";
    return;
  }

  $("tournamentList").innerHTML = tournamentsCache.map(item => `
    <div class="tournament-card">
      <h3>${escapeHTML(item.name)}</h3>
      <p>Mode: ${escapeHTML(item.mode)}</p>
      <p>Date: ${escapeHTML(item.date)}</p>
      <p>Prize: ৳${money(item.prize)}</p>
      <p>Slots: ${money(item.slots)}</p>
      <p>Status: ${escapeHTML(item.status)}</p>

      <button class="btn" data-join="${escapeHTML(item.id)}">
        Join Tournament
      </button>
    </div>
  `).join("");

  document.querySelectorAll("[data-join]").forEach(button => {
    button.addEventListener("click", async () => {
      const tournament = tournamentsCache.find(
        item => item.id === button.dataset.join
      );

      if (!tournament) return;

      if (!currentUser || isAdmin()) {
        toast("Tournament Join করতে Player Login করুন।");
        openPlayerLogin();
        return;
      }

      $("joinTournamentId").value = tournament.id;

      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        const data = snap.exists() ? snap.data() : {};

        $("joinPlayerName").value =
          data.displayName || currentUser.displayName || "";

        $("joinFFUID").value = data.ffUID || "";
        $("joinContact").value = data.phone || "";

        openModal("joinModal");

      } catch (error) {
        toast(errorText(error));
      }
    });
  });
}

// JOIN TOURNAMENT

$("joinForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || isAdmin()) {
    return toast("Player Login required.");
  }

  try {
    const tournamentId = $("joinTournamentId").value;

    const tournament = tournamentsCache.find(
      item => item.id === tournamentId
    );

    if (!tournament) {
      throw new Error("Tournament not found.");
    }

    const name = $("joinPlayerName").value.trim();
    const ffUID = $("joinFFUID").value.trim();
    const contact = $("joinContact").value.trim();

    if (!name || !ffUID || !contact) {
      throw new Error("সব তথ্য পূরণ করুন।");
    }

    // Prevent duplicate registration for the same tournament
    const existing = query(
      collection(db, "registrations"),
      where("playerUid", "==", currentUser.uid),
      where("tournamentId", "==", tournamentId)
    );

    const existingSnap = await getDocs(existing);

    if (!existingSnap.empty) {
      throw new Error("আপনি ইতিমধ্যে এই Tournament-এ Join করেছেন।");
    }

    await addDoc(collection(db, "registrations"), {
      tournamentId,
      tournamentName: tournament.name || "",
      playerName: name,
      ffUID,
      contact,
      playerUid: currentUser.uid,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    showMessage(
      "joinMessage",
      "Tournament joined successfully!",
      "#35d98b"
    );

    $("joinForm").reset();

    setTimeout(() => closeModal("joinModal"), 1200);

  } catch (error) {
    showMessage("joinMessage", errorText(error), "#ff7777");
  }
});

// PLAYER WALLET LISTENERS

function startPlayerListeners() {
  if (!currentUser || isAdmin()) return;

  const uid = currentUser.uid;

  unsubscribePlayer.push(
    onSnapshot(
      doc(db, "wallets", uid),

      snap => {
        walletBalanceValue = snap.exists()
          ? Number(snap.data().balance || 0)
          : 0;

        $("walletBalance").textContent = money(walletBalanceValue);

        $("walletPlayerName").textContent =
          currentUser.displayName || currentUser.email;
      },

      error => toast(errorText(error))
    )
  );

  const ownTransactions = query(
    collection(db, "transactions"),
    where("uid", "==", uid)
  );

  unsubscribePlayer.push(
    onSnapshot(
      ownTransactions,

      snap => {
        const items = snap.docs.map(item => ({
          id: item.id,
          ...item.data()
        }));

        $("transactionHistory").innerHTML = items.length
          ? items.map(item => `
            <div class="transaction-item">
              <b>${escapeHTML(item.type || "Transaction")}</b>
              <p>Amount: ৳${money(item.amount)}</p>
              <p>Status: ${escapeHTML(item.status || "Completed")}</p>
              <p>Fee: ৳${money(item.fee)}</p>
            </div>
          `).join("")
          : "No transactions yet.";
      },

      error => toast(errorText(error))
    )
  );

  const ownAdds = query(
    collection(db, "add_money_requests"),
    where("uid", "==", uid)
  );

  const ownWithdraws = query(
    collection(db, "withdraw_requests"),
    where("uid", "==", uid)
  );

  function renderRequests() {
    const all = [
      ...playerAddRequests,
      ...playerWithdrawRequests
    ];

    $("myRequests").innerHTML = all.length
      ? all.map(item => `
        <div class="request-item">
          <b>${escapeHTML(item.type)}</b>
          <p>Amount: ৳${money(item.amount)}</p>
          <p>Status: ${escapeHTML(item.status)}</p>
        </div>
      `).join("")
      : "No requests yet.";
  }

  unsubscribePlayer.push(
    onSnapshot(ownAdds, snap => {
      playerAddRequests = snap.docs.map(item => ({
        ...item.data(),
        type: "Add Money"
      }));

      renderRequests();
    }, error => toast(errorText(error)))
  );

  unsubscribePlayer.push(
    onSnapshot(ownWithdraws, snap => {
      playerWithdrawRequests = snap.docs.map(item => ({
        ...item.data(),
        type: "Withdraw"
      }));

      renderRequests();
    }, error => toast(errorText(error)))
  );
}

// ADD MONEY

$("addMoneyForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || isAdmin()) {
    return toast("Player Login required.");
  }

  const amount = Number($("addAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return toast("Enter a valid amount.");
  }

  try {
    await addDoc(collection(db, "add_money_requests"), {
      uid: currentUser.uid,
      email: currentUser.email,
      amount,
      method: $("addMethod").value,
      sender: $("addSender").value.trim(),
      trxId: $("addTrxId").value.trim(),
      status: "Pending",
      createdAt: serverTimestamp()
    });

    $("addMoneyForm").reset();
    toast("Add Money Request Submitted!");

  } catch (error) {
    toast(errorText(error));
  }
});

// WITHDRAW

$("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || isAdmin()) {
    return toast("Player Login required.");
  }

  const amount = Number($("withdrawAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return toast("Enter a valid amount.");
  }

  try {
    const feeSnap = await getDoc(
      doc(db, "wallet_settings", "main")
    );

    const fee = feeSnap.exists()
      ? Number(feeSnap.data().fee || 0)
      : 0;

    if (amount + fee > walletBalanceValue) {
      throw new Error("Insufficient wallet balance including fee.");
    }

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

    toast("Withdraw Request Submitted!");

  } catch (error) {
    toast(errorText(error));
  }
});

// ADMIN DASHBOARD

function showAdminDashboard() {
  if (!isAdmin()) return;

  startAdminListeners();
  loadWebsiteSettings();
  loadWalletFee();
  loadBanner();
}

function startAdminListeners() {
  // Registrations

  unsubscribeAdmin.push(
    onSnapshot(
      collection(db, "registrations"),

      snap => {
        $("adminRegistrations").innerHTML = snap.docs.map(item => {
          const data = item.data();

          return `
            <div class="request-item">
              <b>${escapeHTML(data.tournamentName)}</b>
              <p>Player: ${escapeHTML(data.playerName)}</p>
              <p>FF UID: ${escapeHTML(data.ffUID)}</p>
              <p>Contact: ${escapeHTML(data.contact)}</p>
              <p>Status: ${escapeHTML(data.status)}</p>

              <button class="btn btn-success"
                data-reg-status="${item.id}"
                data-status="Approved">Approve</button>

              <button class="btn btn-danger"
                data-reg-status="${item.id}"
                data-status="Rejected">Reject</button>

              <button class="btn btn-secondary"
                data-reg-delete="${item.id}">Delete</button>
            </div>
          `;
        }).join("") || "No registrations.";

        document.querySelectorAll("[data-reg-status]").forEach(button => {
          button.onclick = async () => {
            try {
              await updateDoc(
                doc(db, "registrations", button.dataset.regStatus),
                { status: button.dataset.status }
              );

              toast("Registration " + button.dataset.status);

            } catch (error) {
              toast(errorText(error));
            }
          };
        });

        document.querySelectorAll("[data-reg-delete]").forEach(button => {
          button.onclick = async () => {
            if (!confirm("Delete this registration?")) return;

            try {
              await deleteDoc(
                doc(db, "registrations", button.dataset.regDelete)
              );

              toast("Registration deleted!");

            } catch (error) {
              toast(errorText(error));
            }
          };
        });
      },

      error => toast(errorText(error))
    )
  );

  // ADD MONEY AND WITHDRAW REQUESTS

  ["add_money_requests", "withdraw_requests"].forEach(type => {
    unsubscribeAdmin.push(
      onSnapshot(
        collection(db, type),

        snap => {
          const target = type === "add_money_requests"
            ? "adminAddRequests"
            : "adminWithdrawRequests";

          $(target).innerHTML = snap.docs.map(item => {
            const data = item.data();

            return `
              <div class="request-item">
                <p><b>Player:</b> ${escapeHTML(data.email)}</p>
                <p><b>Amount:</b> ৳${money(data.amount)}</p>
                <p><b>Method:</b> ${escapeHTML(data.method)}</p>
                <p><b>Status:</b> ${escapeHTML(data.status)}</p>
                <p><b>Number:</b> ${escapeHTML(data.sender || data.number || "")}</p>
                <p><b>Transaction ID:</b> ${escapeHTML(data.trxId || "")}</p>

                ${
                  data.status === "Pending"
                    ? `
                      <button class="btn btn-success"
                        data-review="${type}"
                        data-id="${item.id}"
                        data-result="Approved">Approve</button>

                      <button class="btn btn-danger"
                        data-review="${type}"
                        data-id="${item.id}"
                        data-result="Rejected">Reject</button>
                    `
                    : ""
                }
              </div>
            `;
          }).join("") || "No requests.";

          document.querySelectorAll(`[data-review="${type}"]`).forEach(button => {
            button.onclick = () => reviewRequest(
              type,
              button.dataset.id,
              button.dataset.result
            );
          });
        },

        error => toast(errorText(error))
      )
    );
  });
}

// ADMIN APPROVE / REJECT

async function reviewRequest(type, requestId, result) {
  if (!isAdmin()) return;

  try {
    await runTransaction(db, async transaction => {
      const requestRef = doc(db, type, requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists()) {
        throw new Error("Request not found.");
      }

      const requestData = requestSnap.data();

      if (requestData.status !== "Pending") {
        throw new Error("This request has already been reviewed.");
      }

      const amount = Number(requestData.amount || 0);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid request amount.");
      }

      const walletRef = doc(db, "wallets", requestData.uid);
      const walletSnap = await transaction.get(walletRef);

      let balance = walletSnap.exists()
        ? Number(walletSnap.data().balance || 0)
        : 0;

      let fee = 0;

      if (type === "withdraw_requests" && result === "Approved") {
        const feeRef = doc(db, "wallet_settings", "main");
        const feeSnap = await transaction.get(feeRef);

        fee = feeSnap.exists()
          ? Number(feeSnap.data().fee || 0)
          : 0;
      }

      if (result === "Approved") {
        if (type === "add_money_requests") {
          balance += amount;
        } else {
          if (balance < amount + fee) {
            throw new Error("Player wallet has insufficient balance.");
          }

          balance -= amount + fee;
        }

        transaction.set(walletRef, {
          uid: requestData.uid,
          balance,
          updatedAt: serverTimestamp()
        });

        const transactionType =
          type === "add_money_requests"
            ? "Add Money"
            : "Withdraw";

        const transactionRef = doc(
          collection(db, "transactions")
        );

        transaction.set(transactionRef, {
          uid: requestData.uid,
          email: requestData.email,
          type: transactionType,
          amount,
          fee,
          status: "Completed",
          createdAt: serverTimestamp()
        });
      }

      transaction.update(requestRef, {
        status: result,
        reviewedAt: serverTimestamp()
      });
    });

    toast("Request " + result + "!");

  } catch (error) {
    toast(errorText(error));
  }
}

// ADMIN TOURNAMENT CREATE / EDIT

$("tournamentForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

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

  try {
    if (id) {
      await updateDoc(doc(db, "tournaments", id), data);
    } else {
      data.createdAt = serverTimestamp();

      await addDoc(
        collection(db, "tournaments"),
        data
      );
    }

    $("tournamentForm").reset();
    $("editTournamentId").value = "";

    toast("Tournament Saved!");

  } catch (error) {
    toast(errorText(error));
  }
});

// ADMIN TOURNAMENT LIST

function renderAdminTournaments() {
  if (!$("adminTournamentList")) return;

  $("adminTournamentList").innerHTML = tournamentsCache.map(item => `
    <div class="request-item">
      <b>${escapeHTML(item.name)}</b>
      <p>${escapeHTML(item.mode)} | ${escapeHTML(item.status)}</p>

      <button class="btn"
        data-edit-tournament="${escapeHTML(item.id)}">Edit</button>

      <button class="btn btn-danger"
        data-delete-tournament="${escapeHTML(item.id)}">Delete</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-edit-tournament]").forEach(button => {
    button.onclick = () => {
      const item = tournamentsCache.find(
        t => t.id === button.dataset.editTournament
      );

      if (!item) return;

      $("editTournamentId").value = item.id;
      $("tournamentName").value = item.name || "";
      $("tournamentMode").value = item.mode || "Solo";
      $("tournamentDate").value = item.date || "";
      $("tournamentPrize").value = item.prize || 0;
      $("tournamentSlots").value = item.slots || 1;
      $("tournamentStatus").value = item.status || "Upcoming";

      $("tournamentForm").scrollIntoView({
        behavior: "smooth"
      });
    };
  });

  document.querySelectorAll("[data-delete-tournament]").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this tournament?")) return;

      try {
        await deleteDoc(
          doc(db, "tournaments", button.dataset.deleteTournament)
        );

        toast("Tournament deleted!");

      } catch (error) {
        toast(errorText(error));
      }
    };
  });
}

function renderRoomTournamentOptions() {
  if (!$("roomTournament")) return;

  const oldValue = $("roomTournament").value;

  $("roomTournament").innerHTML = tournamentsCache.map(item => `
    <option value="${escapeHTML(item.id)}">
      ${escapeHTML(item.name)}
    </option>
  `).join("");

  if (oldValue) {
    $("roomTournament").value = oldValue;
  }
}

// ROOM INFORMATION

$("roomForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  try {
    const tournamentId = $("roomTournament").value;

    if (!tournamentId) {
      throw new Error("Select a tournament.");
    }

    await setDoc(
      doc(db, "tournament_private", tournamentId),
      {
        roomId: $("roomId").value.trim(),
        roomPassword: $("roomPassword").value.trim(),
        updatedAt: serverTimestamp()
      }
    );

    $("roomForm").reset();

    toast("Room Information Saved!");

  } catch (error) {
    toast(errorText(error));
  }
});

// ADMIN MANUAL WALLET BALANCE

$("balanceForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  const uid = $("balanceUID").value.trim();
  const amount = Number($("balanceAmount").value);
  const action = $("balanceAction").value;

  if (!uid || !Number.isFinite(amount) || amount <= 0) {
    return toast("Enter valid player UID and amount.");
  }

  try {
    await runTransaction(db, async transaction => {
      const walletRef = doc(db, "wallets", uid);
      const snap = await transaction.get(walletRef);

      const oldBalance = snap.exists()
        ? Number(snap.data().balance || 0)
        : 0;

      const newBalance = action === "add"
        ? oldBalance + amount
        : oldBalance - amount;

      if (newBalance < 0) {
        throw new Error("Balance cannot be negative.");
      }

      transaction.set(walletRef, {
        uid,
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      const transactionRef = doc(
        collection(db, "transactions")
      );

      transaction.set(transactionRef, {
        uid,
        type: action === "add"
          ? "Admin Added Balance"
          : "Admin Removed Balance",
        amount,
        status: "Completed",
        createdAt: serverTimestamp()
      });
    });

    $("balanceForm").reset();

    toast("Player Balance Updated!");

  } catch (error) {
    toast(errorText(error));
  }
});

// WITHDRAW FEE

async function loadWalletFee() {
  try {
    const snap = await getDoc(
      doc(db, "wallet_settings", "main")
    );

    $("withdrawFee").value = snap.exists()
      ? Number(snap.data().fee || 0)
      : 0;

  } catch (error) {
    console.error(error);
  }
}

$("feeForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  const fee = Number($("withdrawFee").value);

  if (!Number.isFinite(fee) || fee < 0) {
    return toast("Enter a valid fee.");
  }

  try {
    await setDoc(
      doc(db, "wallet_settings", "main"),
      {
        fee,
        updatedAt: serverTimestamp()
      }
    );

    toast("Withdraw Fee Saved!");

  } catch (error) {
    toast(errorText(error));
  }
});

// WEBSITE SETTINGS

async function loadWebsiteSettings() {
  try {
    const snap = await getDoc(
      doc(db, "settings", "website")
    );

    if (!snap.exists()) return;

    const data = snap.data();

    $("settingTitle").value = data.title || "";
    $("settingHeroTitle").value = data.heroTitle || "";
    $("settingDescription").value = data.description || "";
    $("settingKeywords").value = data.keywords || "";
    $("settingPhone").value = data.phone || "";
    $("settingWhatsApp").value = data.whatsApp || "";
    $("settingFacebook").value = data.facebook || "";
    $("settingYouTube").value = data.youTube || "";

  } catch (error) {
    console.error(error);
  }
}

async function loadPublicWebsiteSettings() {
  try {
    const snap = await getDoc(
      doc(db, "settings", "website")
    );

    if (!snap.exists()) return;

    const data = snap.data();

    if ($("contactPhone")) {
      $("contactPhone").textContent = data.phone || "Not available";
    }

    if ($("contactWhatsApp")) {
      $("contactWhatsApp").textContent = data.whatsApp || "Not available";
    }

    if ($("contactFacebook")) {
      $("contactFacebook").textContent = data.facebook || "Not available";
    }

    if ($("contactYouTube")) {
      $("contactYouTube").textContent = data.youTube || "Not available";
    }

    if (data.title) {
      document.title = data.title;
    }

    if (data.heroTitle) {
      const heading = document.querySelector(".hero h1");

      if (heading) {
        heading.textContent = data.heroTitle;
      }
    }

    if (data.description) {
      const paragraph = document.querySelector(".hero p");

      if (paragraph) {
        paragraph.textContent = data.description;
      }
    }

    if (data.bannerUrl) {
      showBanner(data.bannerUrl);

      const hero = document.querySelector(".hero");

      if (hero) {
        hero.style.backgroundImage =
          `linear-gradient(90deg,rgba(7,11,22,.95),rgba(7,11,22,.55)),url("${data.bannerUrl}")`;

        hero.style.backgroundSize = "cover";
        hero.style.backgroundPosition = "center";
      }
    }

  } catch (error) {
    console.error(error);
  }
}

$("settingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  try {
    await setDoc(
      doc(db, "settings", "website"),
      {
        title: $("settingTitle").value.trim(),
        heroTitle: $("settingHeroTitle").value.trim(),
        description: $("settingDescription").value.trim(),
        keywords: $("settingKeywords").value.trim(),
        phone: $("settingPhone").value.trim(),
        whatsApp: $("settingWhatsApp").value.trim(),
        facebook: $("settingFacebook").value.trim(),
        youTube: $("settingYouTube").value.trim(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    await loadPublicWebsiteSettings();

    toast("Website Settings Saved!");

  } catch (error) {
    toast(errorText(error));
  }
});

// BANNER

$("saveBanner")?.addEventListener("click", async () => {
  if (!isAdmin()) return;

  const url = $("bannerUrl").value.trim();

  if (!url) {
    return toast("Enter banner image URL.");
  }

  try {
    await setDoc(
      doc(db, "settings", "website"),
      {
        bannerUrl: url,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    showBanner(url);

    await loadPublicWebsiteSettings();

    toast("Banner Saved!");

  } catch (error) {
    toast(errorText(error));
  }
});

$("deleteBanner")?.addEventListener("click", async () => {
  if (!isAdmin()) return;

  try {
    await setDoc(
      doc(db, "settings", "website"),
      {
        bannerUrl: "",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    $("bannerUrl").value = "";
    $("bannerPreview").innerHTML = "";

    const hero = document.querySelector(".hero");

    if (hero) {
      hero.style.backgroundImage = "";
    }

    toast("Banner Deleted!");

  } catch (error) {
    toast(errorText(error));
  }
});

function showBanner(url) {
  if (!url || !$("bannerPreview")) return;

  $("bannerPreview").innerHTML = `
    <img src="${escapeHTML(url)}"
      alt="Tournament Banner"
      style="width:100%;max-height:250px;object-fit:cover;border-radius:12px;margin-top:12px">
  `;
}

async function loadBanner() {
  try {
    const snap = await getDoc(
      doc(db, "settings", "website")
    );

    if (!snap.exists()) return;

    const url = snap.data().bannerUrl || "";

    if ($("bannerUrl")) {
      $("bannerUrl").value = url;
    }

    if (url) {
      showBanner(url);
    }

  } catch (error) {
    console.error(error);
  }
}

// INITIALIZE APP

startTournamentListener();

loadPublicWebsiteSettings();

// SERVICE WORKER

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch(error => {
        console.log("Service worker:", error.message);
      });
  });
  }
