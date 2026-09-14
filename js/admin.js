/**
 * Elite X Gamers - Comprehensive Admin Control Center
 * Manages BR Results, 1v1 Matches, Tournaments, Users, Support, Payouts, and System Settings.
 */

import {
    auth,
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    limit,
    serverTimestamp,
    runTransaction,
    onSnapshot,
    increment,
    RAZORPAY_KEY_ID
} from "./firebase.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const money = v => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
const formatDt = v => {
    if (!v) return "—";
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
};

function toast(msg, isError = false) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = isError ? "toast error show" : "toast show";
    setTimeout(() => t.classList.remove("show"), 3000);
}

let currentAdmin = null;

// =========================================================
// 1. ADMIN AUTHENTICATION
// =========================================================
onAuthStateChanged(auth, async user => {
    if (!user) {
        $("adminLogin")?.classList.remove("hidden");
        $("adminDashboard")?.classList.add("hidden");
        return;
    }

    try {
        const isMasterAdminEmail = (user.email === "admin@elitexgamers.com" || user.email === "elitexgamers.official@gmail.com");
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        const isAuthorized = adminDoc.exists() && adminDoc.data()?.active === true;

        if (!isAuthorized) {
            if (isMasterAdminEmail) {
                await setDoc(doc(db, "admins", user.uid), {
                    active: true,
                    role: "superadmin",
                    email: user.email,
                    createdAt: serverTimestamp()
                }, { merge: true });
            } else {
                const allAdmins = await getDocs(collection(db, "admins"));
                if (allAdmins.empty) {
                    await setDoc(doc(db, "admins", user.uid), {
                        active: true,
                        role: "superadmin",
                        email: user.email,
                        createdAt: serverTimestamp()
                    });
                } else {
                    throw new Error("This account is not authorized as an administrator for elitexgamers-17353.");
                }
            }
        }

        currentAdmin = user;
        $("adminLogin")?.classList.add("hidden");
        $("adminDashboard")?.classList.remove("hidden");
        if ($("adminEmailDisplay")) $("adminEmailDisplay").textContent = user.email || user.uid;

        loadDashboardStats();
        setupNavigation();
    } catch (e) {
        if ($("loginError")) $("loginError").textContent = e.message;
        await signOut(auth);
    }
});

$("loginForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("loginError");
    err.textContent = "";
    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (x) {
        // If user does not exist yet and it's the master admin email, automatically create it
        if (email === "admin@elitexgamers.com" || x.code === "auth/user-not-found" || x.code === "auth/invalid-credential") {
            try {
                await createUserWithEmailAndPassword(auth, email, password);
                return;
            } catch (createErr) {
                err.textContent = x.message || createErr.message || "Failed to sign in.";
                return;
            }
        }
        err.textContent = x.message || "Failed to sign in.";
    }
});

$("quickAdminBtn")?.addEventListener("click", () => {
    $("adminEmail").value = "admin@elitexgamers.com";
    $("adminPassword").value = "Admin@123456";
    $("loginForm")?.dispatchEvent(new Event("submit"));
});

$("logoutButton")?.addEventListener("click", () => signOut(auth));

// =========================================================
// 2. SECTION NAVIGATION
// =========================================================
function setupNavigation() {
    document.querySelectorAll(".side-link[data-section]").forEach(btn => {
        btn.onclick = () => showSection(btn.dataset.section);
    });
    document.querySelectorAll(".quick-action[data-section]").forEach(btn => {
        btn.onclick = () => showSection(btn.dataset.section);
    });
}

function showSection(name) {
    document.querySelectorAll(".admin-section").forEach(s => s.classList.add("hidden"));
    $(`section-${name}`)?.classList.remove("hidden");

    document.querySelectorAll(".side-link[data-section]").forEach(b => {
        b.classList.toggle("active", b.dataset.section === name);
    });

    const title = document.querySelector(`.side-link[data-section="${name}"]`)?.textContent || name;
    if ($("pageTitle")) $("pageTitle").textContent = title.replace(/[▦♙🏆◈🪂🐺📋＋↙₹↕🔔🎧▧❓⚙☷🛡]/g, "").trim();

    if (name === "dashboard") loadDashboardStats();
    if (name === "users") loadUsersList();
    if (name === "tournaments") loadTournamentsList();
    if (name === "matches") loadMatchesList();
    if (name === "br_results") initBrResults();
    if (name === "lonewolf") initLoneWolf();
    if (name === "results") loadResultsArchive();
    if (name === "deposits") loadDepositsList();
    if (name === "withdrawals") loadWithdrawalsList();
    if (name === "wallets") loadWalletsList();
    if (name === "support") loadSupportTickets();
    if (name === "banners") loadBanners();
    if (name === "faqs") loadFaqs();
    if (name === "payments") loadPaymentSettings();
    if (name === "appsettings") loadAppSettings();
    if (name === "admin_mgmt") loadAdminsList();
}

// =========================================================
// 3. DASHBOARD STATS
// =========================================================
async function loadDashboardStats() {
    try {
        const [uSnap, tSnap, dSnap, wSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "tournaments")),
            getDocs(query(collection(db, "deposits"), where("status", "==", "PENDING"))),
            getDocs(query(collection(db, "withdrawals"), where("status", "==", "PENDING")))
        ]);

        if ($("statUsers")) $("statUsers").textContent = uSnap.size;
        if ($("statTournaments")) $("statTournaments").textContent = tSnap.size;
        if ($("statDeposits")) $("statDeposits").textContent = dSnap.size;
        if ($("statWithdrawals")) $("statWithdrawals").textContent = wSnap.size;

        if ($("depositBadge")) $("depositBadge").textContent = dSnap.size > 0 ? dSnap.size : "";
        if ($("withdrawBadge")) $("withdrawBadge").textContent = wSnap.size > 0 ? wSnap.size : "";
    } catch (e) {
        console.error("Dashboard stats error", e);
    }
}

// =========================================================
// 4. USERS MANAGEMENT
// =========================================================
let cachedUsers = [];
async function loadUsersList() {
    try {
        const [uSnap, wSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "wallets"))
        ]);

        const wallets = {};
        wSnap.forEach(d => wallets[d.id] = d.data());

        cachedUsers = [];
        uSnap.forEach(d => {
            const u = d.data();
            cachedUsers.push({ id: d.id, ...u, wallet: wallets[d.id] || {} });
        });

        renderUsersTable();
    } catch (e) {
        if ($("usersTable")) $("usersTable").innerHTML = `<tr><td colspan="7">Error loading users: ${esc(e.message)}</td></tr>`;
    }
}

