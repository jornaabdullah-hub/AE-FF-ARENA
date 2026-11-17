
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, setDoc,
  deleteDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const toursRef = collection(db, "tournaments");
const regsRef = collection(db, "registrations");
const settingsRef = doc(db, "site_settings", "public");

let tours = [];
let regsUnsub = null;
let settings = {};

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function showModal(id) {
  $(id).classList.add("show");
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

$("adminBtn").onclick = () => showModal("adminModal");
$("logout").onclick = () => signOut(auth);

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(
      auth, $("email").value.trim(), $("password").value
    );
  } catch (err) {
    alert("Login হয়নি: " + err.message);
  }
});

// Public website settings
onSnapshot(settingsRef, snap => {
  settings = snap.exists() ? snap.data() : {};
  applySettings();
}, err => console.error("Settings error:", err));

function applySettings() {
  const title = settings.siteTitle || "AE FF ARENA";
  document.title = title;
  $("siteTitleText").textContent = title;
  $("heroTitle").textContent = settings.heroTitle || "ENTER THE BATTLE ZONE";
  $("heroDescription").textContent =
    settings.siteDescription || "তোমার স্কোয়াড তৈরি করো। টুর্নামেন্টে যোগ দাও। জিতে নাও গৌরব।";

  $("siteKeywords").setAttribute("content", settings.siteKeywords || "AE FF ARENA, Free Fire Tournament, Bangladesh Esports");
  $("siteDescriptionMeta").setAttribute("content", settings.siteDescription || "AE FF ARENA Bangladesh Community Esports");

  const banner = $("heroBanner");
  if (settings.bannerData) {
    banner.src = settings.bannerData;
    banner.hidden = false;
  } else {
    banner.removeAttribute("src");
    banner.hidden = true;
  }

  $("contactPhoneView").textContent = settings.contactPhone || "Not added";
  $("whatsappView").textContent = settings.whatsappNumber || "Not added";

  const phone = (settings.contactPhone || "").replace(/[^\d+]/g, "");
  const wa = (settings.whatsappNumber || "").replace(/\D/g, "");

  $("phoneLink").href = phone ? "tel:" + phone : "#";
  $("whatsappLink").href = wa ? "https://wa.me/" + wa : "#";
  $("facebookLink").href = safeUrl(settings.facebookUrl);
  $("youtubeLink").href = safeUrl(settings.youtubeUrl);

  if (auth.currentUser && auth.currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    fillSettingsForm();
  }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function fillSettingsForm() {
  $("settingTitle").value = settings.siteTitle || "";
  $("settingHeroTitle").value = settings.heroTitle || "";
  $("settingDescription").value = settings.siteDescription || "";
  $("settingKeywords").value = settings.siteKeywords || "";
  $("settingPhone").value = settings.contactPhone || "";
  $("settingWhatsapp").value = settings.whatsappNumber || "";
  $("settingFacebook").value = settings.facebookUrl || "";
  $("settingYoutube").value = settings.youtubeUrl || "";
  if (settings.bannerData) {
    $("bannerPreview").src = settings.bannerData;
    $("bannerPreview").hidden = false;
  } else {
    $("bannerPreview").removeAttribute("src");
    $("bannerPreview").hidden = true;
  }
}

$("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!isAdmin()) return alert("Admin login required");

  const data = {
    siteTitle: $("settingTitle").value.trim() || "AE FF ARENA",
    heroTitle: $("settingHeroTitle").value.trim(),
    siteDescription: $("settingDescription").value.trim(),
    siteKeywords: $("settingKeywords").value.trim(),
    contactPhone: $("settingPhone").value.trim(),
    whatsappNumber: $("settingWhatsapp").value.trim(),
    facebookUrl: $("settingFacebook").value.trim(),
    youtubeUrl: $("settingYoutube").value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(settingsRef, data, { merge: true });
    alert("Website settings saved!");
  } catch (err) {
    alert("Save হয়নি: " + err.message);
  }
});

function isAdmin() {
  return !!auth.currentUser &&
    auth.currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Compress banner image before saving it in Firestore
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("একটি ছবি নির্বাচন করো"));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      let width = image.width;
      let height = image.height;
      const maxWidth = 1200;
      const maxHeight = 650;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const makeImage = () => {
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        let quality = 0.72;
        let result = canvas.toDataURL("image/jpeg", quality);

        while (result.length * 0.75 > 700 * 1024 && quality > 0.42) {
          quality -= 0.07;
          result = canvas.toDataURL("image/jpeg", quality);
        }

        if (result.length * 0.75 > 700 * 1024 && width > 400) {
          width = Math.round(width * 0.8);
          height = Math.round(height * 0.8);
          makeImage();
          return;
        }

        URL.revokeObjectURL(objectUrl);
        if (result.length * 0.75 > 700 * 1024) {
          reject(new Error("ছবিটি অনেক বড়। অন্য ছোট ছবি দাও।"));
        } else {
          resolve(result);
        }
      };

      makeImage();
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("ছবিটি খোলা যায়নি"));
    };
    image.src = objectUrl;
  });
}

$("bannerFile").addEventListener("change", async () => {
  const file = $("bannerFile").files[0];
  if (!file) return;
  try {
    const data = await compressImage(file);
    $("bannerPreview").src = data;
    $("bannerPreview").hidden = false;
    $("bannerPreview").dataset.newImage = data;
  } catch (err) {
    alert(err.message);
    $("bannerFile").value = "";
  }
});

