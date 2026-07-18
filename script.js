import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- DOM refs ----------
const views = {
  auth: document.getElementById("authView"),
  dashboard: document.getElementById("dashboardView"),
  create: document.getElementById("createView"),
  event: document.getElementById("eventView")
};
const loadingMsg = document.getElementById("loadingMsg");
const authStatus = document.getElementById("authStatus");

let currentUser = null;
let attendeeUnsub = null;

// ---------- Theme ----------
const themeToggle = document.getElementById("themeToggle");
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
  localStorage.setItem("theme", theme);
}
applyTheme(localStorage.getItem("theme") || "light");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

function showView(name) {
  loadingMsg.classList.add("hidden");
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function getEventIdFromUrl() {
  return new URLSearchParams(window.location.search).get("event");
}

// ---------- Auth UI ----------
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authError = document.getElementById("authError");

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authError.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authError.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    authError.textContent = friendlyAuthError(err);
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    authError.textContent = friendlyAuthError(err);
  }
});

document.getElementById("googleSignIn").addEventListener("click", async () => {
  authError.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    authError.textContent = friendlyAuthError(err);
  }
});

function friendlyAuthError(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/weak-password": "Password must be at least 6 characters."
  };
  return map[err.code] || err.message;
}

// ---------- Header / logout ----------
function renderAuthStatus() {
  authStatus.innerHTML = "";
  if (currentUser) {
    const span = document.createElement("span");
    span.textContent = currentUser.displayName || currentUser.email;
    const btn = document.createElement("button");
    btn.id = "logoutBtn";
    btn.textContent = "Log Out";
    btn.addEventListener("click", () => signOut(auth));
    authStatus.append(span, btn);
  }
}

// ---------- Dashboard ----------
document.getElementById("showCreateForm").addEventListener("click", () => {
  showView("create");
});
document.getElementById("cancelCreate").addEventListener("click", () => {
  document.getElementById("createEventForm").reset();
  showView("dashboard");
  loadDashboard();
});

document.getElementById("createEventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("eventTitle").value.trim();
  const time = document.getElementById("eventTime").value;
  const location = document.getElementById("eventLocation").value.trim();
  const description = document.getElementById("eventDescription").value.trim();

  const docRef = await addDoc(collection(db, "events"), {
    title,
    time,
    location,
    description,
    hostId: currentUser.uid,
    hostName: currentUser.displayName || currentUser.email,
    createdAt: serverTimestamp()
  });

  document.getElementById("createEventForm").reset();
  window.location.search = `?event=${docRef.id}`;
});

async function loadDashboard() {
  const listEl = document.getElementById("eventsList");
  listEl.innerHTML = "<p class='muted'>Loading your events...</p>";
  const q = query(collection(db, "events"), where("hostId", "==", currentUser.uid));
  const snap = await getDocs(q);
  listEl.innerHTML = "";
  if (snap.empty) {
    listEl.innerHTML = "<p class='muted'>You haven't created any events yet.</p>";
    return;
  }
  const eventsArr = [];
  snap.forEach(d => eventsArr.push({ id: d.id, ...d.data() }));
  eventsArr.sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  eventsArr.forEach(ev => {
    const a = document.createElement("a");
    a.className = "event-card";
    a.href = `?event=${ev.id}`;
    a.innerHTML = `
      <div>
        <strong>${escapeHtml(ev.title)}</strong>
        <div class="meta">${formatDateTime(ev.time)} &middot; ${escapeHtml(ev.location)}</div>
      </div>
      <span>&rarr;</span>
    `;
    listEl.appendChild(a);
  });
}

// ---------- Event / RSVP view ----------
const eventDetailsEl = document.getElementById("eventDetails");
const hostControls = document.getElementById("hostControls");
const rsvpControls = document.getElementById("rsvpControls");
const rsvpForm = document.getElementById("rsvpForm");
const rsvpConfirmed = document.getElementById("rsvpConfirmed");
const attendeeListEl = document.getElementById("attendeeList");
const attendeeCountEl = document.getElementById("attendeeCount");

async function loadEventView(eventId) {
  showView("event");
  eventDetailsEl.innerHTML = "<p class='muted'>Loading event...</p>";
  hostControls.classList.add("hidden");
  rsvpControls.classList.remove("hidden");
  rsvpForm.classList.remove("hidden");
  rsvpConfirmed.classList.add("hidden");

  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) {
    eventDetailsEl.innerHTML = "<p class='error-text'>This event doesn't exist or was deleted.</p>";
    attendeeListEl.innerHTML = "";
    rsvpControls.classList.add("hidden");
    return;
  }
  const ev = snap.data();

  eventDetailsEl.innerHTML = `
    <h1>${escapeHtml(ev.title)}</h1>
    <p class="meta">${formatDateTime(ev.time)} &middot; ${escapeHtml(ev.location)}</p>
    <p>${escapeHtml(ev.description || "")}</p>
    <p class="muted">Hosted by ${escapeHtml(ev.hostName || "")}</p>
  `;

  const isHost = currentUser && currentUser.uid === ev.hostId;
  if (isHost) {
    hostControls.classList.remove("hidden");
    const link = `${window.location.origin}${window.location.pathname}?event=${eventId}`;
    document.getElementById("shareLink").value = link;
  }

  if (localStorage.getItem(`rsvp_${eventId}`)) {
    rsvpForm.classList.add("hidden");
    rsvpConfirmed.classList.remove("hidden");
  }

  if (attendeeUnsub) attendeeUnsub();
  attendeeUnsub = onSnapshot(
    collection(db, "events", eventId, "attendees"),
    (snapshot) => {
      attendeeCountEl.textContent = snapshot.size;
      attendeeListEl.innerHTML = "";
      snapshot.forEach(d => {
        const li = document.createElement("li");
        li.textContent = d.data().name;
        attendeeListEl.appendChild(li);
      });
    }
  );

  document.getElementById("copyLink").onclick = () => {
    const input = document.getElementById("shareLink");
    input.select();
    navigator.clipboard.writeText(input.value);
  };

  document.getElementById("deleteEvent").onclick = async () => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    await deleteDoc(doc(db, "events", eventId));
    window.location.search = "";
  };

  document.getElementById("rsvpSubmit").onclick = async () => {
    const nameInput = document.getElementById("rsvpName");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    await addDoc(collection(db, "events", eventId, "attendees"), {
      name,
      respondedAt: serverTimestamp()
    });
    localStorage.setItem(`rsvp_${eventId}`, "1");
    rsvpForm.classList.add("hidden");
    rsvpConfirmed.classList.remove("hidden");
  };
}

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

// ---------- Router ----------
function route() {
  const eventId = getEventIdFromUrl();
  if (eventId) {
    loadEventView(eventId);
  } else if (currentUser) {
    showView("dashboard");
    loadDashboard();
  } else {
    showView("auth");
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  renderAuthStatus();
  route();
});