function renderUsersTable() {
    const q = ($("userSearch")?.value || "").toLowerCase().trim();
    const filtered = cachedUsers.filter(u => {
        const str = [u.id, u.username, u.email, u.phone].join(" ").toLowerCase();
        return !q || str.includes(q);
    });

    const tbody = $("usersTable");
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No players found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const w = u.wallet || {};
        const isActive = u.status !== "SUSPENDED" && u.active !== false;
        return `
            <tr>
                <td><strong>${esc(u.username || "Player")}</strong><br><small style="color:var(--muted);">${esc(u.id)}</small></td>
                <td>${esc(u.email || "—")}</td>
                <td style="color:var(--green); font-weight:bold;">${money(w.balance ?? u.walletBalance)}</td>
                <td>${money(w.lockedBalance || 0)}</td>
                <td style="color:var(--gold);">${money(w.totalWinnings || u.totalEarnings || 0)}</td>
                <td><span class="status ${isActive ? 'active' : ''}">${isActive ? 'ACTIVE' : 'SUSPENDED'}</span></td>
                <td>
                    <button class="mini" data-adj-user="${u.id}">Adjust ₹</button>
                    <button class="mini ${isActive ? 'decline' : 'approve'}" data-toggle-status="${u.id}" data-active="${isActive}">
                        ${isActive ? 'Suspend' : 'Activate'}
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-adj-user]").forEach(b => {
        b.onclick = () => promptAdjustWallet(b.dataset.adjUser);
    });

    document.querySelectorAll("[data-toggle-status]").forEach(b => {
        b.onclick = () => toggleUserStatus(b.dataset.toggleStatus, b.dataset.active === "true");
    });
}

$("userSearch")?.addEventListener("input", () => renderUsersTable());
$("refreshUsersButton")?.addEventListener("click", () => loadUsersList());

async function promptAdjustWallet(uid) {
    const amtStr = prompt("Enter adjustment amount in ₹ (use negative value to debit, positive to credit):");
    if (!amtStr) return;
    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt === 0) {
        toast("Invalid amount.", true);
        return;
    }

    const reason = prompt("Enter reason for wallet adjustment:") || "Admin adjustment";

    try {
        await runTransaction(db, async tx => {
            const wRef = doc(db, "wallets", uid);
            const uRef = doc(db, "users", uid);
            const wSnap = await tx.get(wRef);
            const curBal = Number(wSnap.exists() ? wSnap.data().balance || 0 : 0);
            const newBal = curBal + amt;
            if (newBal < 0) throw new Error("Resulting wallet balance cannot be negative.");

            tx.set(wRef, { balance: newBal, updatedAt: serverTimestamp() }, { merge: true });
            tx.set(uRef, { walletBalance: newBal, updatedAt: serverTimestamp() }, { merge: true });

            const txRef = doc(collection(db, "walletTransactions"));
            tx.set(txRef, {
                transactionId: txRef.id,
                id: txRef.id,
                uid: uid,
                userId: uid,
                type: amt > 0 ? "ADJUSTMENT" : "ADJUSTMENT",
                amount: Math.abs(amt),
                status: "COMPLETED",
                description: `${amt > 0 ? 'Credit' : 'Debit'} adjustment: ${reason}`,
                createdAt: serverTimestamp()
            });
        });

        toast(`Wallet updated by ₹${amt}`);
        loadUsersList();
    } catch (e) {
        toast(e.message, true);
    }
}

async function toggleUserStatus(uid, currentlyActive) {
    const newStatus = currentlyActive ? "SUSPENDED" : "ACTIVE";
    try {
        await updateDoc(doc(db, "users", uid), { status: newStatus, active: !currentlyActive });
        toast(`User marked as ${newStatus}`);
        loadUsersList();
    } catch (e) {
        toast(e.message, true);
    }
}

// =========================================================
// 5. TOURNAMENTS & MATCHES
// =========================================================
$("createTournament")?.addEventListener("click", async () => {
    try {
        const name = $("tName").value.trim();
        if (!name) throw new Error("Tournament name is required.");

        const mode = $("tMode").value;
        const entryFee = Number($("tEntry").value || 0);
        const prize = Number($("tPrize").value || 0);
        const perKill = Number($("tPerKill").value || 0);
        const slots = Number($("tSlots").value || 48);
        const startVal = $("tStart").value;
        const startMs = startVal ? new Date(startVal).getTime() : Date.now() + 3600000;

        await addDoc(collection(db, "tournaments"), {
            name: name,
            game: $("tGame").value.trim() || "Free Fire",
            mode: mode,
            map: $("tMap").value.trim() || "Bermuda",
            entryFee: entryFee,
            prizePool: prize,
            prize: prize,
            perKillCoins: perKill,
            perKill: perKill,
            slots: slots,
            totalSlots: slots,
            joinedSlots: 0,
            currentSlots: 0,
            startTime: startMs,
            date: new Date(startMs).toLocaleString("en-IN"),
            status: $("tStatus").value,
            roomId: $("tRoom").value.trim(),
            roomPassword: $("tPass").value.trim(),
            roomReleased: $("tRelease").checked,
            releaseRoomDetails: $("tRelease").checked,
            description: $("tDesc").value.trim(),
            resultsPublished: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        toast("Tournament created successfully!");
        $("tName").value = "";
        loadTournamentsList();
    } catch (e) {
        toast(e.message, true);
    }
});

$("tMode")?.addEventListener("change", (e) => {
    if (e.target.value === "1v1") {
        if ($("tSlots")) $("tSlots").value = "2";
        if ($("tPerKill")) $("tPerKill").value = "0";
    } else {
        if ($("tSlots") && $("tSlots").value === "2") $("tSlots").value = "48";
        if ($("tPerKill") && $("tPerKill").value === "0") $("tPerKill").value = "5";
    }
});

async function loadTournamentsList() {
    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

        const tbody = $("tournamentsTable");
        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No tournaments created yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(t => `
            <tr>
                <td><strong>${esc(t.name)}</strong><br><small style="color:var(--muted);">${esc(t.game || "Free Fire")}</small></td>
                <td><span class="pill">${esc(t.mode || "Solo")}</span></td>
                <td>${money(t.entryFee)}</td>
                <td style="color:var(--gold); font-weight:bold;">${money(t.prizePool ?? t.prize)}</td>
                <td>${t.joinedSlots ?? t.currentSlots ?? 0} / ${t.slots ?? t.totalSlots ?? 0}</td>
                <td>${formatDt(t.startTime || t.date)}</td>
                <td><span class="status ${t.status === 'live' ? 'active' : ''}">${esc(t.status || 'UPCOMING').toUpperCase()}</span></td>
                <td>
                    <button class="mini" data-edit-tourney="${t.id}">Edit</button>
                    <button class="mini decline" data-del-tourney="${t.id}">Delete</button>
                </td>
            </tr>
        `).join("");

        document.querySelectorAll("[data-del-tourney]").forEach(b => {
            b.onclick = async () => {
                if (confirm("Are you sure you want to delete this tournament?")) {
                    await deleteDoc(doc(db, "tournaments", b.dataset.delTourney));
                    toast("Tournament deleted.");
                    loadTournamentsList();
                }
            };
        });
    } catch (e) {
        if ($("tournamentsTable")) $("tournamentsTable").innerHTML = `<tr><td colspan="8">Error: ${esc(e.message)}</td></tr>`;
    }
}

async function loadMatchesList() {
    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

        const tbody = $("matchesTable");
        if (!tbody) return;

        tbody.innerHTML = rows.map(t => {
            const isReleased = t.roomReleased === true || t.releaseRoomDetails === true;
            return `
                <tr>
                    <td><strong>${esc(t.name)}</strong></td>
                    <td>${esc(t.mode || "Solo")}</td>
                    <td>${formatDt(t.startTime || t.date)}</td>
                    <td><input id="room_${t.id}" value="${esc(t.roomId || '')}" placeholder="Room ID" style="max-width:130px; padding:6px;"></td>
                    <td><input id="pass_${t.id}" value="${esc(t.roomPassword || '')}" placeholder="Password" style="max-width:120px; padding:6px;"></td>
                    <td>
                        <input id="rel_${t.id}" type="checkbox" ${isReleased ? 'checked' : ''}>
                    </td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="mini approve" data-save-room="${t.id}">Save</button>
                            <button class="mini" style="background:#151620; border:1px solid var(--line); color:#fff;" data-match-hist="${t.id}">Inspect</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        document.querySelectorAll("[data-save-room]").forEach(b => {
            b.onclick = async () => {
                const id = b.dataset.saveRoom;
                const rId = $(`room_${id}`).value.trim();
                const rPass = $(`pass_${id}`).value.trim();
                const rel = $(`rel_${id}`).checked;

                await updateDoc(doc(db, "tournaments", id), {
                    roomId: rId,
                    roomPassword: rPass,
                    roomReleased: rel,
                    releaseRoomDetails: rel,
                    updatedAt: serverTimestamp()
                });
                toast("Room credentials updated!");
            };
        });

        document.querySelectorAll("[data-match-hist]").forEach(b => {
            b.onclick = () => openMatchHistoryModal(b.dataset.matchHist);
        });
    } catch (e) {
        if ($("matchesTable")) $("matchesTable").innerHTML = `<tr><td colspan="7">Error: ${esc(e.message)}</td></tr>`;
    }
}

// =========================================================
// 6. BR RESULTS DYNAMIC CALCULATION SYSTEM
// =========================================================
let currentBrTournament = null;
let brPlayerRows = [];

