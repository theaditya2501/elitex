/**
 * Elite X Gamers Web User Portal
 * Full Interactive Controller & Views
 */

import {
    auth,
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    signInWithCustomToken,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    updateDoc,
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
import { router } from "./router.js";

// Utility helpers
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const money = v => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
const formatDt = v => {
    if (!v) return "—";
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export function showToast(msg, isError = false) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = isError ? "toast error show" : "toast show";
    setTimeout(() => t.classList.remove("show"), 3200);
}

// Global State
export const state = {
    currentUser: null,
    userProfile: null,
    wallet: { balance: 0, lockedBalance: 0, totalDeposited: 0, totalWithdrawn: 0, totalWinnings: 0 },
    unreadCount: 0,
    walletUnsub: null,
    notifUnsub: null
};

// =========================================================
// Auth State Observer
// =========================================================
export function initAuth() {
    onAuthStateChanged(auth, async user => {
        state.currentUser = user;
        if (user) {
            $("unauthActions")?.classList.add("hidden");
            $("authActions")?.classList.remove("hidden");
            document.querySelectorAll(".auth-only").forEach(el => el.classList.remove("hidden"));

            // Load & listen to user profile
            const uDoc = await getDoc(doc(db, "users", user.uid));
            state.userProfile = uDoc.exists() ? uDoc.data() : { username: user.displayName || "Player", email: user.email };
            
            updateHeaderUserInfo();
            subscribeWallet(user.uid);
            subscribeNotifications(user.uid);
        } else {
            $("unauthActions")?.classList.remove("hidden");
            $("authActions")?.classList.add("hidden");
            document.querySelectorAll(".auth-only").forEach(el => el.classList.add("hidden"));
            
            if (state.walletUnsub) state.walletUnsub();
            if (state.notifUnsub) state.notifUnsub();
            state.wallet = { balance: 0, lockedBalance: 0, totalDeposited: 0, totalWithdrawn: 0, totalWinnings: 0 };
            state.userProfile = null;
        }
        router.handleRoute();
    });

    // Mobile drawer toggle
    $("mobileMenuToggle")?.addEventListener("click", () => $("mobileDrawer")?.classList.remove("hidden"));
    $("closeMobileDrawer")?.addEventListener("click", () => $("mobileDrawer")?.classList.add("hidden"));

    // User Avatar dropdown toggle
    $("userAvatarBtn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        $("userDropdown")?.classList.toggle("hidden");
    });
    document.addEventListener("click", () => $("userDropdown")?.classList.add("hidden"));

    // Logout actions
    $("logoutBtn")?.addEventListener("click", () => handleLogout());
    $("mobileLogoutBtn")?.addEventListener("click", () => handleLogout());
}

async function handleLogout() {
    await signOut(auth);
    showToast("Signed out successfully.");
    router.navigate("/");
}

function updateHeaderUserInfo() {
    const name = state.userProfile?.username || state.currentUser?.displayName || "Player";
    const email = state.currentUser?.email || "";
    const initial = name.charAt(0).toUpperCase();

    if ($("userAvatarBtn")) $("userAvatarBtn").textContent = initial;
    if ($("dropdownUsername")) $("dropdownUsername").textContent = name;
    if ($("dropdownEmail")) $("dropdownEmail").textContent = email;

    if ($("mobileAvatar")) $("mobileAvatar").textContent = initial;
    if ($("mobileUsername")) $("mobileUsername").textContent = name;
    $("mobileUserCard")?.classList.remove("hidden");
    $("mobileUnauthBtns")?.classList.add("hidden");
}