$("saveBanner").onclick = async () => {
  if (!isAdmin()) return alert("Admin login required");
  const data = $("bannerPreview").dataset.newImage;
  if (!data) return alert("আগে Gallery থেকে ছবি নির্বাচন করো");

  try {
    await setDoc(settingsRef, {
      bannerData: data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    $("bannerPreview").dataset.newImage = "";
    $("bannerFile").value = "";
    alert("Banner uploaded successfully!");
  } catch (err) {
    alert("Banner upload হয়নি: " + err.message);
  }
};

$("deleteBanner").onclick = async () => {
  if (!isAdmin()) return alert("Admin login required");
  if (!confirm("Banner delete করবেন?")) return;
  try {
    await setDoc(settingsRef, {
      bannerData: null,
      updatedAt: serverTimestamp()
    }, { merge: true });
    $("bannerPreview").removeAttribute("src");
    $("bannerPreview").hidden = true;
    $("bannerPreview").dataset.newImage = "";
    $("bannerFile").value = "";
    alert("Banner deleted");
  } catch (err) {
    alert(err.message);
  }
};

// Tournament list
function renderTours() {
  $("countT").textContent = tours.length;

  $("tournaments").innerHTML = tours.map(t => `
    <article class="card">
      <span class="tag">${esc(t.mode)} / ${esc(t.status)}</span>
      <h3>${esc(t.name)}</h3>
      <p class="muted">${esc(t.date || "তারিখ জানানো হবে")}</p>
      <div class="meta"><span>PRIZE POOL</span><b>${esc(t.prize || "—")}</b></div>
      <div class="meta"><span>SLOTS</span><b>${esc(t.slots || "—")}</b></div>
      <button class="cta" data-join="${esc(t.id)}">JOIN TOURNAMENT ↗</button>
    </article>
  `).join("") || "<p>এখনো কোনো Tournament নেই। Admin Panel থেকে তৈরি করো।</p>";

  $("roomTournament").innerHTML = tours.map(t =>
    `<option value="${esc(t.id)}">${esc(t.name)}</option>`
  ).join("");

  $("adminTourList").innerHTML = tours.map(t => `
    <div class="admin-tour">
      <b>${esc(t.name)}</b> — ${esc(t.mode)}
      <button class="ghost small" data-edit="${esc(t.id)}">Edit</button>
      <button class="ghost small" data-delete="${esc(t.id)}">Delete</button>
    </div>
  `).join("") || "<p>কোনো Tournament নেই</p>";
}

onSnapshot(toursRef, snap => {
  tours = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTours();
  $("connection").textContent = "● FIREBASE CONNECTED";
}, err => {
  $("connection").textContent = "Firebase error";
  console.error(err);
});

$("tournaments").addEventListener("click", e => {
  const id = e.target.dataset.join;
  if (!id) return;
  $("joinTournament").value = id;
  showModal("joinModal");
});

$("joinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("joinTournament").value;
  const t = tours.find(x => x.id === id);
  if (!t) return alert("Tournament পাওয়া যায়নি");

  const name = $("pname").value.trim();
  const uid = $("puid").value.trim();
  const contact = $("pcontact").value.trim();
  if (!name || !uid || !contact) return;

  try {
    await addDoc(regsRef, {
      name, uid, contact,
      tournamentId: id,
      tournamentName: t.name,
      createdAt: serverTimestamp()
    });
    e.target.reset();
    hideModals();
    alert("রেজিস্ট্রেশন সফল হয়েছে!");
  } catch (err) {
    alert("রেজিস্ট্রেশন হয়নি: " + err.message);
  }
});

// Admin login state and registrations
onAuthStateChanged(auth, user => {
  const admin = !!user &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  $("loginBox").hidden = admin;
  $("dashboard").hidden = !admin;

  if (user && !admin) {
    alert("এই অ্যাকাউন্ট Admin নয়।");
    signOut(auth);
    return;
  }

  if (admin) {
    $("adminIdentity").textContent = "Signed in: " + user.email;
    fillSettingsForm();
    startAdminListeners();
  } else if (regsUnsub) {
    regsUnsub();
    regsUnsub = null;
  }
});

function startAdminListeners() {
  if (regsUnsub) regsUnsub();

  regsUnsub = onSnapshot(
    query(regsRef, orderBy("createdAt", "desc")),
    snap => {
      $("countR").textContent = snap.size;
      $("registrationList").innerHTML = snap.docs.map(d => {
        const r = d.data();
        return `<div>
          <b>${esc(r.name)}</b> |
          UID: ${esc(r.uid)} |
          ${esc(r.contact)} |
          ${esc(r.tournamentName || r.tournamentId)}
        </div>`;
      }).join("") || "কোনো রেজিস্ট্রেশন নেই";
    },
    err => {
      $("registrationList").textContent = "Load error: " + err.message;
    }
  );
}

$("tourForm").addEventListener("submit", async e => {
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
      await addDoc(toursRef, { ...data, createdAt: serverTimestamp() });
    }
    e.target.reset();
    $("tid").value = "";
    $("slots").value = 48;
    alert("Tournament saved!");
  } catch (err) {
    alert("Save হয়নি: " + err.message);
  }
});

$("resetTour").onclick = () => {
  $("tourForm").reset();
  $("tid").value = "";
  $("slots").value = 48;
};

$("adminTourList").addEventListener("click", async e => {
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
    $("slots").value = t.slots || 48;
    $("status").value = t.status || "OPEN";
    $("tname").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
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

$("roomForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!isAdmin()) return alert("Admin login required");
  const id = $("roomTournament").value;
  if (!id) return alert("আগে Tournament তৈরি করো");

  try {
    await setDoc(doc(db, "tournament_private", id), {
      roomId: $("roomId").value.trim(),
      roomPassword: $("roomPassword").value.trim(),
      updatedAt: serverTimestamp()
    });
    alert("Private room details saved");
    e.target.reset();
  } catch (err) {
    alert(err.message);
  }
});

$("refreshRegs").onclick = startAdminListeners;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  });
}