async function initBrResults() {
    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const select = $("brTournamentSelect");
        if (!select) return;

        select.innerHTML = `<option value="">Choose Tournament...</option>`;
        snap.forEach(d => {
            const t = d.data();
            select.innerHTML += `<option value="${d.id}">${esc(t.name)} (${esc(t.mode || 'Solo')})</option>`;
        });

        select.onchange = async () => {
            const id = select.value;
            if (!id) return;
            const tDoc = await getDoc(doc(db, "tournaments", id));
            if (!tDoc.exists()) return;
            currentBrTournament = { id: tDoc.id, ...tDoc.data() };

            // Prefill configured kill reward
            if ($("brKillRateInput")) {
                $("brKillRateInput").value = currentBrTournament.perKillCoins ?? currentBrTournament.perKill ?? 10;
            }

            // Load registered players from entries
            loadBrRegisteredPlayers(id);
        };
    } catch (e) {
        console.error("Init BR results error", e);
    }
}

async function loadBrRegisteredPlayers(tournamentId) {
    try {
        const entriesSnap = await getDocs(collection(db, "tournaments", tournamentId, "entries"));
        brPlayerRows = [];
        let posCounter = 1;

        entriesSnap.forEach(d => {
            const e = d.data();
            brPlayerRows.push({
                uid: e.userId || d.id,
                ign: e.inGameName || "Player",
                team: e.teamName || "—",
                position: posCounter++,
                kills: 0,
                killReward: 0,
                positionReward: 0,
                totalReward: 0
            });
        });

        // Check if draft exists
        const draftSnap = await getDoc(doc(db, "tournaments", tournamentId, "results", "draft"));
        if (draftSnap.exists() && Array.isArray(draftSnap.data().results)) {
            brPlayerRows = draftSnap.data().results;
        }

        recalculateBrMatrix();
    } catch (e) {
        toast("Error loading entries: " + e.message, true);
    }
}

function getPositionReward(pos) {
    const p = Number(pos);
    if (p === 1) return Number($("pos1Reward")?.value || 40);
    if (p === 2) return Number($("pos2Reward")?.value || 25);
    if (p === 3) return Number($("pos3Reward")?.value || 15);
    if (p === 4) return Number($("pos4Reward")?.value || 10);
    if (p === 5) return Number($("pos5Reward")?.value || 10);
    if (p === 6) return Number($("pos6Reward")?.value || 10);
    if (p === 7) return Number($("pos7Reward")?.value || 10);
    if (p === 8) return Number($("pos8Reward")?.value || 10);
    if (p === 9) return Number($("pos9Reward")?.value || 10);
    if (p === 10) return Number($("pos10Reward")?.value || 5);
    return 0;
}

function recalculateBrMatrix() {
    const killRate = Number($("brKillRateInput")?.value || 10);

    brPlayerRows.forEach(r => {
        r.killReward = Math.round(Number(r.kills || 0) * killRate);
        r.positionReward = getPositionReward(r.position);
        r.totalReward = r.killReward + r.positionReward;
    });

    // Sort by position ascending
    brPlayerRows.sort((a, b) => Number(a.position) - Number(b.position));

    const tbody = $("brResultsTable");
    if (!tbody) return;

    if (brPlayerRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No player records in this result table yet. Use form above to add players.</td></tr>`;
        return;
    }

    tbody.innerHTML = brPlayerRows.map((r, i) => `
        <tr>
            <td><input type="number" min="1" value="${r.position}" data-idx="${i}" class="br-pos-edit" style="width:60px; padding:4px;"></td>
            <td><strong>${esc(r.ign)}</strong></td>
            <td><small style="color:var(--muted);">${esc(r.uid)}</small></td>
            <td>${esc(r.team || '—')}</td>
            <td><input type="number" min="0" value="${r.kills}" data-idx="${i}" class="br-kills-edit" style="width:70px; padding:4px;"></td>
            <td style="color:var(--purple); font-weight:bold;">${money(r.killReward)}</td>
            <td style="color:var(--gold); font-weight:bold;">${money(r.positionReward)}</td>
            <td style="color:var(--green); font-weight:900;">${money(r.totalReward)}</td>
            <td><button class="mini decline" data-del-player="${i}">✕</button></td>
        </tr>
    `).join("");

    // Hook edit listeners
    document.querySelectorAll(".br-pos-edit").forEach(inp => {
        inp.onchange = () => {
            const idx = Number(inp.dataset.idx);
            brPlayerRows[idx].position = Number(inp.value);
            recalculateBrMatrix();
        };
    });

    document.querySelectorAll(".br-kills-edit").forEach(inp => {
        inp.onchange = () => {
            const idx = Number(inp.dataset.idx);
            brPlayerRows[idx].kills = Number(inp.value);
            recalculateBrMatrix();
        };
    });

    document.querySelectorAll("[data-del-player]").forEach(btn => {
        btn.onclick = () => {
            brPlayerRows.splice(Number(btn.dataset.delPlayer), 1);
            recalculateBrMatrix();
        };
    });
}

// Add manual row
$("addBrPlayerBtn")?.addEventListener("click", () => {
    const uid = $("brPlayerUid").value.trim();
    const ign = $("brPlayerIgn").value.trim();
    const team = $("brPlayerTeam").value.trim();
    const pos = Number($("brPlayerPos").value || 1);
    const kills = Number($("brPlayerKills").value || 0);

    if (!ign) {
        toast("In-Game Name is required.", true);
        return;
    }

    brPlayerRows.push({
        uid: uid || `guest_${Date.now()}`,
        ign: ign,
        team: team,
        position: pos,
        kills: kills,
        killReward: 0,
        positionReward: 0,
        totalReward: 0
    });

    $("brPlayerUid").value = "";
    $("brPlayerIgn").value = "";
    recalculateBrMatrix();
});

// Save Draft
$("saveBrDraftBtn")?.addEventListener("click", async () => {
    if (!currentBrTournament) return;
    try {
        await setDoc(doc(db, "tournaments", currentBrTournament.id, "results", "draft"), {
            tournamentId: currentBrTournament.id,
            results: brPlayerRows,
            updatedAt: serverTimestamp()
        });
        toast("BR Results draft saved.");
    } catch (e) {
        toast(e.message, true);
    }
});

// Finalize & Distribute Prizes
$("finalizeBrResultsBtn")?.addEventListener("click", async () => {
    if (!currentBrTournament) return;
    if (brPlayerRows.length === 0) {
        toast("Results matrix is empty.", true);
        return;
    }

    const totalPrizeAll = brPlayerRows.reduce((acc, r) => acc + (r.totalReward || 0), 0);
    const confirmMsg = `FINAL CONFIRMATION:\n\nPublish results for "${currentBrTournament.name}"?\nTotal prize distributed: ${money(totalPrizeAll)} across ${brPlayerRows.length} players.\n\nThis will credit user wallets and mark tournament as COMPLETED.`;
    
    if (!confirm(confirmMsg)) return;

    try {
        toast("Finalizing results and crediting player wallets...");

        // 1. Save final results document
        await setDoc(doc(db, "tournaments", currentBrTournament.id, "results", "final"), {
            tournamentId: currentBrTournament.id,
            results: brPlayerRows,
            finalizedAt: serverTimestamp(),
            finalizedBy: currentAdmin.uid,
            status: "FINALIZED"
        });

        // 2. Mark tournament completed
        await updateDoc(doc(db, "tournaments", currentBrTournament.id), {
            status: "completed",
            resultsPublished: true,
            updatedAt: serverTimestamp()
        });

        // 3. Credit each winning player
        for (const r of brPlayerRows) {
            const uid = r.uid;
            const prize = Number(r.totalReward || 0);
            const kills = Number(r.kills || 0);
            const isChamp = Number(r.position) === 1;

            if (uid && !uid.startsWith("guest_") && prize > 0) {
                await runTransaction(db, async tx => {
                    const wRef = doc(db, "wallets", uid);
                    const uRef = doc(db, "users", uid);
                    const wSnap = await tx.get(wRef);
                    const curBal = Number(wSnap.exists() ? wSnap.data().balance || 0 : 0);
                    const curWin = Number(wSnap.exists() ? wSnap.data().totalWinnings || 0 : 0);

                    tx.set(wRef, {
                        balance: curBal + prize,
                        totalWinnings: curWin + prize,
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    tx.set(uRef, {
                        walletBalance: curBal + prize,
                        totalEarnings: increment(prize),
                        totalKills: increment(kills),
                        totalWins: isChamp ? increment(1) : increment(0),
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    const txRef = doc(collection(db, "walletTransactions"));
                    tx.set(txRef, {
                        transactionId: txRef.id,
                        id: txRef.id,
                        uid: uid,
                        userId: uid,
                        type: "PRIZE",
                        amount: prize,
                        status: "COMPLETED",
                        referenceId: currentBrTournament.id,
                        description: `Winnings in ${currentBrTournament.name} (Rank #${r.position}, ${kills} Kills)`,
                        createdAt: serverTimestamp()
                    });

                    // Dispatch notification
                    await addDoc(collection(db, "notifications"), {
                        uid: uid,
                        userId: uid,
                        title: "🏆 Tournament Prize Credited!",
                        message: `Congratulations! You placed #${r.position} with ${kills} kills in ${currentBrTournament.name}. ${money(prize)} has been added to your wallet.`,
                        type: "PRIZE",
                        read: false,
                        createdAt: serverTimestamp()
                    });
                });
            }
        }

        toast("Results published and prizes credited to player wallets!");
        showSection("results");
    } catch (e) {
        toast("Error finalizing results: " + e.message, true);
    }
});