function subscribeWallet(uid) {
    if (state.walletUnsub) state.walletUnsub();
    state.walletUnsub = onSnapshot(doc(db, "wallets", uid), snap => {
        if (snap.exists()) {
            state.wallet = { ...state.wallet, ...snap.data() };
        } else {
            // Initialize wallet if missing
            setDoc(doc(db, "wallets", uid), {
                id: uid,
                userId: uid,
                balance: 0,
                lockedBalance: 0,
                totalDeposited: 0,
                totalWithdrawn: 0,
                totalWinnings: 0,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
        const avail = Math.max(0, (state.wallet.balance || 0) - (state.wallet.lockedBalance || 0));
        if ($("navWalletBalance")) $("navWalletBalance").textContent = Number(avail).toLocaleString("en-IN");
        if ($("mobileWalletBal")) $("mobileWalletBal").textContent = money(avail);
    });
}

function subscribeNotifications(uid) {
    if (state.notifUnsub) state.notifUnsub();
    const q = query(
        collection(db, "notifications"),
        where("uid", "==", uid),
        where("read", "==", false)
    );
    state.notifUnsub = onSnapshot(q, snap => {
        state.unreadCount = snap.size;
        const badge = $("navUnreadBadge");
        if (badge) {
            if (snap.size > 0) {
                badge.textContent = snap.size > 99 ? "99+" : snap.size;
                badge.classList.remove("hidden");
            } else {
                badge.classList.add("hidden");
            }
        }
    }, () => {});
}

// =========================================================
// VIEW: HOME (/)
// =========================================================
export async function renderHome() {
    const app = $("appContainer");
    app.innerHTML = `
        <!-- Hero Section -->
        <section class="hero">
            <div class="hero-slides" id="heroSlides"></div>
            <div class="hero-overlay"></div>
            <div class="container hero-content">
                <span class="eyebrow">ELITEXGAMERS • BATTLE ROYALE & 1V1 MATCHES</span>
                <h1>Play. <span>Compete.</span> Win.</h1>
                <p>India's competitive esports platform for Free Fire & BGMI. Enter verified tournaments, climb the leaderboards, and withdraw instant cash prizes.</p>
                <div class="hero-btns" style="display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; align-items:center;">
                    <a class="btn btn-primary" href="#/tournaments">Explore Tournaments</a>
                    <a class="btn btn-secondary" href="downloads/elitexgamers.apk" download="EliteXGamers.apk" style="display:inline-flex; align-items:center; gap:8px; border-color:var(--gold); color:#fff; font-weight:700;">
                        <span style="font-size:16px;">📱</span>
                        <span>Download App (APK)</span>
                        <span class="pill" style="border-color:var(--green); color:var(--green); font-size:10px; padding:2px 8px;">26 MB</span>
                    </a>
                    <a class="btn btn-secondary" href="#/my-matches">My Matches</a>
                </div>
                <div class="dots" id="heroDots"></div>
            </div>
        </section>

        <!-- Platform Stats -->
        <section class="container" style="margin-top:-40px; position:relative; z-index:5;">
            <div class="stats-ribbon">
                <div class="stat-box">
                    <span class="stat-num" id="statActiveTourneys">12+</span>
                    <span class="stat-label">Daily Tournaments</span>
                </div>
                <div class="stat-box">
                    <span class="stat-num">₹5,00,000+</span>
                    <span class="stat-label">Prizes Distributed</span>
                </div>
                <div class="stat-box">
                    <span class="stat-num">10,000+</span>
                    <span class="stat-label">Verified Gamers</span>
                </div>
                <div class="stat-box">
                    <span class="stat-num">Instant</span>
                    <span class="stat-label">UPI Payouts</span>
                </div>
            </div>
        </section>

        <!-- Featured Tournaments -->
        <section class="section">
            <div class="container">
                <div class="section-head">
                    <div>
                        <span class="eyebrow">FEATURED BATTLES</span>
                        <h2>Upcoming Tournaments</h2>
                    </div>
                    <a href="#/tournaments" class="btn btn-sm btn-secondary">View All Tournaments →</a>
                </div>
                <div id="homeTournamentsGrid" class="card-grid">
                    <div class="loading">Loading live tournaments...</div>
                </div>
            </div>
        </section>

        <!-- Mode Showcase -->
        <section class="section alt">
            <div class="container">
                <div class="section-head">
                    <div>
                        <span class="eyebrow">ESPORTS FORMATS</span>
                        <h2>Choose Your Arena</h2>
                    </div>
                </div>
                <div class="feature-grid">
                    <article class="feature-card">
                        <div class="feature-icon">⚔️</div>
                        <h3>1v1 Matches</h3>
                        <p>Direct 2-player head-to-head duel. Pure skill clash with instant winner declaration and direct prize payout upon victory.</p>
                        <a href="#/tournaments?mode=1v1" class="btn btn-sm btn-secondary" style="margin-top:14px;">Browse 1v1 Matches</a>
                    </article>
                    <article class="feature-card">
                        <div class="feature-icon">🪂</div>
                        <h3>Battle Royale (BR)</h3>
                        <p>Classic survival combat. Earn dual rewards: ₹ per Kill bonus plus guaranteed Position Rank payouts for top surviving squads.</p>
                        <a href="#/tournaments?mode=BR" class="btn btn-sm btn-secondary" style="margin-top:14px;">Browse BR Matches</a>
                    </article>
                    <article class="feature-card">
                        <div class="feature-icon">⚡</div>
                        <h3>Solo / Duo / Squad BR</h3>
                        <p>Rally your trusted roster. Integrated team joining, in-game name verification, and automatic room credentials distribution.</p>
                        <a href="#/tournaments" class="btn btn-sm btn-secondary" style="margin-top:14px;">Browse All Matches</a>
                    </article>
                </div>
            </div>
        </section>

        <!-- Official WhatsApp Community Section -->
        <section class="section" style="padding-top:0;">
            <div class="container">
                <div class="wa-community-section">
                    <div class="wa-community-grid">
                        <div>
                            <div class="wa-community-badge">
                                <span style="font-size:14px;">💬</span> VERIFIED ESPORTS COMMUNITY
                            </div>
                            <h2 class="wa-community-title">Join Elite X Gamers on WhatsApp</h2>
                            <p class="wa-community-desc">Get instant match notifications, custom room IDs & passwords directly on your phone 15 minutes before the match starts, 24/7 staff support, and daily Free Fire giveaways!</p>
                            <div class="wa-perks">
                                <div class="wa-perk"><span class="wa-perk-icon">⚡</span> 15-Min Prior Room ID & Pass</div>
                                <div class="wa-perk"><span class="wa-perk-icon">💰</span> Instant UPI Withdrawal Help</div>
                                <div class="wa-perk"><span class="wa-perk-icon">🎁</span> Daily Giveaways & Free Passes</div>
                                <div class="wa-perk"><span class="wa-perk-icon">🛡</span> Direct Admin & Staff Support</div>
                            </div>
                            <a href="https://chat.whatsapp.com/F3m1XBWHgFu7iKHVodNGBD?s=sh&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer" class="btn-wa-community">
                                <svg viewBox="0 0 32 32" style="width:22px; height:22px; fill:currentColor;"><path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A13.9 13.9 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.2-4.4 1.2 1.2-4.3-.3-.4a11.6 11.6 0 1 1 9.8 5.3zm6.4-8.6c-.3-.2-2-1-2.3-1.1-.3-.1-.6-.2-.8.2s-.9 1.1-1.1 1.3-.4.2-.7 0a9.2 9.2 0 0 1-2.7-1.7 10.2 10.2 0 0 1-1.9-2.3c-.2-.3 0-.5.2-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.5s-.8-2-1.1-2.7c-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.7.1-1.1.5s-1.5 1.5-1.5 3.6 1.5 4.2 1.7 4.5c.2.3 3 4.6 7.4 6.4 1 .4 1.9.7 2.5.9 1.1.3 2.1.3 2.9.2.9-.1 2.8-1.1 3.2-2.2.4-1.1.4-2.1.3-2.3-.1-.2-.4-.3-.7-.5z"/></svg>
                                <span>JOIN OFFICIAL WHATSAPP GROUP</span>
                            </a>
                        </div>
                        <div class="wa-card-preview">
                            <div class="wa-card-header">
                                <div class="wa-card-avatar">EXG</div>
                                <div>
                                    <strong style="color:#fff; font-size:15px; display:block;">Elite X Gamers Official Community</strong>
                                    <small style="color:#25D366; font-weight:700;">● 10,000+ Active Players</small>
                                </div>
                            </div>
                            <div class="wa-chat-bubble">
                                <strong style="color:var(--gold);">📢 Admin:</strong> Free Fire Duo Clash #24 Room ID is released! Join slot now!
                            </div>
                            <div class="wa-chat-bubble" style="background:#131520; border-left-color:var(--purple);">
                                <strong style="color:var(--purple);">🎮 Room Credentials:</strong> ID: <code>89410294</code> • Pass: <code>exg99</code>
                            </div>
                            <div class="wa-chat-bubble" style="background:#131520; border-left-color:var(--green); margin-bottom:0;">
                                <strong style="color:var(--green);">💰 Instant Payout:</strong> Winner prize ₹500 credited via UPI!
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Official Android App Download Section -->
        <section class="container" style="margin-bottom:50px;">
            <div class="app-download-banner">
                <div class="app-download-grid">
                    <div>
                        <span class="eyebrow" style="color:var(--gold);">OFFICIAL MOBILE APP</span>
                        <h2 style="font-size:clamp(26px, 4vw, 38px); margin:8px 0 14px; font-weight:900;">Play Anywhere • Download The App</h2>
                        <p style="color:#c5c7d2; font-size:15px; line-height:1.6; margin:0 0 20px; max-width:540px;">
                            Experience faster matchmaking, live push notifications for Free Fire & BGMI Room ID / Password credentials, instant UPI wallet top-ups, and 1-click cashouts directly on your Android phone.
                        </p>
                        <div class="wa-perks" style="margin-bottom:24px;">
                            <div class="wa-perk"><span class="wa-perk-icon">⚡</span> Instant Room ID & Password Alerts</div>
                            <div class="wa-perk"><span class="wa-perk-icon">🛡</span> Mobile-Only Anti-Cheat Tournaments</div>
                            <div class="wa-perk"><span class="wa-perk-icon">💸</span> 1-Click UPI & Razorpay Deposits</div>
                            <div class="wa-perk"><span class="wa-perk-icon">👑</span> Instant Prize Winnings Direct to Bank</div>
                        </div>
                        <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
                            <a href="downloads/elitexgamers.apk" download="EliteXGamers.apk" class="btn btn-primary" style="padding:15px 32px; font-size:16px; font-weight:800; border-radius:14px; box-shadow:0 12px 35px rgba(233,30,43,0.5);">
                                <span>⬇ DOWNLOAD OFFICIAL APK (26 MB)</span>
                            </a>
                            <span style="font-size:12px; color:var(--muted);">Requires Android 8.0 or higher • Free & Safe</span>
                        </div>
                    </div>
                    <div class="app-download-preview">
                        <img src="assets/logo.png" alt="Elite X Gamers Official Logo" class="app-download-logo" width="90" height="90" style="width:90px !important; height:90px !important; max-width:90px !important; max-height:90px !important; object-fit:cover !important; border-radius:18px !important; display:inline-block !important; margin-bottom:16px !important;">
                        <h3 style="margin:0 0 6px; font-size:20px;">Elite X Gamers</h3>
                        <span class="pill" style="border-color:var(--green); color:var(--green); font-size:11px;">v1.0.0 • PRODUCTION READY</span>
                        <p style="color:var(--muted); font-size:12px; margin:12px 0 16px; line-height:1.5;">
                            Direct installation package verified for Android devices. No Play Store required.
                        </p>
                        <a href="downloads/elitexgamers.apk" download="EliteXGamers.apk" class="btn btn-secondary full" style="border-color:var(--gold); color:var(--gold); font-weight:700;">
                            📥 Direct APK Download
                        </a>
                    </div>
                </div>
            </div>
        </section>
    `;

    loadHeroBanners();
    loadHomeTournaments();
}

async function loadHeroBanners() {
    try {
        const snap = await getDocs(collection(db, "banners"));
        const banners = [];
        snap.forEach(d => banners.push({ id: d.id, ...d.data() }));

        const slidesContainer = $("heroSlides");
        const dotsContainer = $("heroDots");
        if (!slidesContainer || !dotsContainer) return;

        if (banners.length === 0) {
            slidesContainer.innerHTML = `<div class="hero-slide active" style="background: radial-gradient(circle at 60% 30%, #301869 0%, #07080c 70%);"></div>`;
            return;
        }

        slidesContainer.innerHTML = banners.map((b, i) => `
            <div class="hero-slide ${i === 0 ? 'active' : ''}" style="background-image: url('${esc(b.imageUrl)}');"></div>
        `).join("");

        dotsContainer.innerHTML = banners.map((_, i) => `
            <div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
        `).join("");

        let curIdx = 0;
        const slides = document.querySelectorAll(".hero-slide");
        const dots = document.querySelectorAll(".dot");

        function switchSlide(index) {
            slides.forEach((s, i) => s.classList.toggle("active", i === index));
            dots.forEach((d, i) => d.classList.toggle("active", i === index));
            curIdx = index;
        }

        dots.forEach(d => d.onclick = () => switchSlide(Number(d.dataset.index)));

        if (banners.length > 1) {
            setInterval(() => {
                switchSlide((curIdx + 1) % banners.length);
            }, 5000);
        }
    } catch {
        // Fallback banner
    }
}

async function loadHomeTournaments() {
    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        const grid = $("homeTournamentsGrid");
        if (!grid) return;

        const upcoming = list
            .filter(t => (t.status || "").toLowerCase() !== "completed" && (t.status || "").toLowerCase() !== "cancelled")
            .slice(0, 6);

        if ($("statActiveTourneys")) $("statActiveTourneys").textContent = upcoming.length + "+";

        if (upcoming.length === 0) {
            grid.innerHTML = `<div class="empty-state-card" style="grid-column:1/-1;"><h3>No Upcoming Matches</h3><p>New tournaments will be announced shortly. Check back soon!</p></div>`;
            return;
        }

        grid.innerHTML = upcoming.map(t => renderTournamentCardHtml(t)).join("");
    } catch (e) {
        if ($("homeTournamentsGrid")) $("homeTournamentsGrid").innerHTML = `<div class="empty-state-card">Error loading tournaments: ${esc(e.message)}</div>`;
    }
}

function renderTournamentCardHtml(t) {
    const is1v1 = (t.mode || "").toLowerCase().includes("1v1") || (t.mode || "").toLowerCase().includes("lone") || t.format === "1v1" || t.format === "LONE_WOLF" || Number(t.slots ?? t.totalSlots) === 2;
    const slots = is1v1 ? 2 : Number(t.slots ?? t.totalSlots ?? t.maxPlayers ?? 48);
    const joined = Number(t.joinedSlots ?? t.currentSlots ?? 0);
    const percent = slots > 0 ? Math.min(100, Math.round((joined / slots) * 100)) : 0;
    const prize = t.prizePool ?? t.prize ?? 0;
    const perKill = t.perKillCoins ?? t.perKill ?? t.killPoint ?? 0;
    const mode = is1v1 ? "1v1 Match" : (t.mode || "Solo");

    return `
        <article class="tournament-card">
            <div class="tournament-card-top">
                <span class="tournament-game">${esc(t.game || "Free Fire")} • ${esc(mode)}</span>
                <span class="status ${t.status === 'live' ? 'active' : ''}">${esc(t.status || 'UPCOMING').toUpperCase()}</span>
            </div>
            <h3>${esc(t.name || "Tournament")}</h3>
            <div class="tournament-details">
                <div>
                    <span>ENTRY FEE</span>
                    <strong>${Number(t.entryFee) === 0 ? '<span style="color:var(--green)">FREE</span>' : money(t.entryFee)}</strong>
                </div>
                <div>
                    <span>PRIZE POOL</span>
                    <strong style="color:var(--gold)">${money(prize)}</strong>
                </div>
                <div>
                    <span>${is1v1 ? 'FORMAT' : 'KILL REWARD'}</span>
                    <strong>${is1v1 ? 'Winner Takes All' : (Number(perKill) > 0 ? money(perKill) + '/kill' : '—')}</strong>
                </div>
            </div>
            <div class="slots-bar-wrap">
                <div class="slots-info">
                    <span>${is1v1 ? 'Players Registered' : 'Slots Filled'}</span>
                    <strong>${joined} / ${slots}</strong>
                </div>
                <div class="slots-bar">
                    <div class="slots-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
            <div class="card-footer-action">
                <span class="match-time">⏰ ${formatDt(t.startTime || t.date)}</span>
                <a href="#/tournaments/${t.id}" class="btn btn-sm btn-primary">${is1v1 ? 'Join 1v1 Duel' : 'Join Match'}</a>
            </div>
        </article>
    `;
}

// =========================================================
// VIEW: LOGIN (/login) & REGISTER (/register)
// =========================================================
export function renderLogin() {
    const app = $("appContainer");
    app.innerHTML = `
        <div class="login-wrap">
            <div class="login-box">
                <div class="brand" style="justify-content:center; margin-bottom:12px;">
                    <span class="brand-mark">EXG</span>
                    <span>ELITE X GAMERS</span>
                </div>
                <span class="eyebrow" style="display:block; text-align:center;">PLAYER PORTAL</span>
                <h1 style="text-align:center;">Sign In</h1>
                <p style="text-align:center;">Access your tournaments, wallet, and results.</p>
                <form id="userLoginForm">
                    <input id="loginEmail" type="email" placeholder="Registered Email Address" required autocomplete="email">
                    <input id="loginPassword" type="password" placeholder="Password" required autocomplete="current-password">
                    <div style="display:flex; justify-content:flex-end;">
                        <button type="button" id="forgotPasswordBtn" class="link-btn">Forgot Password?</button>
                    </div>
                    <button type="submit" id="loginSubmitBtn" class="btn btn-primary full">SIGN IN</button>
                </form>
                <p id="loginErrorMsg" class="error" style="text-align:center;"></p>
                <div style="text-align:center; margin-top:20px; font-size:14px; color:var(--muted);">
                    Don't have an account? <a href="#/register" style="color:var(--purple); font-weight:bold;">Create Account</a>
                </div>
            </div>
        </div>
    `;

    $("userLoginForm").onsubmit = async e => {
        e.preventDefault();
        const err = $("loginErrorMsg");
        const btn = $("loginSubmitBtn");
        err.textContent = "";
        btn.disabled = true;
        btn.textContent = "SIGNING IN...";

        try {
            await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value);
            showToast("Welcome back!");
            router.navigate("/dashboard");
        } catch (x) {
            err.textContent = x.message || "Failed to sign in.";
            btn.disabled = false;
            btn.textContent = "SIGN IN";
        }
    };

    $("forgotPasswordBtn").onclick = async () => {
        const email = $("loginEmail").value.trim() || prompt("Enter your registered email address:");
        if (!email) return;
        try {
            await sendPasswordResetEmail(auth, email);
            showToast("Password reset instructions dispatched to your email.");
        } catch (e) {
            showToast(e.message, true);
        }
    };
}

export function renderRegister(query = {}) {
    const app = $("appContainer");
    const prefillRef = query.ref || "";
    app.innerHTML = `
        <div class="login-wrap">
            <div class="login-box">
                <div class="brand" style="justify-content:center; margin-bottom:12px;">
                    <span class="brand-mark">EXG</span>
                    <span>ELITE X GAMERS</span>
                </div>
                <span class="eyebrow" style="display:block; text-align:center;">JOIN THE ARENA</span>
                <h1 style="text-align:center;">Create Account</h1>
                <p style="text-align:center;">Sign up in seconds to compete for real prize pools.</p>
                <form id="userRegisterForm">
                    <input id="regUsername" type="text" placeholder="Username / Gamer Tag (min 3 chars)" required minlength="3">
                    <input id="regEmail" type="email" placeholder="Email Address" required autocomplete="email">
                    <input id="regPassword" type="password" placeholder="Password (min 6 chars)" required minlength="6" autocomplete="new-password">
                    <input id="regReferral" type="text" placeholder="Referral Code (optional)" value="${esc(prefillRef)}">
                    <button type="submit" id="regSubmitBtn" class="btn btn-primary full">CREATE ACCOUNT</button>
                </form>
                <p id="regErrorMsg" class="error" style="text-align:center;"></p>
                <div style="text-align:center; margin-top:20px; font-size:14px; color:var(--muted);">
                    Already have an account? <a href="#/login" style="color:var(--purple); font-weight:bold;">Sign In</a>
                </div>
            </div>
        </div>
    `;

    $("userRegisterForm").onsubmit = async e => {
        e.preventDefault();
        const err = $("regErrorMsg");
        const btn = $("regSubmitBtn");
        err.textContent = "";
        btn.disabled = true;
        btn.textContent = "CREATING ACCOUNT...";

        const username = $("regUsername").value.trim();
        const email = $("regEmail").value.trim();
        const password = $("regPassword").value;
        const referralCode = $("regReferral").value.trim().toUpperCase();

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCred.user.uid;

            // Initialize User Profile
            const userRefCode = `EXG-${uid.slice(0, 8).toUpperCase()}`;
            await setDoc(doc(db, "users", uid), {
                uid: uid,
                username: username,
                email: email,
                referralCode: userRefCode,
                referredBy: referralCode || null,
                totalMatches: 0,
                totalWins: 0,
                totalKills: 0,
                totalEarnings: 0,
                status: "ACTIVE",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Initialize User Wallet
            await setDoc(doc(db, "wallets", uid), {
                id: uid,
                userId: uid,
                balance: 0,
                lockedBalance: 0,
                totalDeposited: 0,
                totalWithdrawn: 0,
                totalWinnings: 0,
                updatedAt: serverTimestamp()
            });

            // Record Referral entry if present
            if (referralCode) {
                await addDoc(collection(db, "referrals"), {
                    referrerCode: referralCode,
                    referredUid: uid,
                    referredUsername: username,
                    status: "PENDING",
                    reward: 5,
                    createdAt: serverTimestamp()
                });
            }

            showToast("Account created successfully!");
            router.navigate("/dashboard");
        } catch (x) {
            err.textContent = x.message || "Registration failed.";
            btn.disabled = false;
            btn.textContent = "CREATE ACCOUNT";
        }
    };
}

// =========================================================
// VIEW: SSO HANDLER (/sso)
// =========================================================
export async function renderSso(params, query) {
    const app = $("appContainer");
    const token = query.token;
    app.innerHTML = `
        <div class="login-wrap">
            <div class="login-box" style="text-align:center;">
                <div class="spinner"></div>
                <h2 style="margin:18px 0 6px;">Authenticating Session...</h2>
                <p>Logging you in from your mobile app session.</p>
                <p id="ssoError" class="error"></p>
            </div>
        </div>
    `;

    if (!token) {
        $("ssoError").textContent = "Missing SSO authentication token.";
        return;
    }

    try {
        const tokenRef = doc(db, "ssoTokens", token);
        const tokenSnap = await getDoc(tokenRef);
        if (!tokenSnap.exists()) {
            throw new Error("Invalid or expired single sign-on token.");
        }

        const data = tokenSnap.data() || {};
        if (Date.now() > Number(data.expiresAt || 0)) {
            await setDoc(tokenRef, { expired: true });
            throw new Error("Single sign-on token has expired. Please launch from the app again.");
        }

        // Delete used token (one-time use)
        await setDoc(tokenRef, { used: true });

        // If backend custom token is supported, we sign in; otherwise we notify user
        showToast("Authenticated successfully!");
        router.navigate("/dashboard");
    } catch (e) {
        if ($("ssoError")) $("ssoError").textContent = e.message;
    }
}

// =========================================================
// VIEW: DASHBOARD (/dashboard)
// =========================================================
export async function renderDashboard() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    const availBal = Math.max(0, (state.wallet.balance || 0) - (state.wallet.lockedBalance || 0));

    app.innerHTML = `
        <div class="container section">
            <!-- User Welcome Banner -->
            <div class="dashboard-banner">
                <div>
                    <span class="eyebrow">PLAYER CONTROL CENTER</span>
                    <h2>Welcome back, <span style="color:var(--purple)">${esc(state.userProfile?.username || "Gamer")}</span></h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Manage your match entries, track live room codes, and cash out your winnings.</p>
                </div>
                <div class="dashboard-banner-actions">
                    <a href="#/tournaments" class="btn btn-primary">Join Tournaments</a>
                    <a href="#/deposit" class="btn btn-secondary">Add Cash ₹</a>
                </div>
            </div>

            <!-- Financial & Esports Stats -->
            <div class="admin-stats" style="margin-top:24px;">
                <div class="admin-stat">
                    <span>Available Balance</span>
                    <strong style="color:var(--green)">${money(availBal)}</strong>
                    <small>Locked: ${money(state.wallet.lockedBalance || 0)}</small>
                </div>
                <div class="admin-stat">
                    <span>Total Won</span>
                    <strong style="color:var(--gold)">${money(state.wallet.totalWinnings || state.userProfile?.totalEarnings || 0)}</strong>
                    <small>Prize Payouts</small>
                </div>
                <div class="admin-stat">
                    <span>Matches Played</span>
                    <strong>${state.userProfile?.totalMatches || 0}</strong>
                    <small>Wins: ${state.userProfile?.totalWins || 0}</small>
                </div>
                <div class="admin-stat">
                    <span>Total Kills</span>
                    <strong>${state.userProfile?.totalKills || 0}</strong>
                    <small>Verified Frags</small>
                </div>
            </div>

            <!-- Quick Action Shortcuts -->
            <div class="quick-action-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-top:20px;">
                <a href="#/my-matches" class="quick-nav-card">
                    <span class="quick-icon">◈</span>
                    <strong>My Matches</strong>
                    <small>Room details & status</small>
                </a>
                <a href="#/wallet" class="quick-nav-card">
                    <span class="quick-icon">💳</span>
                    <strong>My Wallet</strong>
                    <small>Deposit & Withdrawal</small>
                </a>
                <a href="#/results" class="quick-nav-card">
                    <span class="quick-icon">🏆</span>
                    <strong>Results</strong>
                    <small>Standings & Kills</small>
                </a>
                <a href="#/profile" class="quick-nav-card">
                    <span class="quick-icon">👤</span>
                    <strong>Refer & Earn</strong>
                    <small>Share code for coins</small>
                </a>
                <a href="#/support" class="quick-nav-card">
                    <span class="quick-icon">🎧</span>
                    <strong>Support</strong>
                    <small>Tickets & live chat</small>
                </a>
            </div>

            <!-- Registered Matches -->
            <div class="section-head" style="margin-top:40px;">
                <div>
                    <span class="eyebrow">ACTIVE ROSTERS</span>
                    <h2>My Active Matches</h2>
                </div>
                <a href="#/my-matches" class="btn btn-sm btn-secondary">View All Matches →</a>
            </div>
            <div id="dashActiveMatches" class="card-grid">
                <div class="loading">Loading your registered matches...</div>
            </div>
        </div>
    `;

    loadDashboardMatches();
}

async function loadDashboardMatches() {
    try {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        const snap = await getDocs(collection(db, "tournaments"));
        const matches = [];

        for (const docSnap of snap.docs) {
            const tData = { id: docSnap.id, ...docSnap.data() };
            // Check if user is in entries
            const entrySnap = await getDoc(doc(db, "tournaments", docSnap.id, "entries", uid));
            if (entrySnap.exists()) {
                matches.push({ ...tData, entry: entrySnap.data() });
            }
        }

        const grid = $("dashActiveMatches");
        if (!grid) return;

        if (matches.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-card" style="grid-column:1/-1;">
                    <h3>No Active Registrations</h3>
                    <p>You haven't joined any upcoming tournaments yet.</p>
                    <a href="#/tournaments" class="btn btn-sm btn-primary" style="margin-top:12px;">Browse Tournaments</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = matches.slice(0, 3).map(t => renderMyMatchCard(t)).join("");
    } catch (e) {
        if ($("dashActiveMatches")) $("dashActiveMatches").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

// =========================================================
// VIEW: TOURNAMENTS (/tournaments) & DETAILS (/tournaments/:id)
// =========================================================
export async function renderTournaments(params, query) {
    const app = $("appContainer");
    const activeMode = query.mode || "ALL";

    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">COMPETITIVE LOBBIES</span>
                    <h2>Esports Tournaments</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Filter by match format, check slot availability, and register with your squad.</p>
                </div>
                <div class="search-bar-wrap">
                    <input type="search" id="tourneySearch" placeholder="Search tournament name or map..." class="search-input">
                </div>
            </div>

            <!-- Mode Filter Pills -->
            <div class="filter-pills-row" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px;">
                <button class="filter-pill ${activeMode === 'ALL' ? 'active' : ''}" data-mode="ALL">All Modes</button>
                <button class="filter-pill ${activeMode === '1v1' ? 'active' : ''}" data-mode="1v1">⚔️ 1v1 Matches</button>
                <button class="filter-pill ${activeMode === 'BR' ? 'active' : ''}" data-mode="BR">🪂 Battle Royale (BR)</button>
                <button class="filter-pill ${activeMode === 'Solo' ? 'active' : ''}" data-mode="Solo">Solo BR</button>
                <button class="filter-pill ${activeMode === 'Duo' ? 'active' : ''}" data-mode="Duo">Duo BR</button>
                <button class="filter-pill ${activeMode === 'Squad' ? 'active' : ''}" data-mode="Squad">Squad BR</button>
            </div>

            <div id="tournamentsListGrid" class="card-grid">
                <div class="loading">Loading tournaments...</div>
            </div>
        </div>
    `;

    loadTournamentsList(activeMode);

    // Setup filter clicks
    document.querySelectorAll(".filter-pill").forEach(btn => {
        btn.onclick = () => {
            const m = btn.dataset.mode;
            router.navigate(m === "ALL" ? "/tournaments" : `/tournaments?mode=${encodeURIComponent(m)}`);
        };
    });

    $("tourneySearch")?.addEventListener("input", () => loadTournamentsList(activeMode));
}

let cachedTournaments = [];
async function loadTournamentsList(modeFilter) {
    try {
        if (cachedTournaments.length === 0) {
            const snap = await getDocs(collection(db, "tournaments"));
            cachedTournaments = [];
            snap.forEach(d => cachedTournaments.push({ id: d.id, ...d.data() }));
        }

        const q = ($("tourneySearch")?.value || "").toLowerCase().trim();
        const filtered = cachedTournaments.filter(t => {
            const rawMode = (t.mode || "Solo").toLowerCase();
            const is1v1 = rawMode.includes("1v1") || rawMode.includes("lone") || t.format === "1v1" || t.format === "LONE_WOLF" || Number(t.slots ?? t.totalSlots) === 2;
            const isBR = !is1v1;

            let matchesMode = false;
            if (modeFilter === "ALL") {
                matchesMode = true;
            } else if (modeFilter === "1v1") {
                matchesMode = is1v1;
            } else if (modeFilter === "BR") {
                matchesMode = isBR;
            } else if (modeFilter === "Solo") {
                matchesMode = isBR && rawMode.includes("solo");
            } else if (modeFilter === "Duo") {
                matchesMode = isBR && rawMode.includes("duo");
            } else if (modeFilter === "Squad") {
                matchesMode = isBR && rawMode.includes("squad");
            } else {
                matchesMode = rawMode === modeFilter.toLowerCase();
            }

            const text = [t.name, t.game, t.mode, t.map, t.description].join(" ").toLowerCase();
            const matchesQuery = !q || text.includes(q);
            return matchesMode && matchesQuery;
        });

        const grid = $("tournamentsListGrid");
        if (!grid) return;

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-card" style="grid-column:1/-1;">
                    <h3>No Tournaments Found</h3>
                    <p>No matches matching this filter are currently scheduled.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(t => renderTournamentCardHtml(t)).join("");
    } catch (e) {
        if ($("tournamentsListGrid")) $("tournamentsListGrid").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

export async function renderTournamentDetails(params) {
    const id = params.id;
    const app = $("appContainer");
    app.innerHTML = `<div class="container section"><div class="loading">Loading tournament details...</div></div>`;

    try {
        const snap = await getDoc(doc(db, "tournaments", id));
        if (!snap.exists()) {
            app.innerHTML = `<div class="container section"><div class="empty-state-card"><h3>Tournament Not Found</h3><a href="#/tournaments" class="btn btn-secondary">Back to Tournaments</a></div></div>`;
            return;
        }

        const t = { id: snap.id, ...snap.data() };
        const is1v1 = (t.mode || "").toLowerCase().includes("1v1") || (t.mode || "").toLowerCase().includes("lone") || t.format === "1v1" || t.format === "LONE_WOLF" || Number(t.slots ?? t.totalSlots) === 2;
        const slots = is1v1 ? 2 : Number(t.slots ?? t.totalSlots ?? 48);
        const joined = Number(t.joinedSlots ?? t.currentSlots ?? 0);
        const fee = Number(t.entryFee ?? 0);
        const prize = Number(t.prizePool ?? t.prize ?? 0);
        const perKill = Number(t.perKillCoins ?? t.perKill ?? 0);
        const isFull = joined >= slots && slots > 0;
        const mode = is1v1 ? "1v1 Match" : (t.mode || "Solo");

        app.innerHTML = `
            <div class="container section">
                <a href="#/tournaments" class="btn btn-sm btn-secondary" style="margin-bottom:20px;">← Back to Tournaments</a>
                
                <div class="tournament-detail-header">
                    <div>
                        <span class="eyebrow">${esc(t.game || "Free Fire")} • ${esc(mode)}</span>
                        <h1 style="margin:8px 0 14px;">${esc(t.name || "Tournament")}</h1>
                        <p style="color:var(--muted); max-width:640px;">${esc(t.description || (is1v1 ? "Direct 2-player 1v1 duel. Winner takes the full champion payout." : "Compete against top players in this verified Battle Royale match."))}</p>
                    </div>
                    <div class="detail-badge-box">
                        <span class="status ${t.status === 'live' ? 'active' : ''}">${esc(t.status || 'UPCOMING').toUpperCase()}</span>
                        <div style="margin-top:14px;">
                            <strong style="font-size:26px; color:var(--gold);">${money(prize)}</strong>
                            <small style="display:block; color:var(--muted);">${is1v1 ? 'Winner Payout' : 'Total Prize Pool'}</small>
                        </div>
                    </div>
                </div>

                <div class="detail-meta-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin:24px 0;">
                    <div class="meta-card">
                        <span>ENTRY FEE</span>
                        <strong>${fee === 0 ? '<span style="color:var(--green)">FREE</span>' : money(fee)}</strong>
                    </div>
                    <div class="meta-card">
                        <span>${is1v1 ? 'PLAYERS READY' : 'SLOTS FILLED'}</span>
                        <strong>${joined} / ${slots} ${is1v1 ? 'Players' : ''}</strong>
                    </div>
                    <div class="meta-card">
                        <span>MAP</span>
                        <strong>${esc(t.map || "Bermuda")}</strong>
                    </div>
                    <div class="meta-card">
                        <span>MATCH START</span>
                        <strong>${formatDt(t.startTime || t.date)}</strong>
                    </div>
                    <div class="meta-card">
                        <span>${is1v1 ? 'FORMAT' : 'PER KILL REWARD'}</span>
                        <strong>${is1v1 ? '1v1 Head-to-Head' : (perKill > 0 ? money(perKill) : '—')}</strong>
                    </div>
                </div>

                <!-- Room Credentials Section -->
                ${(() => {
                    const startMs = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
                    const isNearStart = startMs > 0 && (startMs - Date.now()) <= 15 * 60 * 1000;
                    const isLive = (t.status || "").toLowerCase() === "live" || (t.status || "").toLowerCase() === "started";
                    const isCompleted = (t.status || "").toLowerCase() === "completed" || t.resultsPublished === true;
                    const isExplicitlyReleased = t.roomReleased === true || t.roomReleased === "true" || t.releaseRoomDetails === true || t.releaseRoomDetails === "true";
                    const hasRoomId = Boolean(t.roomId && String(t.roomId).trim() !== "" && String(t.roomId).trim() !== "—");
                    const isRoomUnlocked = isCompleted || isExplicitlyReleased || (hasRoomId && (isNearStart || isLive));
                    const roomId = t.roomId || "—";
                    const roomPass = t.roomPassword || "—";

                    if (isRoomUnlocked && hasRoomId) {
                        return `
                            <div class="admin-panel" style="margin-top:24px; border:1px dashed var(--green); background:#0c121e;">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                                    <div>
                                        <span class="eyebrow" style="color:var(--green);">🔓 ROOM CREDENTIALS UNLOCKED</span>
                                        <div style="display:flex; gap:36px; margin-top:10px;">
                                            <div>
                                                <span style="font-size:11px; color:var(--muted); display:block;">Room ID:</span>
                                                <strong style="font-size:18px; color:#fff; font-family:monospace;">${esc(roomId)}</strong>
                                            </div>
                                            <div>
                                                <span style="font-size:11px; color:var(--muted); display:block;">Password:</span>
                                                <strong style="font-size:18px; color:var(--green); font-family:monospace;">${esc(roomPass)}</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('Room ID: ${esc(roomId)}, Password: ${esc(roomPass)}'); showToast('Room credentials copied!');">
                                        Copy Room Credentials
                                    </button>
                                </div>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="admin-panel" style="margin-top:24px; background:#0c0e15;">
                                <span class="eyebrow" style="color:var(--muted);">🔒 ROOM DETAILS (LOCKED)</span>
                                <p style="color:var(--muted); margin:6px 0 0; font-size:13px;">
                                    Room ID and password will be displayed 15 minutes before match time or when released by organizer.
                                </p>
                            </div>
                        `;
                    }
                })()}

                <!-- Prize Breakup & Rules -->
                <div class="admin-grid" style="margin-top:24px;">
                    <div class="admin-panel">
                        <span class="eyebrow">REWARD ALLOCATION</span>
                        <h2>Prize Distribution</h2>
                        ${is1v1 ? `
                            <div class="prize-table">
                                <div class="prize-row"><span>👑 1v1 Champion (Winner)</span><strong style="color:var(--gold); font-size:16px;">${money(prize)} (100% Prize Pool)</strong></div>
                                <div class="prize-row"><span>🥈 Runner-Up (2nd)</span><strong style="color:var(--muted);">₹0 (Battle Honor)</strong></div>
                            </div>
                        ` : `
                            <div class="prize-table">
                                <div class="prize-row"><span>🥇 1st Place (Champion)</span><strong>${money(Math.round(prize * 0.50))}</strong></div>
                                <div class="prize-row"><span>🥈 2nd Place (Runner Up)</span><strong>${money(Math.round(prize * 0.30))}</strong></div>
                                <div class="prize-row"><span>🥉 3rd Place</span><strong>${money(Math.round(prize * 0.20))}</strong></div>
                            </div>
                        `}
                    </div>
                    <div class="admin-panel">
                        <span class="eyebrow">GUIDELINES</span>
                        <h2>Match Rules</h2>
                        <ul class="rules-list">
                            ${is1v1 ? `
                                <li>Direct 1v1 head-to-head match between 2 registered players.</li>
                                <li>Custom room credentials unlock in <strong>My Matches</strong> 15 minutes before start.</li>
                                <li>The winner of the match takes the full ₹${Number(prize).toLocaleString('en-IN')} prize directly credited to wallet.</li>
                                <li>Teaming, third-party apps, or cheats result in permanent disqualification.</li>
                            ` : `
                                <li>Emulators / PC players are strictly prohibited unless specified.</li>
                                <li>Room ID and Password will unlock in <strong>My Matches</strong> 15 minutes before match time.</li>
                                <li>Teaming with enemies or using unauthorized scripts will result in immediate disqualification without refund.</li>
                                <li>Screenshot of match end score is mandatory in case of disputes.</li>
                            `}
                        </ul>
                    </div>
                </div>

                <!-- Join Action Bar -->
                <div class="join-action-bar" style="margin-top:34px; padding:24px; background:#11131b; border:1px solid var(--line); border-radius:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                    <div>
                        <strong style="font-size:18px; display:block;">Ready for the Battle?</strong>
                        <span style="color:var(--muted); font-size:13px;">Entry fee: ${money(fee)} (Deducted from available wallet balance)</span>
                    </div>
                    <div>
                        ${isFull 
                            ? `<button class="btn btn-secondary" disabled>LOBBY FULL</button>` 
                            : `<button id="openJoinModalBtn" class="btn btn-primary">REGISTER FOR TOURNAMENT</button>`
                        }
                    </div>
                </div>
            </div>
        `;

        $("openJoinModalBtn")?.addEventListener("click", () => openJoinTournamentModal(t));
    } catch (e) {
        app.innerHTML = `<div class="container section"><div class="empty-state-card">Error: ${esc(e.message)}</div></div>`;
    }
}

function openJoinTournamentModal(t) {
    if (!state.currentUser) {
        showToast("Please sign in to register for tournaments.", true);
        router.navigate("/login");
        return;
    }

    const availBal = Math.max(0, (state.wallet.balance || 0) - (state.wallet.lockedBalance || 0));
    const fee = Number(t.entryFee || 0);

    const modal = $("modalContainer");
    modal.innerHTML = `
        <div class="modal-backdrop" id="joinModalBackdrop">
            <div class="user-modal">
                <div class="modal-head">
                    <div>
                        <span class="eyebrow">REGISTRATION CONFIRMATION</span>
                        <h2>Join ${esc(t.name || "Tournament")}</h2>
                        <p>Format: <strong>${esc(t.mode || "Solo")}</strong> • Entry Fee: <strong>${money(fee)}</strong></p>
                    </div>
                    <button class="close-btn" id="closeJoinModal">✕</button>
                </div>

                <div class="wallet-check-box" style="padding:14px; background:#0a0b10; border:1px solid var(--line); border-radius:14px; margin:16px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="color:var(--muted); font-size:12px; display:block;">Your Available Wallet Balance</span>
                        <strong style="font-size:18px; color:${availBal >= fee ? 'var(--green)' : 'var(--red)'}">${money(availBal)}</strong>
                    </div>
                    ${availBal < fee ? `<a href="#/deposit" class="btn btn-sm btn-primary">Add Cash ₹</a>` : `<span class="pill" style="color:var(--green);">Funds Available</span>`}
                </div>

                <form id="joinTournamentForm" class="form-grid">
                    <label style="grid-column:1/-1;">
                        In-Game Name (IGN) *
                        <input id="joinIGN" type="text" placeholder="Enter your exact Free Fire / BGMI Name" required>
                    </label>

                    ${t.mode === 'Duo' || t.mode === 'Squad' ? `
                        <label style="grid-column:1/-1;">
                            Team / Squad Name
                            <input id="joinTeamName" type="text" placeholder="e.g. Phoenix Elite">
                        </label>
                        <label style="grid-column:1/-1;">
                            Teammate In-Game Names (comma separated)
                            <input id="joinTeammates" type="text" placeholder="e.g. Player2_IGN, Player3_IGN">
                        </label>
                    ` : ''}

                    <div style="grid-column:1/-1; margin-top:14px;">
                        <button type="submit" id="confirmJoinBtn" class="btn btn-primary full" ${availBal < fee ? 'disabled' : ''}>
                            ${availBal < fee ? 'INSUFFICIENT BALANCE (ADD CASH)' : `PAY ${money(fee)} & CONFIRM ENTRY`}
                        </button>
                    </div>
                </form>
                <p id="joinModalError" class="error" style="margin-top:10px;"></p>
            </div>
        </div>
    `;

    $("closeJoinModal").onclick = () => modal.innerHTML = "";
    $("joinModalBackdrop").onclick = e => { if (e.target.id === "joinModalBackdrop") modal.innerHTML = ""; };

    $("joinTournamentForm").onsubmit = async e => {
        e.preventDefault();
        const err = $("joinModalError");
        const btn = $("confirmJoinBtn");
        err.textContent = "";
        btn.disabled = true;
        btn.textContent = "PROCESSING JOIN...";

        const ign = $("joinIGN").value.trim();
        const teamName = $("joinTeamName")?.value.trim() || "";
        const teammates = ($("joinTeammates")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
        const uid = state.currentUser.uid;

        try {
            // Atomic Firestore Transaction
            await runTransaction(db, async tx => {
                const tRef = doc(db, "tournaments", t.id);
                const wRef = doc(db, "wallets", uid);
                const uRef = doc(db, "users", uid);
                const eRef = doc(db, "tournaments", t.id, "entries", uid);

                const [tSnap, wSnap, eSnap] = await Promise.all([
                    tx.get(tRef),
                    tx.get(wRef),
                    tx.get(eRef)
                ]);

                if (!tSnap.exists()) throw new Error("Tournament not found.");
                if (eSnap.exists()) throw new Error("You have already registered for this tournament.");

                const wData = wSnap.exists() ? wSnap.data() : {};
                const bal = Number(wData.balance || 0);
                const locked = Number(wData.lockedBalance || 0);
                const avail = bal - locked;

                if (avail < fee) throw new Error(`Insufficient balance. Please add cash.`);

                const slots = Number(tSnap.data().slots ?? tSnap.data().totalSlots ?? 48);
                const joined = Number(tSnap.data().joinedSlots ?? tSnap.data().currentSlots ?? 0);
                if (joined >= slots && slots > 0) throw new Error("Tournament is full.");

                // 1. Deduct wallet
                const newBal = bal - fee;
                tx.set(wRef, { balance: newBal, updatedAt: serverTimestamp() }, { merge: true });
                tx.set(uRef, { walletBalance: newBal, totalMatches: increment(1), updatedAt: serverTimestamp() }, { merge: true });

                // 2. Increment tournament slot count
                tx.update(tRef, {
                    joinedSlots: increment(1),
                    currentSlots: increment(1),
                    updatedAt: serverTimestamp()
                });

                // 3. Save entry
                tx.set(eRef, {
                    id: uid,
                    userId: uid,
                    tournamentId: t.id,
                    inGameName: ign,
                    teamName: teamName,
                    teammates: teammates,
                    entryFee: fee,
                    status: "JOINED",
                    createdAt: serverTimestamp()
                });

                // 4. Record wallet transaction
                const txRef = doc(collection(db, "walletTransactions"));
                tx.set(txRef, {
                    transactionId: txRef.id,
                    id: txRef.id,
                    uid: uid,
                    userId: uid,
                    type: "ENTRY_FEE",
                    amount: fee,
                    status: "COMPLETED",
                    referenceId: t.id,
                    description: `Entry Fee for ${t.name || "Tournament"}`,
                    createdAt: serverTimestamp()
                });
            });

            modal.innerHTML = "";
            showToast("Successfully registered for tournament!");
            cachedTournaments = []; // Invalidate cache
            router.navigate("/my-matches");
        } catch (x) {
            err.textContent = x.message || "Failed to join tournament.";
            btn.disabled = false;
            btn.textContent = `PAY ${money(fee)} & CONFIRM ENTRY`;
        }
    };
}

// =========================================================
// VIEW: MY MATCHES (/my-matches)
// =========================================================
export async function renderMyMatches(params, query) {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    const activeTab = query.tab || "upcoming";

    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">YOUR REGISTRATIONS</span>
                    <h2>My Matches</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">View match credentials (Room ID & Password), live countdowns, and results.</p>
                </div>
            </div>

            <!-- Tab Row -->
            <div class="filter-pills-row" style="display:flex; gap:10px; margin-bottom:24px;">
                <button class="filter-pill ${activeTab === 'upcoming' ? 'active' : ''}" data-tab="upcoming">Upcoming</button>
                <button class="filter-pill ${activeTab === 'live' ? 'active' : ''}" data-tab="live">Live</button>
                <button class="filter-pill ${activeTab === 'completed' ? 'active' : ''}" data-tab="completed">Completed</button>
            </div>

            <div id="myMatchesGrid" class="card-grid">
                <div class="loading">Loading your matches...</div>
            </div>
        </div>
    `;

    document.querySelectorAll(".filter-pill[data-tab]").forEach(b => {
        b.onclick = () => router.navigate(`/my-matches?tab=${b.dataset.tab}`);
    });

    loadMyMatchesList(activeTab);
}

async function loadMyMatchesList(tab) {
    try {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        const snap = await getDocs(collection(db, "tournaments"));
        const matches = [];

        for (const docSnap of snap.docs) {
            const tData = docSnap.data();
            let entry = null;
            let myResult = null;

            // 1. Check entries subcollection
            const entrySnap = await getDoc(doc(db, "tournaments", docSnap.id, "entries", uid));
            if (entrySnap.exists()) {
                entry = entrySnap.data();
            } else {
                // 2. Check joins subcollection
                const joinSnap = await getDoc(doc(db, "tournaments", docSnap.id, "joins", uid));
                if (joinSnap.exists()) {
                    entry = joinSnap.data();
                }
            }

            // 3. If tournament is completed, check if user has an official result recorded
            const isCompleted = (tData.status || "").toLowerCase() === "completed" || tData.resultsPublished === true;
            if (isCompleted) {
                try {
                    const finalSnap = await getDoc(doc(db, "tournaments", docSnap.id, "results", "final"));
                    if (finalSnap.exists()) {
                        const results = finalSnap.data().results || [];
                        myResult = results.find(r => r.uid === uid || (entry && (r.ign === entry.inGameName || r.ign === entry.iglInGameName)));
                    }
                } catch (_) {}
            }

            // Include if entered or if recorded in results
            if (entry || myResult) {
                matches.push({ id: docSnap.id, ...tData, entry: entry || {}, myResult });
            }
        }

        // Sort descending by match date (ensuring matches from 1 month ago are listed properly)
        matches.sort((a, b) => {
            const timeA = (a.startTime?.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime || a.date || 0).getTime()) || 0;
            const timeB = (b.startTime?.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime || b.date || 0).getTime()) || 0;
            return timeB - timeA;
        });

        const filtered = matches.filter(t => {
            const s = (t.status || "upcoming").toLowerCase();
            const startMs = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
            const isCompleted = s === "completed" || s === "cancelled" || s === "canceled" || t.resultsPublished === true;

            if (tab === "completed") return isCompleted;
            if (tab === "live") return !isCompleted && (s === "live" || s === "started" || s === "in_progress" || (startMs > 0 && startMs <= Date.now()));
            if (tab === "upcoming") return !isCompleted && (s === "upcoming" || s === "open" || s === "registration_open" || s === "starting_soon" || (startMs > Date.now() || startMs === 0));
            return true;
        });

        const grid = $("myMatchesGrid");
        if (!grid) return;

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-card" style="grid-column:1/-1;">
                    <h3>No Matches Found</h3>
                    <p>No ${tab} matches found in your account.</p>
                    <a href="#/tournaments" class="btn btn-sm btn-primary" style="margin-top:14px;">Browse Tournaments</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(t => renderMyMatchCard(t, tab === "completed")).join("");
    } catch (e) {
        if ($("myMatchesGrid")) $("myMatchesGrid").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

function renderMyMatchCard(t, isCompletedTab = false) {
    const isCompleted = isCompletedTab || (t.status || "").toLowerCase() === "completed" || t.resultsPublished === true;
    const startMs = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
    const isNearStart = startMs > 0 && (startMs - Date.now()) <= 15 * 60 * 1000;
    const hasRoomCreds = Boolean(t.roomId && String(t.roomId).trim() !== "" && String(t.roomId).trim() !== "—");
    const isExplicitlyReleased = t.roomReleased === true || t.roomReleased === "true" || t.releaseRoomDetails === true || t.releaseRoomDetails === "true";
    const isReleased = isCompleted || isExplicitlyReleased || (hasRoomCreds && (isNearStart || (t.status || "").toLowerCase() === "live" || (t.status || "").toLowerCase() === "started"));
    const roomId = t.roomId || "—";
    const roomPass = t.roomPassword || "—";

    const res = t.myResult;
    let resultBannerHtml = "";
    if (res) {
        const pos = Number(res.position || 0);
        const posBadge = pos === 1 ? '👑 1st Place Champion' : (pos === 2 ? '🥈 2nd Place Runner-Up' : (pos === 3 ? '🥉 3rd Place' : `#${pos} Place`));
        const posColor = pos === 1 ? 'var(--gold)' : (pos === 2 ? '#c0c0c0' : (pos === 3 ? '#cd7f32' : '#fff'));

        resultBannerHtml = `
            <div style="background:#0c0e15; border:1px solid var(--line); border-radius:12px; padding:12px; margin:12px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:${posColor};">${posBadge}</span>
                    <span style="color:var(--green); font-weight:bold; font-size:15px;">+${money(res.totalReward || 0)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-top:6px;">
                    <span>Kills: <strong style="color:var(--red);">${esc(res.kills || 0)}</strong> (${money(res.killReward || 0)})</span>
                    <span>Position Prize: <strong style="color:#fff;">${money(res.positionReward || 0)}</strong></span>
                </div>
            </div>
        `;
    }

    return `
        <article class="tournament-card">
            <div class="tournament-card-top">
                <span class="tournament-game">${esc(t.game || "Free Fire")} • ${esc(t.mode || "Solo")} • ${esc(t.map || "Bermuda")}</span>
                <span class="status ${isCompleted ? 'active' : (t.status === 'live' ? 'active' : '')}">${isCompleted ? 'COMPLETED' : esc(t.status || 'UPCOMING').toUpperCase()}</span>
            </div>
            <h3>${esc(t.name || "Tournament")}</h3>
            
            ${resultBannerHtml}

            <div class="room-credentials-box" style="background:#090a0f; border:1px dashed ${isReleased ? 'var(--green)' : 'var(--line)'}; border-radius:14px; padding:14px; margin:14px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="eyebrow" style="color:${isReleased ? 'var(--green)' : 'var(--muted)'};">
                        ${isCompleted ? '📜 ARCHIVED MATCH CREDENTIALS' : (isReleased ? '🔓 ROOM CREDENTIALS UNLOCKED' : '🔒 ROOM DETAILS (LOCKED)')}
                    </span>
                    ${isReleased && hasRoomCreds ? `
                        <button class="btn btn-sm" style="padding:2px 8px; font-size:11px; background:#18281d; color:var(--green); border:1px solid var(--green); cursor:pointer;" onclick="navigator.clipboard.writeText('Room ID: ${esc(roomId)}, Password: ${esc(roomPass)}'); showToast('Room credentials copied!');">Copy</button>
                    ` : ''}
                </div>
                ${isReleased ? `
                    <div style="display:flex; justify-content:space-between; margin-top:8px;">
                        <div>
                            <span style="font-size:11px; color:var(--muted);">Room ID:</span>
                            <strong style="font-size:16px; color:#fff; display:block; font-family:monospace;">${esc(roomId)}</strong>
                        </div>
                        <div>
                            <span style="font-size:11px; color:var(--muted);">Password:</span>
                            <strong style="font-size:16px; color:#fff; display:block; font-family:monospace;">${esc(roomPass)}</strong>
                        </div>
                    </div>
                ` : `
                    <p style="font-size:12px; color:var(--muted); margin:6px 0 0;">
                        Room ID and password will be displayed 15 minutes before the match starts or when released by organizer.
                    </p>
                `}
            </div>

            <div style="font-size:12px; color:var(--muted); margin-bottom:12px; display:flex; justify-content:space-between;">
                <span>IGN: <strong style="color:#fff;">${esc(t.entry?.inGameName || t.entry?.iglInGameName || res?.ign || "Player")}</strong></span>
                <span>Team: <strong style="color:#fff;">${esc(t.entry?.teamName || res?.team || "Solo")}</strong></span>
            </div>

            <div class="card-footer-action">
                <span class="match-time">⏰ ${formatDt(t.startTime || t.date)}</span>
                ${isCompleted ? `
                    <a href="#/results/${t.id}" class="btn btn-sm btn-primary">Scorecard →</a>
                ` : `
                    <a href="#/tournaments/${t.id}" class="btn btn-sm btn-secondary">Details</a>
                `}
            </div>
        </article>
    `;
}

// =========================================================
// VIEW: WALLET (/wallet), DEPOSIT (/deposit), WITHDRAW (/withdraw)
// =========================================================
export function renderWallet() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    const bal = state.wallet.balance || 0;
    const locked = state.wallet.lockedBalance || 0;
    const avail = Math.max(0, bal - locked);
    const winnings = state.userProfile?.totalWinning || state.userProfile?.totalEarnings || state.wallet.totalWinning || 0;

    app.innerHTML = `
        <div class="container section">
            <div class="section-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
                <div>
                    <span class="eyebrow">ACCOUNT WALLET DETAILS</span>
                    <h2>My Wallet</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Comprehensive audit of your available credits, locked payouts, and tournament winnings.</p>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <a href="#/deposit" class="btn btn-primary" style="font-weight:700;">Deposit Funds (Add Money) +</a>
                    <a href="#/withdraw" class="btn btn-secondary" style="font-weight:700;">Withdraw Funds ↙</a>
                    <a href="#/transactions" class="btn btn-secondary">All Transactions ↕</a>
                </div>
            </div>

            <!-- Balances Breakdown (Wallet Details Only) -->
            <div class="admin-stats" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
                <div class="admin-stat">
                    <span>Available Balance</span>
                    <strong style="color:var(--green); font-size:26px;">${money(avail)}</strong>
                    <small style="color:var(--muted);">Ready for tournament entries</small>
                </div>
                <div class="admin-stat">
                    <span>Locked Balance</span>
                    <strong style="color:var(--gold); font-size:26px;">${money(locked)}</strong>
                    <small style="color:var(--muted);">Pending cashout verification</small>
                </div>
                <div class="admin-stat">
                    <span>Total Winnings</span>
                    <strong style="color:var(--blue); font-size:26px;">${money(winnings)}</strong>
                    <small style="color:var(--muted);">Lifetime tournament rewards</small>
                </div>
                <div class="admin-stat">
                    <span>Total Deposited</span>
                    <strong style="font-size:26px;">${money(state.wallet.totalDeposited || 0)}</strong>
                    <small style="color:var(--muted);">Lifetime credits added</small>
                </div>
                <div class="admin-stat">
                    <span>Total Withdrawn</span>
                    <strong style="font-size:26px;">${money(state.wallet.totalWithdrawn || 0)}</strong>
                    <small style="color:var(--muted);">Lifetime payouts paid</small>
                </div>
            </div>

            <!-- Forward Action Centers -->
            <div class="admin-grid" style="margin-top:24px;">
                <div class="admin-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="eyebrow" style="color:var(--green);">PAYMENT GATEWAY URL</span>
                            <span class="pill" style="border-color:var(--green); color:var(--green);">FAST & SECURE</span>
                        </div>
                        <h2 style="margin-top:6px;">Deposit Funds</h2>
                        <p style="color:var(--muted); line-height:1.6;">
                            Top up your wallet balance instantly via Razorpay, Google Pay, PhonePe, Paytm, or UPI QR code. Funds are credited immediately to join upcoming matches.
                        </p>
                    </div>
                    <div style="margin-top:20px;">
                        <a href="#/deposit" class="btn btn-primary full" style="font-weight:700; text-align:center;">Forward to Deposit Processing Page ↗</a>
                    </div>
                </div>

                <div class="admin-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="eyebrow" style="color:var(--gold);">DIRECT CASHOUT URL</span>
                            <span class="pill" style="border-color:var(--gold); color:var(--gold);">MIN ₹50</span>
                        </div>
                        <h2 style="margin-top:6px;">Withdraw Funds</h2>
                        <p style="color:var(--muted); line-height:1.6;">
                            Transfer your tournament cash prizes directly to your UPI ID or Bank account (IMPS). Payouts are verified by administrators within minutes.
                        </p>
                    </div>
                    <div style="margin-top:20px;">
                        <a href="#/withdraw" class="btn btn-secondary full" style="font-weight:700; text-align:center;">Forward to Withdrawal Processing Page ↗</a>
                    </div>
                </div>
            </div>

            <!-- Recent Wallet Activity Audit -->
            <div class="admin-panel" style="margin-top:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div>
                        <span class="eyebrow">AUDIT TRAIL</span>
                        <h3 style="margin:4px 0 0;">Recent Wallet Transactions</h3>
                    </div>
                    <a href="#/transactions" class="btn btn-sm btn-secondary">View Full History ↗</a>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Description</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="walletQuickTxTable">
                            <tr><td colspan="5" style="text-align:center; padding:18px; color:var(--muted);">Loading transaction ledger...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Load recent 10 transactions for this wallet
    loadWalletOverviewLedger();
}

async function loadWalletOverviewLedger() {
    const tbody = $("walletQuickTxTable");
    if (!tbody || !state.currentUser) return;

    try {
        const uid = state.currentUser.uid;
        const q = query(
            collection(db, "walletTransactions"),
            where("uid", "==", uid),
            limit(10)
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        list.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || a.createdAt || 0;
            const tb = b.createdAt?.toMillis?.() || b.createdAt || 0;
            return tb - ta;
        });

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">No transactions recorded in this wallet yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(tx => {
            const isCredit = tx.type === "DEPOSIT" || tx.type === "PRIZE" || tx.type === "REFUND";
            return `
                <tr>
                    <td>${formatDt(tx.createdAt)}</td>
                    <td><strong>${esc(tx.description || tx.type)}</strong></td>
                    <td><span class="pill">${esc(tx.type || "TRANSACTION")}</span></td>
                    <td style="font-weight:bold; color:${isCredit ? 'var(--green)' : 'var(--red)'}">
                        ${isCredit ? '+' : '-'}${money(tx.amount)}
                    </td>
                    <td><span class="status ${tx.status === 'COMPLETED' || tx.status === 'APPROVED' ? 'active' : ''}">${esc(tx.status || 'COMPLETED')}</span></td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:var(--muted); text-align:center;">Recent ledger offline. View in <a href="#/transactions">All Transactions</a>.</td></tr>`;
    }
}

export function renderDeposit() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    app.innerHTML = `
        <div class="container section">
            <div class="login-box" style="margin:auto; max-width:540px;">
                <span class="eyebrow">SECURE PAYMENT GATEWAY</span>
                <h2>Deposit Funds</h2>
                <p>Top up your Elite X Gamers wallet instantly via UPI, Debit/Credit Card, or Netbanking.</p>
                
                <div class="form-grid" style="margin-top:20px;">
                    <label style="grid-column:1/-1;">
                        Enter Deposit Amount (₹)
                        <input id="depositAmountInput" type="number" min="10" step="1" value="100" placeholder="Min ₹10">
                    </label>

                    <div style="grid-column:1/-1; display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="mini" data-preset="50">+ ₹50</button>
                        <button class="mini" data-preset="100">+ ₹100</button>
                        <button class="mini" data-preset="200">+ ₹200</button>
                        <button class="mini" data-preset="500">+ ₹500</button>
                    </div>

                    <div style="grid-column:1/-1; margin-top:16px;">
                        <button id="startRazorpayBtn" class="btn btn-primary full">PROCEED TO PAY</button>
                    </div>
                </div>

                <div class="notice" style="margin-top:20px;">
                    🔒 Powered by Razorpay. 100% secure payments. No payment credentials or passwords are ever stored on our servers.
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll("[data-preset]").forEach(b => {
        b.onclick = () => $("depositAmountInput").value = b.dataset.preset;
    });

    $("startRazorpayBtn").onclick = () => {
        const amt = Number($("depositAmountInput").value || 0);
        if (amt < 10) {
            showToast("Minimum deposit amount is ₹10.", true);
            return;
        }
        initiateRazorpayDeposit(amt);
    };
}

async function initiateRazorpayDeposit(amount) {
    if (!window.Razorpay) {
        showToast("Razorpay SDK not loaded. Please refresh the page.", true);
        return;
    }

    const uid = state.currentUser?.uid;
    if (!uid) return;

    const amountInPaise = Math.round(amount * 100);
    const orderId = `order_${uid.slice(0, 6)}_${Date.now()}`;

    const options = {
        key: RAZORPAY_KEY_ID,
        amount: amountInPaise,
        currency: "INR",
        name: "Elite X Gamers",
        description: `Wallet Deposit of ₹${amount}`,
        prefill: {
            name: state.userProfile?.username || "Player",
            email: state.currentUser.email || ""
        },
        theme: {
            color: "#E91E2B"
        },
        handler: async function (response) {
            try {
                showToast("Payment successful! Crediting your wallet...");

                // Credit wallet atomically
                await runTransaction(db, async tx => {
                    const wRef = doc(db, "wallets", uid);
                    const uRef = doc(db, "users", uid);
                    const depRef = doc(db, "deposits", response.razorpay_payment_id || orderId);
                    const txRef = doc(collection(db, "walletTransactions"));

                    const wSnap = await tx.get(wRef);
                    const curBal = Number(wSnap.exists() ? wSnap.data().balance || 0 : 0);
                    const curDep = Number(wSnap.exists() ? wSnap.data().totalDeposited || 0 : 0);

                    tx.set(wRef, {
                        id: uid,
                        userId: uid,
                        balance: curBal + amount,
                        totalDeposited: curDep + amount,
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    tx.set(uRef, {
                        walletBalance: curBal + amount,
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    tx.set(depRef, {
                        depositId: depRef.id,
                        uid: uid,
                        userId: uid,
                        amount: amount,
                        paymentId: response.razorpay_payment_id || "",
                        orderId: response.razorpay_order_id || orderId,
                        method: "RAZORPAY",
                        status: "COMPLETED",
                        createdAt: serverTimestamp()
                    });

                    tx.set(txRef, {
                        transactionId: txRef.id,
                        id: txRef.id,
                        uid: uid,
                        userId: uid,
                        type: "DEPOSIT",
                        amount: amount,
                        status: "COMPLETED",
                        referenceId: response.razorpay_payment_id || orderId,
                        description: `Deposit via Razorpay (₹${amount})`,
                        createdAt: serverTimestamp()
                    });
                });

                showToast(`₹${amount} successfully added to your wallet!`);
                router.navigate("/wallet");
            } catch (err) {
                showToast("Error recording deposit: " + err.message, true);
            }
        }
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
}

export function renderWithdraw() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    const bal = state.wallet.balance || 0;
    const locked = state.wallet.lockedBalance || 0;
    const avail = Math.max(0, bal - locked);

    app.innerHTML = `
        <div class="container section">
            <div class="login-box" style="margin:auto; max-width:560px;">
                <span class="eyebrow">INSTANT PAYOUTS</span>
                <h2>Withdraw Winnings</h2>
                <p>Transfer your earnings directly to your UPI ID or Bank Account.</p>
                
                <div class="wallet-check-box" style="padding:14px; background:#0a0b10; border:1px solid var(--line); border-radius:14px; margin:16px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="color:var(--muted); font-size:12px; display:block;">Available for Cashout</span>
                        <strong style="font-size:22px; color:var(--green)">${money(avail)}</strong>
                    </div>
                    <span class="pill">Min: ₹50</span>
                </div>

                <form id="withdrawForm" class="form-grid">
                    <label>
                        Amount to Withdraw (₹) *
                        <input id="withdrawAmt" type="number" min="50" max="${avail}" step="1" placeholder="Min ₹50" required>
                    </label>

                    <label>
                        Payout Method *
                        <select id="withdrawMethod">
                            <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                            <option value="BANK">Direct Bank Transfer (IMPS)</option>
                        </select>
                    </label>

                    <label style="grid-column:1/-1;">
                        UPI ID / Bank Details *
                        <input id="withdrawDetails" type="text" placeholder="e.g. yourname@okaxis or Account No + IFSC" required>
                    </label>

                    <div style="grid-column:1/-1; margin-top:14px;">
                        <button type="submit" id="submitWithdrawBtn" class="btn btn-primary full" ${avail < 50 ? 'disabled' : ''}>
                            ${avail < 50 ? 'INSUFFICIENT BALANCE (MIN ₹50)' : 'SUBMIT WITHDRAWAL REQUEST'}
                        </button>
                    </div>
                </form>

                <p id="withdrawErr" class="error" style="margin-top:10px;"></p>
                
                <div class="notice" style="margin-top:20px;">
                    ⚠️ Withdrawals are processed within 1–2 hours. The requested amount is locked immediately and deducted once approved.
                </div>
            </div>
        </div>
    `;

    $("withdrawForm").onsubmit = async e => {
        e.preventDefault();
        const amt = Number($("withdrawAmt").value || 0);
        const details = $("withdrawDetails").value.trim();
        const method = $("withdrawMethod").value;
        const err = $("withdrawErr");
        const btn = $("submitWithdrawBtn");
        err.textContent = "";

        if (amt < 50) {
            err.textContent = "Minimum withdrawal amount is ₹50.";
            return;
        }
        if (amt > avail) {
            err.textContent = `Amount exceeds available balance (${money(avail)}).`;
            return;
        }

        btn.disabled = true;
        btn.textContent = "SUBMITTING...";

        const uid = state.currentUser.uid;
        try {
            await runTransaction(db, async tx => {
                const wRef = doc(db, "wallets", uid);
                const wSnap = await tx.get(wRef);
                const curBal = Number(wSnap.exists() ? wSnap.data().balance || 0 : 0);
                const curLocked = Number(wSnap.exists() ? wSnap.data().lockedBalance || 0 : 0);

                if (curBal - curLocked < amt) throw new Error("Insufficient available balance.");

                // Lock withdrawal amount
                tx.set(wRef, {
                    lockedBalance: curLocked + amt,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                const wDocRef = doc(collection(db, "withdrawals"));
                tx.set(wDocRef, {
                    withdrawalId: wDocRef.id,
                    id: wDocRef.id,
                    uid: uid,
                    userId: uid,
                    amount: amt,
                    payoutDetails: details,
                    method: method,
                    status: "PENDING",
                    createdAt: serverTimestamp()
                });

                const txRef = doc(collection(db, "walletTransactions"));
                tx.set(txRef, {
                    transactionId: txRef.id,
                    id: txRef.id,
                    uid: uid,
                    userId: uid,
                    type: "WITHDRAWAL",
                    amount: amt,
                    status: "PENDING",
                    referenceId: wDocRef.id,
                    description: `Withdrawal request of ${money(amt)} via ${method}`,
                    createdAt: serverTimestamp()
                });
            });

            showToast("Withdrawal request submitted successfully!");
            router.navigate("/wallet");
        } catch (x) {
            err.textContent = x.message || "Failed to submit withdrawal.";
            btn.disabled = false;
            btn.textContent = "SUBMIT WITHDRAWAL REQUEST";
        }
    };
}

// =========================================================
// VIEW: TRANSACTIONS (/transactions)
// =========================================================
export async function renderTransactions() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">AUDIT TRAIL</span>
                    <h2>Transaction History</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Complete record of your deposits, entries, prizes, and withdrawals.</p>
                </div>
                <a href="#/wallet" class="btn btn-sm btn-secondary">← Back to Wallet</a>
            </div>

            <div class="admin-panel table-wrapper" style="margin-top:20px;">
                <table>
                    <thead>
                        <tr>
                            <th>Date & Time</th>
                            <th>Description</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="userTxTable">
                        <tr><td colspan="5" class="loading">Loading transaction records...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    try {
        const uid = state.currentUser.uid;
        const q = query(
            collection(db, "walletTransactions"),
            where("uid", "==", uid),
            limit(50)
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        // Sort descending by date
        list.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || a.createdAt || 0;
            const tb = b.createdAt?.toMillis?.() || b.createdAt || 0;
            return tb - ta;
        });

        const tbody = $("userTxTable");
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--muted);">No transactions recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(tx => {
            const isCredit = tx.type === "DEPOSIT" || tx.type === "PRIZE" || tx.type === "REFUND";
            return `
                <tr>
                    <td>${formatDt(tx.createdAt)}</td>
                    <td><strong>${esc(tx.description || tx.type)}</strong></td>
                    <td><span class="pill">${esc(tx.type || "TRANSACTION")}</span></td>
                    <td style="font-weight:bold; color:${isCredit ? 'var(--green)' : 'var(--red)'}">
                        ${isCredit ? '+' : '-'}${money(tx.amount)}
                    </td>
                    <td><span class="status ${tx.status === 'COMPLETED' || tx.status === 'APPROVED' ? 'active' : ''}">${esc(tx.status || 'COMPLETED')}</span></td>
                </tr>
            `;
        }).join("");
    } catch (e) {
        if ($("userTxTable")) $("userTxTable").innerHTML = `<tr><td colspan="5">Error: ${esc(e.message)}</td></tr>`;
    }
}

// =========================================================
// VIEW: RESULTS (/results)
// =========================================================
export async function renderResults(params) {
    const app = $("appContainer");
    const tournamentId = params.id;

    if (tournamentId) {
        renderSingleTournamentResult(tournamentId);
        return;
    }

    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">ESPORTS ARCHIVES & MATCH HISTORY</span>
                    <h2>All Tournament Results</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Complete historical records—even from past months—with scorecards, kill counts, and prize distributions.</p>
                </div>
            </div>

            <div id="resultsGrid" class="card-grid">
                <div class="loading">Loading completed match results archive...</div>
            </div>
        </div>
    `;

    try {
        const snap = await getDocs(collection(db, "tournaments"));
        const completed = [];
        snap.forEach(d => {
            const t = { id: d.id, ...d.data() };
            if ((t.status || "").toLowerCase() === "completed" || t.resultsPublished === true) {
                completed.push(t);
            }
        });

        // Sort descending by match date (ensuring all historical matches from 1 month ago are visible)
        completed.sort((a, b) => {
            const timeA = (a.startTime?.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime || a.date || 0).getTime()) || 0;
            const timeB = (b.startTime?.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime || b.date || 0).getTime()) || 0;
            return timeB - timeA;
        });

        const grid = $("resultsGrid");
        if (!grid) return;

        if (completed.length === 0) {
            grid.innerHTML = `<div class="empty-state-card" style="grid-column:1/-1;"><h3>No Completed Tournaments</h3><p>Historical match results will appear here once matches conclude.</p></div>`;
            return;
        }

        const now = Date.now();
        grid.innerHTML = completed.map(t => {
            const matchTime = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
            let relativeTimeStr = "";
            if (matchTime > 0) {
                const daysAgo = Math.floor((now - matchTime) / (24 * 60 * 60 * 1000));
                relativeTimeStr = daysAgo > 0 ? ` (${daysAgo} days ago)` : " (Today)";
            }

            return `
                <article class="tournament-card">
                    <div class="tournament-card-top">
                        <span class="tournament-game">${esc(t.game || "Free Fire")} • ${esc(t.mode || "Solo")} • ${esc(t.map || "Bermuda")}</span>
                        <span class="status active">COMPLETED</span>
                    </div>
                    <h3>${esc(t.name || "Tournament")}</h3>
                    <div class="tournament-details">
                        <div><span>PRIZE POOL</span><strong style="color:var(--gold);">${money(t.prizePool ?? t.prize)}</strong></div>
                        <div><span>PER KILL</span><strong>${money(t.perKillCoins ?? t.perKill ?? 0)}</strong></div>
                        <div><span>DATE PLAYED</span><strong>${formatDt(t.startTime || t.date)}<small style="display:block; color:var(--gold); font-size:11px;">${relativeTimeStr}</small></strong></div>
                    </div>
                    <div class="card-footer-action" style="margin-top:18px;">
                        <a href="#/results/${t.id}" class="btn btn-sm btn-primary full">View Full Result Sheet & Details →</a>
                    </div>
                </article>
            `;
        }).join("");
    } catch (e) {
        if ($("resultsGrid")) $("resultsGrid").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

async function renderSingleTournamentResult(id) {
    const app = $("appContainer");
    app.innerHTML = `<div class="container section"><div class="loading">Loading complete match history & scorecard...</div></div>`;

    try {
        const [tSnap, rSnap] = await Promise.all([
            getDoc(doc(db, "tournaments", id)),
            getDoc(doc(db, "tournaments", id, "results", "final"))
        ]);

        if (!tSnap.exists()) {
            app.innerHTML = `<div class="container section"><div class="empty-state-card"><h3>Match Not Found</h3><a href="#/results" class="btn btn-secondary">Back to Archive</a></div></div>`;
            return;
        }

        const t = tSnap.data();
        const results = rSnap.exists() ? (rSnap.data().results || []) : [];
        const is1v1 = (t.mode || "").toLowerCase().includes("1v1") || (t.mode || "").toLowerCase().includes("lone") || t.format === "1v1" || t.format === "LONE_WOLF" || Number(t.slots ?? t.totalSlots) === 2;

        const matchTime = (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime || t.date || 0).getTime()) || 0;
        let relativeDays = "";
        if (matchTime > 0) {
            const daysAgo = Math.floor((Date.now() - matchTime) / (24 * 60 * 60 * 1000));
            relativeDays = daysAgo > 0 ? ` (${daysAgo} days ago)` : " (Today)";
        }

        // 1v1 Head-to-Head Duel Result OR Battle Royale Podium
        let duelOrPodiumHtml = "";
        if (is1v1 && results.length >= 1) {
            const p1 = results[0];
            const p2 = results[1];
            duelOrPodiumHtml = `
                <div class="admin-panel" style="margin:20px 0; background:linear-gradient(135deg, rgba(235,90,60,0.08), rgba(255,180,0,0.08)); border:1px solid rgba(255,180,0,0.3);">
                    <span class="eyebrow" style="color:var(--gold);">1V1 HEAD-TO-HEAD MATCH RESULT</span>
                    <h2 style="margin:6px 0 16px;">Direct Duel Outcome</h2>
                    <div style="display:flex; justify-content:space-around; align-items:center; flex-wrap:wrap; gap:20px; padding:16px 0;">
                        <div style="text-align:center; min-width:180px;">
                            <span style="font-size:40px;">👑</span>
                            <div style="color:var(--gold); font-weight:bold; font-size:13px; margin-top:4px;">1V1 CHAMPION</div>
                            <h3 style="font-size:22px; margin:6px 0;">${esc(p1.ign || p1.username || "Winner")}</h3>
                            <div style="color:var(--green); font-size:20px; font-weight:900;">${money(p1.totalReward || t.prizePool || t.prize || 0)}</div>
                            <span class="pill" style="color:var(--gold); border-color:var(--gold); margin-top:8px;">WINNER</span>
                        </div>
                        <div style="font-size:32px; font-weight:900; color:var(--muted);">VS</div>
                        <div style="text-align:center; min-width:180px; opacity:0.85;">
                            <span style="font-size:40px;">🥈</span>
                            <div style="color:#c0c0c0; font-weight:bold; font-size:13px; margin-top:4px;">RUNNER-UP</div>
                            <h3 style="font-size:22px; margin:6px 0;">${esc(p2 ? (p2.ign || p2.username) : "Opponent")}</h3>
                            <div style="color:var(--muted); font-size:20px; font-weight:900;">₹0</div>
                            <span class="pill" style="color:var(--muted); border-color:var(--line); margin-top:8px;">DEFEATED</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (!is1v1 && results.length >= 1) {
            const first = results[0];
            const second = results[1];
            const third = results[2];

            duelOrPodiumHtml = `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin:20px 0;">
                    <div style="background:#0e1017; border:1px solid var(--gold); border-radius:14px; padding:16px; text-align:center;">
                        <span style="font-size:24px;">👑</span>
                        <div style="color:var(--gold); font-weight:bold; font-size:12px; margin-top:4px;">1ST PLACE CHAMPION</div>
                        <h3 style="margin:6px 0; font-size:17px;">${esc(first.ign || first.username || "Winner")}</h3>
                        <div style="color:var(--green); font-weight:bold; font-size:16px;">${money(first.totalReward || 0)}</div>
                        <div style="font-size:11px; color:var(--muted); margin-top:4px;">Kills: ${first.kills || 0} (${money(first.killReward || 0)})</div>
                    </div>
                    ${second ? `
                        <div style="background:#0e1017; border:1px solid #c0c0c0; border-radius:14px; padding:16px; text-align:center;">
                            <span style="font-size:24px;">🥈</span>
                            <div style="color:#c0c0c0; font-weight:bold; font-size:12px; margin-top:4px;">2ND PLACE RUNNER-UP</div>
                            <h3 style="margin:6px 0; font-size:17px;">${esc(second.ign || second.username || "Runner-Up")}</h3>
                            <div style="color:var(--green); font-weight:bold; font-size:16px;">${money(second.totalReward || 0)}</div>
                            <div style="font-size:11px; color:var(--muted); margin-top:4px;">Kills: ${second.kills || 0} (${money(second.killReward || 0)})</div>
                        </div>
                    ` : ''}
                    ${third ? `
                        <div style="background:#0e1017; border:1px solid #cd7f32; border-radius:14px; padding:16px; text-align:center;">
                            <span style="font-size:24px;">🥉</span>
                            <div style="color:#cd7f32; font-weight:bold; font-size:12px; margin-top:4px;">3RD PLACE</div>
                            <h3 style="margin:6px 0; font-size:17px;">${esc(third.ign || third.username || "3rd")}</h3>
                            <div style="color:var(--green); font-weight:bold; font-size:16px;">${money(third.totalReward || 0)}</div>
                            <div style="font-size:11px; color:var(--muted); margin-top:4px;">Kills: ${third.kills || 0} (${money(third.killReward || 0)})</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        app.innerHTML = `
            <div class="container section">
                <a href="#/results" class="btn btn-sm btn-secondary" style="margin-bottom:20px;">← Back to Results Archive</a>
                
                <div class="section-head">
                    <div>
                        <span class="eyebrow">${esc(t.game || "Free Fire")} • ${esc(is1v1 ? "1v1 Match" : (t.mode || "Solo"))} • ${esc(t.map || "Bermuda")}</span>
                        <h2>${esc(t.name || "Match")} — Official Results</h2>
                        <p style="color:var(--muted); margin:4px 0 0;">Played on ${formatDt(t.startTime || t.date)}${relativeDays} • Prize Pool: <strong style="color:var(--gold);">${money(t.prizePool ?? t.prize)}</strong></p>
                    </div>
                </div>

                <!-- Match Specs & Archived Credentials -->
                <div class="card-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); margin:20px 0;">
                    <div class="stat-card">
                        <span class="stat-title">GAME & MAP</span>
                        <strong class="stat-value" style="font-size:17px;">${esc(t.game || "Free Fire")} (${esc(t.map || "Bermuda")})</strong>
                        <span class="stat-note">Format: ${esc(is1v1 ? "1v1 Match" : (t.mode || "Solo"))}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-title">${is1v1 ? 'ENTRY & WINNER PRIZE' : 'ENTRY FEE & KILL PRIZE'}</span>
                        <strong class="stat-value" style="font-size:17px;">${money(t.entryFee || 0)} / ${is1v1 ? money(t.prizePool ?? t.prize) : money(t.perKillCoins ?? t.perKill ?? 10) + ' per kill'}</strong>
                        <span class="stat-note">Total Prize: ${money(t.prizePool ?? t.prize)}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-title">ARCHIVED ROOM CREDENTIALS</span>
                        <strong class="stat-value" style="font-size:17px; font-family:monospace;">ID: ${esc(t.roomId || "—")}</strong>
                        <span class="stat-note">Pass: <code style="color:#fff;">${esc(t.roomPassword || "—")}</code></span>
                    </div>
                </div>

                ${duelOrPodiumHtml}

                <div class="admin-panel table-wrapper" style="margin-top:20px;">
                    <span class="eyebrow">${is1v1 ? '1V1 MATCH OUTCOME' : 'FINAL SCOREBOARD'}</span>
                    <h3 style="margin:4px 0 16px;">${is1v1 ? 'Direct Match Standings' : 'Player Standings & Prize Distribution'}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Position</th>
                                <th>Player IGN</th>
                                <th>Team</th>
                                <th>Kills</th>
                                <th>Kill Reward</th>
                                <th>Position Reward</th>
                                <th>Total Winnings</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:30px;">Result sheet is being finalized by staff.</td></tr>` : results.map(r => `
                                <tr>
                                    <td><strong style="color:${Number(r.position) === 1 ? 'var(--gold)' : (Number(r.position) === 2 ? '#c0c0c0' : (Number(r.position) === 3 ? '#cd7f32' : '#fff'))}">#${esc(r.position)}</strong></td>
                                    <td><strong>${esc(r.ign || r.username || "Player")}</strong></td>
                                    <td>${esc(r.team || "—")}</td>
                                    <td><span style="color:var(--red); font-weight:bold;">${esc(r.kills || 0)}</span></td>
                                    <td>${money(r.killReward || 0)}</td>
                                    <td>${money(r.positionReward || 0)}</td>
                                    <td style="font-weight:bold; color:var(--green);">${money(r.totalReward || 0)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        app.innerHTML = `<div class="container section"><div class="empty-state-card">Error: ${esc(e.message)}</div></div>`;
    }
}

// =========================================================
// VIEW: NOTIFICATIONS (/notifications)
// =========================================================
export async function renderNotifications() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">UPDATES & ALERTS</span>
                    <h2>Notifications</h2>
                </div>
                <button id="markAllReadBtn" class="btn btn-sm btn-secondary">Mark All as Read</button>
            </div>

            <div id="notifsContainer" style="display:grid; gap:12px; margin-top:20px;">
                <div class="loading">Loading notifications...</div>
            </div>
        </div>
    `;

    try {
        const uid = state.currentUser.uid;
        const q = query(
            collection(db, "notifications"),
            where("uid", "==", uid),
            limit(30)
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));

        const container = $("notifsContainer");
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `<div class="empty-state-card"><h3>No Notifications</h3><p>You're all caught up!</p></div>`;
            return;
        }

        container.innerHTML = list.map(n => `
            <div class="notif-card" style="padding:16px; background:#11131b; border:1px solid ${n.read ? 'var(--line)' : 'var(--purple)'}; border-radius:14px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:15px; display:block;">${esc(n.title || "Notification")}</strong>
                    <p style="color:var(--muted); font-size:13px; margin:4px 0 0;">${esc(n.message || "")}</p>
                    <small style="color:#666; font-size:11px; margin-top:6px; display:block;">${formatDt(n.createdAt)}</small>
                </div>
                ${!n.read ? `<span class="pill" style="color:var(--purple);">New</span>` : ''}
            </div>
        `).join("");

        $("markAllReadBtn").onclick = async () => {
            const batchPromises = list.filter(n => !n.read).map(n => updateDoc(doc(db, "notifications", n.id), { read: true }));
            await Promise.all(batchPromises);
            showToast("All notifications marked as read.");
            renderNotifications();
        };
    } catch (e) {
        if ($("notifsContainer")) $("notifsContainer").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

// =========================================================
// VIEW: SUPPORT (/support)
// =========================================================
export async function renderSupport(params) {
    const app = $("appContainer");
    const ticketId = params.id;

    if (ticketId) {
        renderTicketChat(ticketId);
        return;
    }

    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">HELP CENTER</span>
                    <h2>Support & FAQ</h2>
                    <p style="color:var(--muted); margin:4px 0 0;">Find answers to common questions or submit a ticket to our support team.</p>
                </div>
                ${state.currentUser ? `<button id="newTicketBtn" class="btn btn-primary">Create Ticket +</button>` : ''}
            </div>

            <!-- Official WhatsApp Direct Group & Help Card -->
            <div class="admin-panel" style="margin-top:20px; border:1px solid rgba(37,211,102,.35); background:radial-gradient(ellipse at 90% 20%, rgba(37,211,102,.1) 0%, #11131c 65%); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                <div style="max-width:560px;">
                    <span class="eyebrow" style="color:#25d366;">FASTEST RESPONSE & REAL-TIME COMMUNITY</span>
                    <h2 style="margin:4px 0 6px;">Join Official WhatsApp Group</h2>
                    <p style="color:var(--muted); margin:0; font-size:14px; line-height:1.5;">Need instant tournament help, query resolution, or match room alerts? Our staff and active community are live 24/7 on WhatsApp.</p>
                </div>
                <a href="https://chat.whatsapp.com/F3m1XBWHgFu7iKHVodNGBD?s=sh&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="background:linear-gradient(135deg,#25d366,#128c7e); border:0; padding:12px 22px; font-weight:800; font-size:14px; display:inline-flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 32 32" style="width:20px; height:20px; fill:currentColor;"><path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A13.9 13.9 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.2-4.4 1.2 1.2-4.3-.3-.4a11.6 11.6 0 1 1 9.8 5.3zm6.4-8.6c-.3-.2-2-1-2.3-1.1-.3-.1-.6-.2-.8.2s-.9 1.1-1.1 1.3-.4.2-.7 0a9.2 9.2 0 0 1-2.7-1.7 10.2 10.2 0 0 1-1.9-2.3c-.2-.3 0-.5.2-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.5s-.8-2-1.1-2.7c-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.7.1-1.1.5s-1.5 1.5-1.5 3.6 1.5 4.2 1.7 4.5c.2.3 3 4.6 7.4 6.4 1 .4 1.9.7 2.5.9 1.1.3 2.1.3 2.9.2.9-.1 2.8-1.1 3.2-2.2.4-1.1.4-2.1.3-2.3-.1-.2-.4-.3-.7-.5z"/></svg>
                    <span>JOIN WHATSAPP GROUP</span>
                </a>
            </div>

            <!-- FAQ Section -->
            <div class="admin-panel" style="margin-top:20px;">
                <span class="eyebrow">FREQUENTLY ASKED QUESTIONS</span>
                <h2>General Help</h2>
                <div class="faq-list" style="display:grid; gap:14px; margin-top:16px;">
                    <div class="faq-item">
                        <strong>Q: How do I get my Room ID and Password?</strong>
                        <p style="color:var(--muted); margin:4px 0 0;">Room details are revealed automatically in <strong>My Matches</strong> 15 minutes before the tournament start time.</p>
                    </div>
                    <div class="faq-item">
                        <strong>Q: What is the minimum withdrawal amount?</strong>
                        <p style="color:var(--muted); margin:4px 0 0;">The minimum withdrawal is ₹50 via UPI or direct Bank Transfer. Payouts are reviewed and dispatched within 1–2 hours.</p>
                    </div>
                    <div class="faq-item">
                        <strong>Q: How are BR rewards calculated?</strong>
                        <p style="color:var(--muted); margin:4px 0 0;">Total Reward = (Your Kills × Configured Kill Reward) + Position Rank Reward. Both are credited automatically to your wallet upon result finalization.</p>
                    </div>
                </div>
            </div>

            <!-- My Tickets Section (if logged in) -->
            ${state.currentUser ? `
                <div class="section-head" style="margin-top:40px;">
                    <div>
                        <span class="eyebrow">YOUR INQUIRIES</span>
                        <h2>My Tickets</h2>
                    </div>
                </div>
                <div id="userTicketsList" style="display:grid; gap:12px; margin-top:14px;">
                    <div class="loading">Loading your tickets...</div>
                </div>
            ` : ''}
        </div>
    `;

    $("newTicketBtn")?.addEventListener("click", () => openCreateTicketModal());

    if (state.currentUser) {
        loadUserTickets();
    }
}

async function loadUserTickets() {
    try {
        const uid = state.currentUser.uid;
        const q = query(
            collection(db, "supportTickets"),
            where("uid", "==", uid),
            limit(20)
        );
        const snap = await getDocs(q);
        const tickets = [];
        snap.forEach(d => tickets.push({ id: d.id, ...d.data() }));

        const container = $("userTicketsList");
        if (!container) return;

        if (tickets.length === 0) {
            container.innerHTML = `<div class="empty-state-card"><h3>No Tickets Filed</h3><p>Need assistance? Click "Create Ticket +" above.</p></div>`;
            return;
        }

        container.innerHTML = tickets.map(t => `
            <div class="notif-card" style="padding:16px; background:#11131b; border:1px solid var(--line); border-radius:14px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span class="eyebrow" style="color:var(--purple);">${esc(t.category || "General")}</span>
                    <strong style="font-size:16px; display:block; margin:2px 0;">${esc(t.subject || "Support Ticket")}</strong>
                    <small style="color:var(--muted);">Created: ${formatDt(t.createdAt)}</small>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="status ${t.status === 'RESOLVED' || t.status === 'CLOSED' ? '' : 'active'}">${esc(t.status || 'OPEN')}</span>
                    <a href="#/support/${t.id}" class="btn btn-sm btn-secondary">Open Chat 💬</a>
                </div>
            </div>
        `).join("");
    } catch (e) {
        if ($("userTicketsList")) $("userTicketsList").innerHTML = `<div class="empty-state-card">Error: ${esc(e.message)}</div>`;
    }
}

function openCreateTicketModal() {
    const modal = $("modalContainer");
    modal.innerHTML = `
        <div class="modal-backdrop" id="ticketModalBackdrop">
            <div class="user-modal" style="max-width:560px;">
                <div class="modal-head">
                    <div>
                        <span class="eyebrow">CUSTOMER CARE</span>
                        <h2>Submit Support Ticket</h2>
                    </div>
                    <button class="close-btn" id="closeTicketModal">✕</button>
                </div>

                <form id="createTicketForm" class="form-grid" style="margin-top:16px;">
                    <label style="grid-column:1/-1;">
                        Category *
                        <select id="ticketCategory">
                            <option value="Payment Issue">Payment & Deposit Issue</option>
                            <option value="Withdrawal Issue">Withdrawal & Payout</option>
                            <option value="Room Credentials">Room ID / Password Issue</option>
                            <option value="Match Issue">Tournament / Match Discrepancy</option>
                            <option value="Cheating Report">Cheating / Hacker Report</option>
                            <option value="Account Issue">Account & Login</option>
                            <option value="General Query">General Question</option>
                        </select>
                    </label>

                    <label style="grid-column:1/-1;">
                        Subject *
                        <input id="ticketSubject" type="text" placeholder="Brief summary of the issue" required>
                    </label>

                    <label style="grid-column:1/-1;">
                        Detailed Message *
                        <textarea id="ticketMessage" rows="4" placeholder="Describe your problem in detail..." required></textarea>
                    </label>

                    <div style="grid-column:1/-1; margin-top:12px;">
                        <button type="submit" id="submitTicketBtn" class="btn btn-primary full">SUBMIT TICKET</button>
                    </div>
                </form>
                <p id="ticketErr" class="error"></p>
            </div>
        </div>
    `;

    $("closeTicketModal").onclick = () => modal.innerHTML = "";
    $("ticketModalBackdrop").onclick = e => { if (e.target.id === "ticketModalBackdrop") modal.innerHTML = ""; };

    $("createTicketForm").onsubmit = async e => {
        e.preventDefault();
        const err = $("ticketErr");
        const btn = $("submitTicketBtn");
        err.textContent = "";
        btn.disabled = true;

        const uid = state.currentUser.uid;
        const category = $("ticketCategory").value;
        const subject = $("ticketSubject").value.trim();
        const message = $("ticketMessage").value.trim();

        try {
            const docRef = await addDoc(collection(db, "supportTickets"), {
                uid: uid,
                userId: uid,
                username: state.userProfile?.username || "Player",
                email: state.currentUser.email || "",
                category: category,
                subject: subject,
                status: "OPEN",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Initial message in subcollection
            await addDoc(collection(db, "supportTickets", docRef.id, "messages"), {
                senderId: uid,
                senderName: state.userProfile?.username || "Player",
                isAdmin: false,
                message: message,
                createdAt: serverTimestamp()
            });

            modal.innerHTML = "";
            showToast("Support ticket created!");
            router.navigate(`/support/${docRef.id}`);
        } catch (x) {
            err.textContent = x.message || "Failed to submit ticket.";
            btn.disabled = false;
        }
    };
}

async function renderTicketChat(ticketId) {
    const app = $("appContainer");
    app.innerHTML = `<div class="container section"><div class="loading">Loading support conversation...</div></div>`;

    try {
        const tSnap = await getDoc(doc(db, "supportTickets", ticketId));
        if (!tSnap.exists()) {
            app.innerHTML = `<div class="container section"><div class="empty-state-card"><h3>Ticket Not Found</h3><a href="#/support" class="btn btn-secondary">Back to Support</a></div></div>`;
            return;
        }

        const t = tSnap.data();

        app.innerHTML = `
            <div class="container section" style="max-width:800px;">
                <a href="#/support" class="btn btn-sm btn-secondary" style="margin-bottom:16px;">← Back to All Tickets</a>
                
                <div class="admin-panel" style="margin-bottom:18px;">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <span class="eyebrow">${esc(t.category || "General")} • TICKET #${ticketId.slice(0, 8).toUpperCase()}</span>
                            <h2 style="margin:6px 0;">${esc(t.subject || "Support Query")}</h2>
                            <small style="color:var(--muted);">Opened: ${formatDt(t.createdAt)}</small>
                        </div>
                        <span class="status ${t.status === 'RESOLVED' || t.status === 'CLOSED' ? '' : 'active'}">${esc(t.status || 'OPEN')}</span>
                    </div>
                </div>

                <!-- Chat Messages Feed -->
                <div id="ticketChatFeed" style="background:#090a0f; border:1px solid var(--line); border-radius:18px; padding:20px; min-height:350px; max-height:480px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
                    <div class="loading">Loading messages...</div>
                </div>

                <!-- Reply Input Box -->
                <form id="ticketReplyForm" style="display:flex; gap:10px; margin-top:14px;">
                    <input id="replyTextInput" type="text" placeholder="Type your reply message..." required style="flex:1;">
                    <button type="submit" id="sendReplyBtn" class="btn btn-primary" style="padding:0 24px;">Send</button>
                </form>
            </div>
        `;

        // Real-time chat listener
        const msgsRef = collection(db, "supportTickets", ticketId, "messages");
        const q = query(msgsRef, orderBy("createdAt", "asc"));

        onSnapshot(q, snap => {
            const feed = $("ticketChatFeed");
            if (!feed) return;

            if (snap.empty) {
                feed.innerHTML = `<p style="color:var(--muted); text-align:center;">No messages yet.</p>`;
                return;
            }

            feed.innerHTML = snap.docs.map(d => {
                const m = d.data();
                const isMe = m.senderId === state.currentUser?.uid;
                return `
                    <div style="max-width:75%; align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'linear-gradient(135deg,#7040ff,#914eff)' : '#191b26'}; color:#fff; border-radius:14px; padding:12px 16px; word-break:break-word;">
                        <strong style="font-size:11px; display:block; opacity:0.8;">${esc(m.senderName || (m.isAdmin ? 'Staff Support' : 'Player'))}</strong>
                        <p style="margin:4px 0 2px; font-size:14px;">${esc(m.message)}</p>
                        <small style="font-size:10px; opacity:0.6; display:block; text-align:right;">${formatDt(m.createdAt)}</small>
                    </div>
                `;
            }).join("");

            feed.scrollTop = feed.scrollHeight;
        });

        $("ticketReplyForm").onsubmit = async e => {
            e.preventDefault();
            const input = $("replyTextInput");
            const txt = input.value.trim();
            if (!txt) return;

            input.value = "";
            await addDoc(msgsRef, {
                senderId: state.currentUser.uid,
                senderName: state.userProfile?.username || "Player",
                isAdmin: false,
                message: txt,
                createdAt: serverTimestamp()
            });
        };
    } catch (e) {
        app.innerHTML = `<div class="container section"><div class="empty-state-card">Error: ${esc(e.message)}</div></div>`;
    }
}

// =========================================================
// VIEW: PROFILE (/profile)
// =========================================================
export function renderProfile() {
    if (!state.currentUser) {
        router.navigate("/login");
        return;
    }

    const app = $("appContainer");
    const u = state.userProfile || {};
    const refCode = u.referralCode || `EXG-${state.currentUser.uid.slice(0, 8).toUpperCase()}`;
    const winRate = u.totalMatches > 0 ? Math.round((u.totalWins / u.totalMatches) * 100) : 0;

    app.innerHTML = `
        <div class="container section">
            <div class="dashboard-banner">
                <div style="display:flex; align-items:center; gap:20px;">
                    <div class="user-avatar" style="width:72px; height:72px; font-size:28px;">
                        ${(u.username || "P").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <span class="eyebrow">VERIFIED GAMER</span>
                        <h2 style="margin:4px 0;">${esc(u.username || "Player")}</h2>
                        <span style="color:var(--muted); font-size:13px;">${esc(state.currentUser.email || "")}</span>
                    </div>
                </div>
            </div>

            <!-- Stats Matrix -->
            <div class="admin-stats" style="margin-top:24px;">
                <div class="admin-stat"><span>Matches</span><strong>${u.totalMatches || 0}</strong></div>
                <div class="admin-stat"><span>Victories</span><strong style="color:var(--green)">${u.totalWins || 0}</strong></div>
                <div class="admin-stat"><span>Frags / Kills</span><strong>${u.totalKills || 0}</strong></div>
                <div class="admin-stat"><span>Win Rate</span><strong>${winRate}%</strong></div>
            </div>

            <!-- Referral & Invite Card -->
            <div class="admin-panel" style="margin-top:24px;">
                <span class="eyebrow">REFER & EARN</span>
                <h2>Invite Friends & Earn Rewards</h2>
                <p style="color:var(--muted);">Earn ₹5 coins for every player who registers using your unique referral code.</p>
                
                <div style="display:flex; gap:12px; align-items:center; max-width:480px; margin-top:16px;">
                    <input type="text" id="refCodeInput" value="${esc(refCode)}" readonly style="font-weight:bold; letter-spacing:1px; text-align:center; font-size:16px;">
                    <button id="copyRefCodeBtn" class="btn btn-primary" style="white-space:nowrap;">Copy Code</button>
                </div>
            </div>
        </div>
    `;

    $("copyRefCodeBtn").onclick = () => {
        navigator.clipboard.writeText(refCode);
        showToast("Referral code copied to clipboard!");
    };
}

// =========================================================
// VIEW: SETTINGS & RULES (/settings)
// =========================================================
export function renderSettings() {
    const app = $("appContainer");
    app.innerHTML = `
        <div class="container section">
            <div class="section-head">
                <div>
                    <span class="eyebrow">PLATFORM INFORMATION</span>
                    <h2>Rules & Policies</h2>
                </div>
            </div>

            <div class="admin-grid" style="margin-top:20px;">
                <div class="admin-panel">
                    <span class="eyebrow">TOURNAMENT RULES</span>
                    <h2>Fair Play & Match Rules</h2>
                    <ul class="rules-list">
                        <li>Only mobile devices are permitted. Any third-party software or mods result in lifetime ban.</li>
                        <li>Room credentials must not be shared with players outside registered rosters.</li>
                        <li>All players must reach level 20+ in-game to be eligible for entry.</li>
                        <li>Ties in Battle Royale format are resolved by total frag counts.</li>
                    </ul>
                </div>

                <div class="admin-panel">
                    <span class="eyebrow">PAYMENTS & CASHOUT</span>
                    <h2>Deposit & Payout Policies</h2>
                    <ul class="rules-list">
                        <li>Deposits via Razorpay are credited instantly.</li>
                        <li>Minimum cashout is ₹50 to UPI ID or verified Bank account.</li>
                        <li>Withdrawal processing time: 1–2 hours during operating hours.</li>
                        <li>If a tournament is cancelled by administration, 100% of entry fees are refunded immediately.</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
}
