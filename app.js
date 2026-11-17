import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
const toursRef=collection(db,"tournaments"), regsRef=collection(db,"registrations");
let tours=[], regsUnsub=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showModal(id){$(id).classList.add("show")}
function hideModals(){document.querySelectorAll(".modal").forEach(m=>m.classList.remove("show"))}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=hideModals);
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)hideModals()}));
$("adminBtn").onclick=()=>showModal("adminModal");
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value)}catch(err){alert("Login হয়নি: "+err.message)}});
$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{
 const isAdmin=!!user&&user.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase();
 $("loginBox").hidden=isAdmin;$("dashboard").hidden=!isAdmin;
 if(user&&!isAdmin){alert("এই অ্যাকাউন্ট Admin নয়।");signOut(auth);return}
 if(isAdmin){$("adminIdentity").textContent="Signed in: "+user.email;startAdminListeners()}
 else if(regsUnsub){regsUnsub();regsUnsub=null}
});
function startAdminListeners(){
 if(regsUnsub)regsUnsub();
 regsUnsub=onSnapshot(query(regsRef,orderBy("createdAt","desc")),snap=>{
   $("registrationList").innerHTML=snap.docs.map(d=>{const r=d.data();return `<div><b>${esc(r.name)}</b> | UID: ${esc(r.uid)} | ${esc(r.contact)} | ${esc(r.tournamentName||r.tournamentId)}</div>`}).join("")||"কোনো রেজিস্ট্রেশন নেই";
 },err=>{$("registrationList").textContent="Load error: "+err.message});
 fillRoomSelect();
}
$("joinForm").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("joinTournament").value,t=tours.find(x=>x.id===id);if(!t)return alert("Tournament পাওয়া যায়নি");
 const name=$("pname").value.trim(),uid=$("puid").value.trim(),contact=$("pcontact").value.trim();
 if(!name||!uid||!contact)return;
 try{await addDoc(regsRef,{name,uid,contact,tournamentId:id,tournamentName:t.name,createdAt:serverTimestamp()});e.target.reset();hideModals();alert("রেজিস্ট্রেশন সফল হয়েছে!")}catch(err){alert("রেজিস্ট্রেশন হয়নি: "+err.message)}
});
function renderTours(){
 $("countT").textContent=tours.length;$("countR").textContent=regsCount;
 $("tournaments").innerHTML=tours.map(t=>`<article class="card"><span class="tag">${esc(t.mode)} / ${esc(t.status)}</span><h3>${esc(t.name)}</h3><p class="muted">${esc(t.date||"তারিখ জানানো হবে")}</p><div class="meta"><span>PRIZE POOL</span><b>${esc(t.prize||"—")}</b></div><div class="meta"><span>SLOTS</span><b>${esc(t.slots||"—")}</b></div><button class="cta" data-join="${esc(t.id)}">JOIN TOURNAMENT ↗</button></article>`).join("")||"<p>এখনো কোনো Tournament নেই। Admin Panel থেকে তৈরি করো।</p>";
 $("roomTournament").innerHTML=tours.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
 $("adminTourList").innerHTML=tours.map(t=>`<div><b>${esc(t.name)}</b> — ${esc(t.mode)} <button class="ghost" data-edit="${esc(t.id)}">Edit</button> <button class="ghost" data-delete="${esc(t.id)}">Delete</button></div>`).join("");
}
let regsCount=0;
onSnapshot(toursRef,snap=>{tours=snap.docs.map(d=>({id:d.id,...d.data()}));renderTours();$("connection").textContent="● FIREBASE CONNECTED"},err=>{$("connection").textContent="Firebase error";console.error(err)});
onSnapshot(regsRef,snap=>{regsCount=snap.size;$("countR").textContent=regsCount},()=>{});
$("tournaments").addEventListener("click",e=>{const id=e.target.dataset.join;if(!id)return;$("joinTournament").value=id;showModal("joinModal")});
$("tourForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!auth.currentUser||auth.currentUser.email.toLowerCase()!==ADMIN_EMAIL.toLowerCase())return alert("Admin login required");
 const data={name:$("tname").value.trim(),mode:$("mode").value,date:$("date").value.trim(),prize:$("prize").value.trim(),slots:Number($("slots").value),status:$("status").value,updatedAt:serverTimestamp()};
 try{const id=$("tid").value;if(id)await setDoc(doc(db,"tournaments",id),data,{merge:true});else await addDoc(toursRef,{...data,createdAt:serverTimestamp()});e.target.reset();$("tid").value="";alert("Tournament saved")}catch(err){alert(err.message)}
});
$("resetTour").onclick=()=>{$("tourForm").reset();$("tid").value=""};
function fillRoomSelect(){const sel=$("roomTournament");sel.innerHTML=tours.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}
$("roomForm").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("roomTournament").value;if(!id)return;
 try{await setDoc(doc(db,"tournament_private",id),{roomId:$("roomId").value.trim(),roomPassword:$("roomPassword").value.trim(),updatedAt:serverTimestamp()});alert("Private room details saved")}catch(err){alert(err.message)}
});
$("refreshRegs").onclick=()=>startAdminListeners();

$("adminTourList").addEventListener("click",async e=>{
 const edit=e.target.dataset.edit,del=e.target.dataset.delete;
 if(edit){const t=tours.find(x=>x.id===edit);if(!t)return;$("tid").value=t.id;$("tname").value=t.name||"";$("mode").value=t.mode||"SOLO";$("date").value=t.date||"";$("prize").value=t.prize||"";$("slots").value=t.slots||1;$("status").value=t.status||"OPEN";$("tname").focus()}
 if(del){if(!confirm("এই Tournament delete করবেন?"))return;try{await deleteDoc(doc(db,"tournaments",del));await deleteDoc(doc(db,"tournament_private",del));alert("Tournament deleted")}catch(err){alert(err.message)}}
});

// Admin can edit/delete tournaments from cards inside dashboard via separate controls rendered below.
function adminTourTools(){/* reserved for next dashboard enhancement */}

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