// =========================================================
// =========================================================
// 7. 1v1 MATCH MANAGEMENT (Direct Head-to-Head Duels)
// =========================================================
let current1v1Match = null;
let current1v1Players = [];

async function initOneVOneMatches() {
    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const select = $("oneVoneMatchSelect");
        if (!select) return;

        select.innerHTML = `<option value="">Choose 1v1 Match...</option>`;

        snap.forEach(d => {
            const t = { id: d.id, ...d.data() };
            const m = (t.mode || "").toLowerCase();
            if (m.includes("1v1") || m.includes("lone") || Number(t.slots) === 2 || Number(t.totalSlots) === 2) {
                select.innerHTML += `<option value="${d.id}">${esc(t.name)} (${esc(t.game || 'Free Fire')}) - ${(t.status || 'upcoming').toUpperCase()}</option>`;
            }
        });

        select.onchange = async () => {
            const id = select.value;
            if (!id) {
                $("oneVoneArena")?.classList.add("hidden");
                return;
            }
            loadOneVOneMatchArena(id);
        };
    } catch (e) {
        console.error("Init 1v1 Matches error", e);
    }
}

async function loadOneVOneMatchArena(tournamentId) {
    const arena = $("oneVoneArena");
    if (!arena) return;

    try {
        const tDoc = await getDoc(doc(db, "tournaments", tournamentId));
        if (!tDoc.exists()) return;

        current1v1Match = { id: tDoc.id, ...tDoc.data() };
        arena.classList.remove("hidden");

        $("oneVoneGameHeader").textContent = `${(current1v1Match.game || 'Free Fire').toUpperCase()} 1v1 DUEL • ID: ${current1v1Match.id}`;
        $("oneVoneTitle").textContent = current1v1Match.name || "1v1 Match";
        $("oneVoneDetails").textContent = `Entry Fee: ${money(current1v1Match.entryFee || 0)} • Total Prize Pool: ${money(current1v1Match.prizePool ?? current1v1Match.prize)} • Map: ${current1v1Match.map || 'Bermuda'}`;
        
        const isCompleted = (current1v1Match.status || "").toLowerCase() === "completed" || current1v1Match.resultsPublished === true;
        const statusBadge = $("oneVoneStatusBadge");
        if (statusBadge) {
            statusBadge.textContent = isCompleted ? "COMPLETED" : (current1v1Match.status || "LIVE").toUpperCase();
            statusBadge.className = isCompleted ? "status" : "status active";
        }

        // Room credentials
        if ($("oneVoneRoomId")) $("oneVoneRoomId").value = current1v1Match.roomId || "";
        if ($("oneVoneRoomPass")) $("oneVoneRoomPass").value = current1v1Match.roomPassword || "";
        if ($("oneVoneRoomReleased")) $("oneVoneRoomReleased").checked = current1v1Match.roomReleased === true || current1v1Match.releaseRoomDetails === true;

        // Fetch the 2 players
        const [entriesSnap, joinsSnap] = await Promise.all([
            getDocs(collection(db, "tournaments", tournamentId, "entries")),
            getDocs(collection(db, "tournaments", tournamentId, "joins"))
        ]);

        const playerList = [];
        const seenUids = new Set();

        entriesSnap.forEach(d => {
            const data = d.data();
            const pUid = data.userId || d.id;
            if (!seenUids.has(pUid)) {
                seenUids.add(pUid);
                playerList.push({ uid: pUid, ign: data.inGameName || data.iglName || data.username || "Player 1" });
            }
        });

        joinsSnap.forEach(d => {
            const data = d.data();
            const pUid = data.userId || d.id;
            if (!seenUids.has(pUid)) {
                seenUids.add(pUid);
                playerList.push({ uid: pUid, ign: data.inGameName || data.iglName || data.username || `Player ${playerList.length + 1}` });
            }
        });

        current1v1Players = playerList;

        const p1 = playerList[0] || null;
        const p2 = playerList[1] || null;

        // Player 1 Card
        if (p1) {
            $("p1Name").textContent = p1.ign;
            $("p1Uid").textContent = `UID: ${p1.uid}`;
            $("declareP1WinnerBtn").disabled = isCompleted;
            $("declareP1WinnerBtn").textContent = `👑 Declare ${esc(p1.ign)} as Winner`;
        } else {
            $("p1Name").textContent = "Waiting for Player 1...";
            $("p1Uid").textContent = "Slot 1 open";
            $("declareP1WinnerBtn").disabled = true;
            $("declareP1WinnerBtn").textContent = "Player 1 not joined";
        }

        // Player 2 Card
        if (p2) {
            $("p2Name").textContent = p2.ign;
            $("p2Uid").textContent = `UID: ${p2.uid}`;
            $("declareP2WinnerBtn").disabled = isCompleted;
            $("declareP2WinnerBtn").textContent = `👑 Declare ${esc(p2.ign)} as Winner`;
        } else {
            $("p2Name").textContent = "Waiting for Player 2...";
            $("p2Uid").textContent = "Slot 2 open";
            $("declareP2WinnerBtn").disabled = true;
            $("declareP2WinnerBtn").textContent = "Player 2 not joined";
        }

        // Check if results were already declared
        const finalSnap = await getDoc(doc(db, "tournaments", tournamentId, "results", "final"));
        if (finalSnap.exists() && isCompleted) {
            const resData = finalSnap.data().results || [];
            const champ = resData.find(r => Number(r.position) === 1);
            $("oneVoneWinnerBanner")?.classList.remove("hidden");
            if ($("oneVoneWinnerText") && champ) {
                $("oneVoneWinnerText").textContent = `🏆 Winner: ${champ.ign}! (${money(champ.totalReward || 0)} Credited)`;
            }
        } else {
            $("oneVoneWinnerBanner")?.classList.add("hidden");
        }
    } catch (e) {
        toast("Error loading 1v1 match: " + e.message, true);
    }
}

// Update Room Credentials in 1v1
$("oneVoneSaveRoomBtn")?.addEventListener("click", async () => {
    if (!current1v1Match) return;
    const rId = $("oneVoneRoomId").value.trim();
    const rPass = $("oneVoneRoomPass").value.trim();
    const rel = $("oneVoneRoomReleased").checked;

    await updateDoc(doc(db, "tournaments", current1v1Match.id), {
        roomId: rId,
        roomPassword: rPass,
        roomReleased: rel,
        releaseRoomDetails: rel,
        updatedAt: serverTimestamp()
    });
    toast("1v1 Room credentials updated!");
});

// Declare Winner: Player 1
$("declareP1WinnerBtn")?.addEventListener("click", () => {
    if (!current1v1Match || !current1v1Players[0]) return;
    finalize1v1Winner(current1v1Players[0], current1v1Players[1]);
});

// Declare Winner: Player 2
$("declareP2WinnerBtn")?.addEventListener("click", () => {
    if (!current1v1Match || !current1v1Players[1]) return;
    finalize1v1Winner(current1v1Players[1], current1v1Players[0]);
});

async function finalize1v1Winner(winner, runnerUp) {
    const prize = Number(current1v1Match.prizePool ?? current1v1Match.prize ?? 0);
    const confirmMsg = `Declare ${winner.ign} as the 1v1 Winner?\n\nPrize of ${money(prize)} will be credited to ${winner.ign}'s wallet immediately.`;
    if (!confirm(confirmMsg)) return;

    try {
        toast("Finalizing 1v1 match and crediting winner...");

        const resultsPayload = [
            {
                position: 1,
                uid: winner.uid,
                ign: winner.ign,
                team: "1v1 Duel",
                kills: 1,
                killReward: 0,
                positionReward: prize,
                totalReward: prize,
                status: "CHAMPION"
            }
        ];

        if (runnerUp) {
            resultsPayload.push({
                position: 2,
                uid: runnerUp.uid,
                ign: runnerUp.ign,
                team: "1v1 Duel",
                kills: 0,
                killReward: 0,
                positionReward: 0,
                totalReward: 0,
                status: "RUNNER_UP"
            });
        }

        // 1. Save final results document
        await setDoc(doc(db, "tournaments", current1v1Match.id, "results", "final"), {
            tournamentId: current1v1Match.id,
            results: resultsPayload,
            winnerUid: winner.uid,
            winnerIgn: winner.ign,
            prizeCredited: prize,
            finalizedAt: serverTimestamp(),
            finalizedBy: currentAdmin?.uid || "admin"
        });

        // 2. Mark match completed
        await updateDoc(doc(db, "tournaments", current1v1Match.id), {
            status: "completed",
            resultsPublished: true,
            winnerUid: winner.uid,
            winnerIgn: winner.ign,
            updatedAt: serverTimestamp()
        });

        // 3. Atomically credit winner wallet
        if (prize > 0 && winner.uid && !winner.uid.startsWith("guest_")) {
            await runTransaction(db, async transaction => {
                const wRef = doc(db, "wallets", winner.uid);
                const wSnap = await transaction.get(wRef);
                const curBal = wSnap.exists() ? (wSnap.data().balance || 0) : 0;
                const curWon = wSnap.exists() ? (wSnap.data().totalWinnings || 0) : 0;

                transaction.set(wRef, {
                    userId: winner.uid,
                    balance: curBal + prize,
                    totalWinnings: curWon + prize,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                const txRef = doc(collection(db, "walletTransactions"));
                transaction.set(txRef, {
                    uid: winner.uid,
                    userId: winner.uid,
                    amount: prize,
                    type: "PRIZE",
                    description: `🏆 1v1 Match Prize - ${current1v1Match.name}`,
                    status: "COMPLETED",
                    createdAt: serverTimestamp()
                });
            });

            await addDoc(collection(db, "notifications"), {
                uid: winner.uid,
                userId: winner.uid,
                title: "🏆 1v1 Match Victory!",
                message: `Congratulations! You won the 1v1 match in ${current1v1Match.name}. ${money(prize)} has been credited to your wallet.`,
                type: "PRIZE",
                read: false,
                createdAt: serverTimestamp()
            });
        }

        toast(`🏆 ${winner.ign} declared winner! ${money(prize)} credited.`);
        loadOneVOneMatchArena(current1v1Match.id);
    } catch (e) {
        toast("Error declaring winner: " + e.message, true);
    }
}

// =========================================================
// 8. DEPOSITS REVIEW
// =========================================================
async function loadDepositsList() {
    try {
        const snap = await getDocs(query(collection(db, "deposits"), orderBy("createdAt", "desc"), limit(40)));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        const tbody = $("depositsTable");
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No deposit records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(d => `
            <tr>
                <td>${formatDt(d.createdAt)}</td>
                <td><small>${esc(d.uid || d.userId)}</small></td>
                <td style="font-weight:bold; color:var(--green);">${money(d.amount)}</td>
                <td><span class="pill">${esc(d.method || "RAZORPAY")}</span></td>
                <td><code>${esc(d.paymentId || d.orderId || d.id)}</code></td>
                <td><span class="status ${d.status === 'COMPLETED' ? 'active' : ''}">${esc(d.status || 'PENDING')}</span></td>
                <td>
                    ${d.status === 'PENDING' ? `
                        <button class="mini approve" data-approve-dep="${d.id}" data-uid="${d.uid || d.userId}" data-amt="${d.amount}">Approve</button>
                    ` : '—'}
                </td>
            </tr>
        `).join("");

        document.querySelectorAll("[data-approve-dep]").forEach(b => {
            b.onclick = async () => {
                const depId = b.dataset.approveDep;
                const uid = b.dataset.uid;
                const amt = Number(b.dataset.amt);

                await runTransaction(db, async tx => {
                    const wRef = doc(db, "wallets", uid);
                    const depRef = doc(db, "deposits", depId);
                    const wSnap = await tx.get(wRef);
                    const curBal = Number(wSnap.exists() ? wSnap.data().balance || 0 : 0);

                    tx.set(wRef, { balance: curBal + amt, totalDeposited: increment(amt) }, { merge: true });
                    tx.update(depRef, { status: "COMPLETED", processedAt: serverTimestamp() });
                });

                toast("Deposit approved and credited.");
                loadDepositsList();
            };
        });
    } catch (e) {
        if ($("depositsTable")) $("depositsTable").innerHTML = `<tr><td colspan="7">Error: ${esc(e.message)}</td></tr>`;
    }
}

// =========================================================
// 9. WITHDRAWALS PROCESSING
// =========================================================
async function loadWithdrawalsList() {
    try {
        const snap = await getDocs(query(collection(db, "withdrawals"), orderBy("createdAt", "desc"), limit(40)));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        const tbody = $("withdrawalsTable");
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No withdrawal requests.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(w => `
            <tr>
                <td>${formatDt(w.createdAt)}</td>
                <td><small>${esc(w.uid || w.userId)}</small></td>
                <td style="font-weight:bold; color:var(--red);">${money(w.amount)}</td>
                <td><span class="pill">${esc(w.method || "UPI")}</span></td>
                <td><strong>${esc(w.payoutDetails)}</strong></td>
                <td><span class="status ${w.status === 'COMPLETED' ? 'active' : (w.status === 'REJECTED' ? '' : 'active')}">${esc(w.status || 'PENDING')}</span></td>
                <td>
                    ${w.status === 'PENDING' ? `
                        <button class="mini approve" data-complete-wd="${w.id}">Complete</button>
                        <button class="mini decline" data-reject-wd="${w.id}">Reject</button>
                    ` : '—'}
                </td>
            </tr>
        `).join("");

        document.querySelectorAll("[data-complete-wd]").forEach(b => {
            b.onclick = () => processWithdrawalAction(b.dataset.completeWd, "COMPLETE");
        });

        document.querySelectorAll("[data-reject-wd]").forEach(b => {
            b.onclick = () => processWithdrawalAction(b.dataset.rejectWd, "REJECT");
        });
    } catch (e) {
        if ($("withdrawalsTable")) $("withdrawalsTable").innerHTML = `<tr><td colspan="7">Error: ${esc(e.message)}</td></tr>`;
    }
}

async function processWithdrawalAction(wId, action) {
    const note = prompt(`Enter admin note for this ${action}:`) || "";

    try {
        const wRef = doc(db, "withdrawals", wId);
        const wSnap = await getDoc(wRef);
        if (!wSnap.exists()) return;
        const wData = wSnap.data();
        const uid = wData.uid || wData.userId;
        const amt = Number(wData.amount || 0);

        await runTransaction(db, async tx => {
            const walRef = doc(db, "wallets", uid);
            const walSnap = await tx.get(walRef);
            const wDataWal = walSnap.exists() ? walSnap.data() : {};
            const bal = Number(wDataWal.balance || 0);
            const locked = Number(wDataWal.lockedBalance || 0);

            if (action === "COMPLETE") {
                tx.set(walRef, {
                    balance: Math.max(0, bal - amt),
                    lockedBalance: Math.max(0, locked - amt),
                    totalWithdrawn: increment(amt),
                    updatedAt: serverTimestamp()
                }, { merge: true });

                tx.update(wRef, { status: "COMPLETED", adminNote: note, processedAt: serverTimestamp() });
            } else {
                // REJECT: Unlock funds back to available
                tx.set(walRef, {
                    lockedBalance: Math.max(0, locked - amt),
                    updatedAt: serverTimestamp()
                }, { merge: true });

                tx.update(wRef, { status: "REJECTED", adminNote: note, processedAt: serverTimestamp() });
            }
        });

        toast(`Withdrawal marked as ${action}`);
        loadWithdrawalsList();
    } catch (e) {
        toast("Error processing withdrawal: " + e.message, true);
    }
}

// =========================================================
// 10. WALLETS AUDIT
// =========================================================
async function loadWalletsList() {
    try {
        const snap = await getDocs(collection(db, "wallets"));
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

        const tbody = $("walletsTable");
        if (!tbody) return;

        tbody.innerHTML = rows.map(w => `
            <tr>
                <td><small>${esc(w.id || w.userId)}</small></td>
                <td style="color:var(--green); font-weight:bold;">${money(w.balance)}</td>
                <td>${money(w.lockedBalance || 0)}</td>
                <td>${money(w.totalDeposited || 0)}</td>
                <td>${money(w.totalWithdrawn || 0)}</td>
                <td style="color:var(--gold);">${money(w.totalWinnings || 0)}</td>
            </tr>
        `).join("");
    } catch (e) {
        if ($("walletsTable")) $("walletsTable").innerHTML = `<tr><td colspan="6">Error: ${esc(e.message)}</td></tr>`;
    }
}

// =========================================================
// 11. NOTIFICATIONS
// =========================================================
$("notifTargetType")?.addEventListener("change", () => {
    $("notifUidField").style.display = $("notifTargetType").value === "SINGLE" ? "block" : "none";
});

$("sendNotificationBtn")?.addEventListener("click", async () => {
    const isSingle = $("notifTargetType").value === "SINGLE";
    const targetUid = $("notifTargetUid").value.trim();
    const title = $("notifTitle").value.trim();
    const msg = $("notifMessage").value.trim();

    if (!title || !msg) {
        toast("Title and message are required.", true);
        return;
    }

    try {
        if (isSingle && targetUid) {
            await addDoc(collection(db, "notifications"), {
                uid: targetUid,
                userId: targetUid,
                title: title,
                message: msg,
                read: false,
                type: "ANNOUNCEMENT",
                createdAt: serverTimestamp()
            });
        } else {
            // Global notification
            const uSnap = await getDocs(collection(db, "users"));
            const batchPromises = uSnap.docs.map(u => addDoc(collection(db, "notifications"), {
                uid: u.id,
                userId: u.id,
                title: title,
                message: msg,
                read: false,
                type: "ANNOUNCEMENT",
                createdAt: serverTimestamp()
            }));
            await Promise.all(batchPromises);
        }

        toast("Notification(s) dispatched successfully!");
        $("notifTitle").value = "";
        $("notifMessage").value = "";
    } catch (e) {
        toast(e.message, true);
    }
});

// =========================================================
// 12. SUPPORT TICKETS INBOX
// =========================================================
async function loadSupportTickets() {
    try {
        const snap = await getDocs(query(collection(db, "supportTickets"), orderBy("createdAt", "desc"), limit(40)));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        const tbody = $("supportTicketsTable");
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No support tickets filed.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(t => `
            <tr>
                <td>${formatDt(t.createdAt)}</td>
                <td><strong>${esc(t.username || t.email || "Player")}</strong></td>
                <td><span class="pill">${esc(t.category || "General")}</span></td>
                <td>${esc(t.subject)}</td>
                <td><span class="status ${t.status === 'RESOLVED' || t.status === 'CLOSED' ? '' : 'active'}">${esc(t.status || 'OPEN')}</span></td>
                <td>
                    <button class="mini" data-open-ticket="${t.id}">View Thread 💬</button>
                </td>
            </tr>
        `).join("");

        document.querySelectorAll("[data-open-ticket]").forEach(b => {
            b.onclick = () => openAdminTicketModal(b.dataset.openTicket);
        });
    } catch (e) {
        if ($("supportTicketsTable")) $("supportTicketsTable").innerHTML = `<tr><td colspan="6">Error: ${esc(e.message)}</td></tr>`;
    }
}

async function openAdminTicketModal(tId) {
    const tDoc = await getDoc(doc(db, "supportTickets", tId));
    if (!tDoc.exists()) return;
    const t = tDoc.data();

    $("adminTicketCategory").textContent = t.category || "GENERAL";
    $("adminTicketSubject").textContent = t.subject || "Ticket";
    $("adminTicketUser").textContent = `Player: ${t.username || t.email} (${t.uid || t.userId})`;
    $("adminTicketStatusSelect").value = t.status || "OPEN";
    $("adminSupportModal").classList.remove("hidden");

    $("closeAdminSupportModal").onclick = () => $("adminSupportModal").classList.add("hidden");

    // Live messages
    const msgsRef = collection(db, "supportTickets", tId, "messages");
    onSnapshot(query(msgsRef, orderBy("createdAt", "asc")), snap => {
        const feed = $("adminTicketChatFeed");
        feed.innerHTML = snap.docs.map(d => {
            const m = d.data();
            const isStaff = m.isAdmin === true || m.senderId === currentAdmin.uid;
            return `
                <div style="max-width:75%; align-self:${isStaff ? 'flex-end' : 'flex-start'}; background:${isStaff ? 'linear-gradient(135deg,#7040ff,#e91e2b)' : '#1c1f2e'}; color:#fff; border-radius:12px; padding:10px 14px;">
                    <strong style="font-size:11px; display:block; opacity:0.8;">${esc(m.senderName || (isStaff ? 'Staff Support' : 'Player'))}</strong>
                    <p style="margin:4px 0 2px; font-size:13px;">${esc(m.message)}</p>
                    <small style="font-size:10px; opacity:0.6; display:block; text-align:right;">${formatDt(m.createdAt)}</small>
                </div>
            `;
        }).join("");
        feed.scrollTop = feed.scrollHeight;
    });

    $("adminTicketStatusSelect").onchange = async () => {
        await updateDoc(doc(db, "supportTickets", tId), { status: $("adminTicketStatusSelect").value });
        toast("Status updated.");
    };

    $("adminReplyForm").onsubmit = async e => {
        e.preventDefault();
        const input = $("adminReplyInput");
        const txt = input.value.trim();
        if (!txt) return;

        input.value = "";
        await addDoc(msgsRef, {
            senderId: currentAdmin.uid,
            senderName: "Elite Staff Support",
            isAdmin: true,
            message: txt,
            createdAt: serverTimestamp()
        });
    };
}

// =========================================================
// 13. HERO BANNERS (Firebase Storage)
// =========================================================
async function loadBanners() {
    try {
        const snap = await getDocs(collection(db, "banners"));
        const grid = $("bannersGrid");
        if (!grid) return;

        grid.innerHTML = snap.docs.map(d => {
            const b = d.data();
            return `
                <div class="banner-slot">
                    <img src="${esc(b.imageUrl)}" alt="${esc(b.title)}">
                    <h3>${esc(b.title || "Banner")}</h3>
                    <p style="color:var(--muted); font-size:13px;">${esc(b.subtitle || "")}</p>
                    <button class="mini decline" data-del-banner="${d.id}">Delete Banner</button>
                </div>
            `;
        }).join("");

        document.querySelectorAll("[data-del-banner]").forEach(b => {
            b.onclick = async () => {
                await deleteDoc(doc(db, "banners", b.dataset.delBanner));
                toast("Banner deleted.");
                loadBanners();
            };
        });
    } catch (e) {
        console.error("Load banners error", e);
    }
}

$("createBannerBtn")?.addEventListener("click", async () => {
    const title = $("bannerTitle").value.trim();
    const subtitle = $("bannerSubtitle").value.trim();
    const imgUrl = $("bannerImgUrl").value.trim();

    try {
        if (!imgUrl) {
            toast("Please provide an image URL.", true);
            return;
        }

        await addDoc(collection(db, "banners"), {
            title: title || "Elite X Gamers Battle",
            subtitle: subtitle || "Play tournaments daily.",
            imageUrl: imgUrl,
            createdAt: serverTimestamp()
        });

        toast("Banner created!");
        $("bannerTitle").value = "";
        $("bannerSubtitle").value = "";
        $("bannerImgUrl").value = "";
        loadBanners();
    } catch (e) {
        toast(e.message, true);
    }
});

// =========================================================
// 14. FAQS
// =========================================================
async function loadFaqs() {
    try {
        const snap = await getDocs(collection(db, "faqs"));
        const list = $("adminFaqList");
        if (!list) return;

        list.innerHTML = snap.docs.map(d => {
            const f = d.data();
            return `
                <div style="padding:14px; background:#11131b; border:1px solid var(--line); border-radius:12px; display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <strong style="color:#fff;">${esc(f.question)}</strong>
                        <p style="color:var(--muted); font-size:13px; margin:4px 0 0;">${esc(f.answer)}</p>
                    </div>
                    <button class="mini decline" data-del-faq="${d.id}">Delete</button>
                </div>
            `;
        }).join("");

        document.querySelectorAll("[data-del-faq]").forEach(b => {
            b.onclick = async () => {
                await deleteDoc(doc(db, "faqs", b.dataset.delFaq));
                toast("FAQ deleted.");
                loadFaqs();
            };
        });
    } catch (e) {
        console.error("Load FAQs error", e);
    }
}

$("addFaqBtn")?.addEventListener("click", async () => {
    const q = $("faqQuestion").value.trim();
    const a = $("faqAnswer").value.trim();
    if (!q || !a) return;

    await addDoc(collection(db, "faqs"), { question: q, answer: a, createdAt: serverTimestamp() });
    toast("FAQ added!");
    $("faqQuestion").value = "";
    $("faqAnswer").value = "";
    loadFaqs();
});

// =========================================================
// 15. PAYMENT & APP SETTINGS
// =========================================================
async function loadPaymentSettings() {
    const docSnap = await getDoc(doc(db, "paymentSettings", "config"));
    if (docSnap.exists()) {
        const d = docSnap.data();
        if ($("payUpiId")) $("payUpiId").value = d.upiId || "";
        if ($("payQrUrl")) $("payQrUrl").value = d.qrUrl || "";
        if ($("payMinWithdraw")) $("payMinWithdraw").value = d.minWithdrawal || 50;
    }
}

$("savePaymentSettingsBtn")?.addEventListener("click", async () => {
    await setDoc(doc(db, "paymentSettings", "config"), {
        upiId: $("payUpiId").value.trim(),
        qrUrl: $("payQrUrl").value.trim(),
        minWithdrawal: Number($("payMinWithdraw").value || 50),
        razorpayKeyId: RAZORPAY_KEY_ID,
        updatedAt: serverTimestamp()
    }, { merge: true });
    toast("Payment settings saved.");
});

async function loadAppSettings() {
    const docSnap = await getDoc(doc(db, "appSettings", "config"));
    if (docSnap.exists()) {
        const d = docSnap.data();
        if ($("settingMaintenance")) $("settingMaintenance").checked = d.maintenance === true;
        if ($("settingAnnouncement")) $("settingAnnouncement").value = d.announcement || "";
        if ($("settingVersion")) $("settingVersion").value = d.version || "1.0.0";
    }
}

$("saveAppSettingsBtn")?.addEventListener("click", async () => {
    await setDoc(doc(db, "appSettings", "config"), {
        maintenance: $("settingMaintenance").checked,
        announcement: $("settingAnnouncement").value.trim(),
        version: $("settingVersion").value.trim(),
        updatedAt: serverTimestamp()
    }, { merge: true });
    toast("App settings saved.");
});

// =========================================================
// 16. ADMIN STAFF ACCESS CONTROL
// =========================================================
async function loadAdminsList() {
    const snap = await getDocs(collection(db, "admins"));
    const tbody = $("adminsTable");
    if (!tbody) return;

    tbody.innerHTML = snap.docs.map(d => {
        const a = d.data();
        return `
            <tr>
                <td><code>${esc(d.id)}</code></td>
                <td><span class="pill">${esc(a.role || 'Admin')}</span></td>
                <td><span class="status ${a.active ? 'active' : ''}">${a.active ? 'Active' : 'Revoked'}</span></td>
                <td>
                    <button class="mini decline" data-revoke-admin="${d.id}">Revoke Access</button>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-revoke-admin]").forEach(b => {
        b.onclick = async () => {
            if (confirm("Revoke admin access for this UID?")) {
                await updateDoc(doc(db, "admins", b.dataset.revokeAdmin), { active: false });
                toast("Admin access revoked.");
                loadAdminsList();
            }
        };
    });
}

$("addAdminStaffBtn")?.addEventListener("click", async () => {
    const uid = $("newAdminUid").value.trim();
    if (!uid) return;
    await setDoc(doc(db, "admins", uid), {
        active: true,
        role: "admin",
        createdAt: serverTimestamp()
    });
    toast("Admin access granted!");
    $("newAdminUid").value = "";
    loadAdminsList();
});

// =========================================================
// 17. COMPREHENSIVE MATCH HISTORY ARCHIVE & DETAILS
// =========================================================
let allCompletedMatchesCache = [];

async function loadResultsArchive() {
    const tbody = $("resultsArchiveTable");
    if (!tbody) return;

    try {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading complete historical match archive...</td></tr>`;

        const snap = await getDocs(collection(db, "tournaments"));
        const completed = [];

        for (const d of snap.docs) {
            const t = { id: d.id, ...d.data() };
            const statusLower = (t.status || "").toLowerCase();
            if (t.resultsPublished === true || statusLower === "completed" || statusLower === "finished") {
                // Fetch final results summary if exists
                try {
                    const finalSnap = await getDoc(doc(db, "tournaments", d.id, "results", "final"));
                    if (finalSnap.exists()) {
                        t.finalResults = finalSnap.data().results || [];
                    }
                } catch (_) {}
                completed.push(t);
            }
        }

        // Sort descending by match date (newest first, but preserving all 1 month+ history)
        completed.sort((a, b) => {
            const timeA = (a.startTime?.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime || a.date || 0).getTime()) || 0;
            const timeB = (b.startTime?.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime || b.date || 0).getTime()) || 0;
            return timeB - timeA;
        });

        allCompletedMatchesCache = completed;
        renderFilteredResultsArchive();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red); text-align:center;">Error loading match archive: ${esc(e.message)}</td></tr>`;
    }
}

function renderFilteredResultsArchive() {
    const tbody = $("resultsArchiveTable");
    if (!tbody) return;

    const searchTerm = ($("resultsSearchInput")?.value || "").toLowerCase().trim();
    const timeFilter = $("resultsTimeFilter")?.value || "all";
    const gameFilter = $("resultsGameFilter")?.value || "all";

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const filtered = allCompletedMatchesCache.filter(t => {
        // Search text
        if (searchTerm) {
            const matchText = `${t.name || ""} ${t.id} ${t.map || ""} ${t.game || ""}`.toLowerCase();
            if (!matchText.includes(searchTerm)) return false;
        }

        // Game filter
        if (gameFilter !== "all") {
            const g = (t.game || "").toLowerCase().replace(/\s+/g, "_");
            if (!g.includes(gameFilter)) return false;
        }

        // Time filter
        const matchTime = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
        const diffDays = matchTime > 0 ? (now - matchTime) / DAY_MS : 999;

        if (timeFilter === "7d" && diffDays > 7) return false;
        if (timeFilter === "30d" && diffDays > 30) return false;
        if (timeFilter === "older" && diffDays <= 30) return false;

        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--muted);">No matches found matching the selected filters. Total historical records: ${allCompletedMatchesCache.length}.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(t => {
        const matchTime = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
        let relativeTimeStr = "";
        if (matchTime > 0) {
            const daysAgo = Math.floor((now - matchTime) / (24 * 60 * 60 * 1000));
            relativeTimeStr = daysAgo > 0 ? ` (${daysAgo}d ago)` : " (Today)";
        }

        const topWinner = t.finalResults && t.finalResults.length > 0 ? t.finalResults[0] : null;
        const winnerText = topWinner
            ? `👑 <strong>${esc(topWinner.ign || topWinner.username || "Winner")}</strong> (${money(topWinner.totalReward || 0)})`
            : `<span style="color:var(--muted);">Standings archived</span>`;

        const roomId = t.roomId || "—";
        const roomPass = t.roomPassword || "—";

        return `
            <tr>
                <td>
                    <strong>${esc(t.name || "Tournament")}</strong>
                    <div style="font-size:11px; color:var(--muted); font-family:monospace;">ID: ${esc(t.id)}</div>
                </td>
                <td>
                    <span class="tournament-game" style="font-size:11px;">${esc(t.game || "Free Fire")} • ${esc(t.mode || "Solo")}</span>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">Map: ${esc(t.map || "Bermuda")}</div>
                </td>
                <td>
                    <strong>${formatDt(t.startTime || t.date)}</strong>
                    <div style="font-size:11px; color:var(--gold);">${relativeTimeStr}</div>
                </td>
                <td>
                    <div style="font-size:12px;">ID: <code>${esc(roomId)}</code></div>
                    <div style="font-size:12px;">Pass: <code>${esc(roomPass)}</code></div>
                </td>
                <td>${winnerText}</td>
                <td style="color:var(--green); font-weight:bold;">${money(t.prizePool ?? t.prize)}</td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-sm btn-primary" data-view-hist="${esc(t.id)}" style="font-size:11px; padding:4px 8px;">Inspect Details</button>
                        <a href="index.html#/results/${t.id}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:11px; padding:4px 8px;">Public ↗</a>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-view-hist]").forEach(btn => {
        btn.onclick = () => openMatchHistoryModal(btn.dataset.viewHist);
    });
}

// Hook up search and filter inputs
$("resultsSearchInput")?.addEventListener("input", () => renderFilteredResultsArchive());
$("resultsTimeFilter")?.addEventListener("change", () => renderFilteredResultsArchive());
$("resultsGameFilter")?.addEventListener("change", () => renderFilteredResultsArchive());
$("refreshResultsArchiveBtn")?.addEventListener("click", () => loadResultsArchive());

// Modal Inspector
async function openMatchHistoryModal(tournamentId) {
    const modal = $("matchHistoryDetailsModal");
    if (!modal) return;

    modal.classList.remove("hidden");
    $("histModalTitle").textContent = "Loading Match Records...";
    $("histModalSubtitle").textContent = `Querying all player scorecards and credentials for ID: ${tournamentId}`;
    $("histModalSpecs").innerHTML = `<div class="loading">Loading details...</div>`;
    $("histModalCredentials").innerHTML = `<div class="loading">Loading credentials...</div>`;
    $("histModalResultsTable").innerHTML = `<tr><td colspan="8" style="text-align:center;">Loading scorecard...</td></tr>`;
    $("histModalRosterTable").innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading roster...</td></tr>`;

    try {
        const tDoc = await getDoc(doc(db, "tournaments", tournamentId));
        if (!tDoc.exists()) {
            $("histModalTitle").textContent = "Tournament Not Found";
            return;
        }

        const t = { id: tDoc.id, ...tDoc.data() };
        $("histModalTitle").textContent = t.name || "Tournament History";
        $("histModalEyebrow").textContent = `${(t.game || "Free Fire").toUpperCase()} • ${(t.mode || "Solo").toUpperCase()} • ARCHIVE`;

        const matchTime = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
        let relativeDays = "";
        if (matchTime > 0) {
            const daysAgo = Math.floor((Date.now() - matchTime) / (24 * 60 * 60 * 1000));
            relativeDays = daysAgo > 0 ? ` (${daysAgo} days ago)` : " (Today)";
        }

        $("histModalSubtitle").textContent = `Played on ${formatDt(t.startTime || t.date)}${relativeDays} • Status: ${(t.status || 'COMPLETED').toUpperCase()}`;

        // 1. Specs grid
        $("histModalSpecs").innerHTML = `
            <div class="admin-stat"><span>Game</span><strong>${esc(t.game || "Free Fire")}</strong></div>
            <div class="admin-stat"><span>Mode</span><strong>${esc(t.mode || "Solo")}</strong></div>
            <div class="admin-stat"><span>Map</span><strong>${esc(t.map || "Bermuda")}</strong></div>
            <div class="admin-stat"><span>Entry Fee</span><strong>${money(t.entryFee || 0)}</strong></div>
            <div class="admin-stat"><span>Prize Pool</span><strong style="color:var(--gold);">${money(t.prizePool ?? t.prize)}</strong></div>
            <div class="admin-stat"><span>Kill Rate</span><strong>${money(t.perKillCoins ?? t.perKill ?? 10)}/kill</strong></div>
        `;

        // 2. Archived Credentials Box
        $("histModalCredentials").innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <span class="eyebrow" style="color:var(--green);">ARCHIVED ROOM CREDENTIALS</span>
                    <div style="display:flex; gap:24px; margin-top:6px;">
                        <div><span style="font-size:12px; color:var(--muted);">Room ID:</span> <strong style="font-size:16px; color:#fff; font-family:monospace;">${esc(t.roomId || "—")}</strong></div>
                        <div><span style="font-size:12px; color:var(--muted);">Room Password:</span> <strong style="font-size:16px; color:#fff; font-family:monospace;">${esc(t.roomPassword || "—")}</strong></div>
                    </div>
                </div>
                <div style="font-size:12px; color:var(--muted);">
                    Released: <strong>${t.roomReleased ? "YES" : "NO"}</strong>
                </div>
            </div>
        `;

        // 3. Results & Scoreboard
        const finalSnap = await getDoc(doc(db, "tournaments", tournamentId, "results", "final"));
        const results = finalSnap.exists() ? (finalSnap.data().results || []) : [];

        if (results.length === 0) {
            $("histModalResultsTable").innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--muted);">No official results published for this match yet.</td></tr>`;
        } else {
            $("histModalResultsTable").innerHTML = results.map(r => {
                const pos = Number(r.position || 0);
                const posBadge = pos === 1 ? '👑 #1 1st' : (pos === 2 ? '🥈 #2 2nd' : (pos === 3 ? '🥉 #3 3rd' : `#${pos}`));
                const posColor = pos === 1 ? 'var(--gold)' : (pos === 2 ? '#c0c0c0' : (pos === 3 ? '#cd7f32' : '#fff'));

                return `
                    <tr>
                        <td><strong style="color:${posColor};">${posBadge}</strong></td>
                        <td><strong>${esc(r.ign || r.username || "Player")}</strong></td>
                        <td>${esc(r.team || "—")}</td>
                        <td><span style="color:var(--red); font-weight:bold;">${esc(r.kills || 0)}</span></td>
                        <td>${money(r.killReward || 0)}</td>
                        <td>${money(r.positionReward || 0)}</td>
                        <td style="color:var(--green); font-weight:bold;">${money(r.totalReward || 0)}</td>
                        <td><code style="font-size:10px; color:var(--muted);">${esc(r.uid || "—")}</code></td>
                    </tr>
                `;
            }).join("");
        }

        // 4. Joined Roster Archive
        const [entriesSnap, joinsSnap] = await Promise.all([
            getDocs(collection(db, "tournaments", tournamentId, "entries")),
            getDocs(collection(db, "tournaments", tournamentId, "joins"))
        ]);

        const rosterMap = new Map();
        entriesSnap.forEach(d => {
            const data = d.data();
            rosterMap.set(d.id, { uid: data.userId || d.id, ign: data.inGameName || data.iglName || "Player", team: data.teamName || "—", joinedAt: data.joinedAt });
        });
        joinsSnap.forEach(d => {
            if (!rosterMap.has(d.id)) {
                const data = d.data();
                rosterMap.set(d.id, { uid: data.userId || d.id, ign: data.inGameName || data.iglName || "Player", team: data.teamName || "—", joinedAt: data.joinedAt });
            }
        });

        const roster = Array.from(rosterMap.values());
        if (roster.length === 0) {
            $("histModalRosterTable").innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--muted);">No roster records found.</td></tr>`;
        } else {
            $("histModalRosterTable").innerHTML = roster.map(p => `
                <tr>
                    <td><strong>${esc(p.ign)}</strong></td>
                    <td>${esc(p.team)}</td>
                    <td>${formatDt(p.joinedAt)}</td>
                    <td><code style="font-size:11px; color:var(--muted);">${esc(p.uid)}</code></td>
                </tr>
            `).join("");
        }
    } catch (err) {
        $("histModalTitle").textContent = "Error Loading Details";
        $("histModalSubtitle").textContent = err.message;
    }
}

$("closeHistModalBtn")?.addEventListener("click", () => {
    $("matchHistoryDetailsModal")?.classList.add("hidden");
});
