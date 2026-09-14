from pathlib import Path
import os
import re
import shutil
from datetime import datetime

PROJECT = Path(os.environ.get(
    "ELITEXGAMERS_WEB",
    r"C:\\Users\\thead\\AndroidStudioProjects\\EliteXGamers\\EliteXGamers-Web-FINAL-SUPABASE-SETTINGS\\web\\EliteXGamers-Web"
))

if not PROJECT.exists():
    raise SystemExit(
        f"Web project not found:\\n{PROJECT}\\n\\n"
        "Set ELITEXGAMERS_WEB to your actual EliteXGamers-Web folder."
    )

ADMIN_HTML = PROJECT / "admin.html"
USERS_JS = PROJECT / "js" / "admin-users.js"

if not ADMIN_HTML.exists():
    raise SystemExit(f"admin.html not found: {ADMIN_HTML}")

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = PROJECT / ".backup_users_management"
backup.mkdir(exist_ok=True)
shutil.copy2(ADMIN_HTML, backup / f"admin.html.{stamp}.bak")

users_section = r'''
        <!-- USERS / PLAYER MANAGEMENT -->
        <section id="section-users" class="admin-section hidden">
            <div class="section-toolbar">
                <div>
                    <span class="eyebrow">PLAYERS</span>
                    <h2>Users</h2>
                    <p>Manage player accounts, wallets and activity.</p>
                </div>
                <div class="user-tools">
                    <input type="search" id="userSearch"
                           placeholder="Search UID, email or username..."
                           class="search-input">
                    <button id="refreshUsersButton" class="btn btn-secondary">
                        Refresh
                    </button>
                </div>
            </div>

            <div class="admin-stats">
                <div class="admin-stat">
                    <span>Total Users</span>
                    <strong id="usersTotalCount">—</strong>
                    <small>Firestore</small>
                </div>
                <div class="admin-stat">
                    <span>Active Users</span>
                    <strong id="usersActiveCount">—</strong>
                    <small>Firestore</small>
                </div>
                <div class="admin-stat">
                    <span>Total Wallet Balance</span>
                    <strong id="usersWalletTotal">₹0</strong>
                    <small>Wallets</small>
                </div>
            </div>

            <div class="admin-panel table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Wallet</th>
                            <th>Deposited</th>
                            <th>Withdrawn</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersTable">
                        <tr><td colspan="7">Loading users...</td></tr>
                    </tbody>
                </table>
            </div>

            <div id="userDetailsPanel" class="admin-panel hidden" style="margin-top:18px;">
                <div class="panel-header">
                    <div>
                        <span class="eyebrow">PLAYER PROFILE</span>
                        <h2 id="selectedUserName">User</h2>
                        <p id="selectedUserUid"></p>
                    </div>
                    <button id="closeUserDetails" class="btn btn-secondary">Close</button>
                </div>

                <div class="admin-stats">
                    <div class="admin-stat"><span>Balance</span><strong id="detailBalance">₹0</strong></div>
                    <div class="admin-stat"><span>Locked</span><strong id="detailLocked">₹0</strong></div>
                    <div class="admin-stat"><span>Total Deposited</span><strong id="detailDeposited">₹0</strong></div>
                    <div class="admin-stat"><span>Total Withdrawn</span><strong id="detailWithdrawn">₹0</strong></div>
                </div>

                <div class="admin-grid">
                    <div class="admin-panel">
                        <div class="panel-header">
                            <div>
                                <span class="eyebrow">WALLET CONTROL</span>
                                <h3>Manual Balance Adjustment</h3>
                            </div>
                        </div>

                        <div class="form-grid">
                            <label>
                                Amount
                                <input id="manualWalletAmount" type="number" min="1" step="1"
                                       placeholder="Enter amount">
                            </label>

                            <label>
                                Type
                                <select id="manualWalletType">
                                    <option value="CREDIT">Credit</option>
                                    <option value="DEBIT">Debit</option>
                                </select>
                            </label>

                            <label class="full-field">
                                Reason
                                <input id="manualWalletReason" type="text" maxlength="120"
                                       placeholder="Reason for adjustment">
                            </label>
                        </div>

                        <button id="manualWalletButton" class="btn btn-primary">
                            Apply Wallet Change
                        </button>
                    </div>

                    <div class="admin-panel">
                        <div class="panel-header">
                            <div>
                                <span class="eyebrow">ACCOUNT</span>
                                <h3>Account Status</h3>
                            </div>
                        </div>

                        <p id="detailStatusText">Status: —</p>
                        <button id="toggleUserStatusButton" class="btn btn-secondary">
                            Change Status
                        </button>
                    </div>
                </div>

                <div class="admin-panel" style="margin-top:18px;">
                    <div class="panel-header">
                        <div>
                            <span class="eyebrow">FINANCE</span>
                            <h3>Transaction History</h3>
                        </div>
                    </div>

                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Reference</th>
                                    <th>Description</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody id="userTransactionsTable">
                                <tr><td colspan="6">Select a user.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="admin-panel" style="margin-top:18px;">
                    <div class="panel-header">
                        <div>
                            <span class="eyebrow">REQUESTS</span>
                            <h3>Deposit & Withdrawal Requests</h3>
                        </div>
                    </div>

                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Kind</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Transaction ID</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody id="userRequestsTable">
                                <tr><td colspan="5">Select a user.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
'''

admin_js = r'''
import { db, auth } from "./firebase.js";

import {
    collection,
    doc,
    getDocs,
    query,
    where,
    limit,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const usersTable = document.getElementById("usersTable");
const userSearch = document.getElementById("userSearch");
const refreshUsersButton = document.getElementById("refreshUsersButton");
const userDetailsPanel = document.getElementById("userDetailsPanel");
const closeUserDetails = document.getElementById("closeUserDetails");

let allUsers = [];
let selectedUser = null;

const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function timestampValue(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const n = Number(value);
        if (!Number.isNaN(n)) return n;
        const d = Date.parse(value);
        return Number.isNaN(d) ? 0 : d;
    }
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return Number(value.seconds) * 1000;
    return 0;
}

function formatDate(value) {
    const n = timestampValue(value);
    return n ? new Date(n).toLocaleString("en-IN") : "—";
}

function notify(message, type = "success") {
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

async function loadUsers() {
    if (!usersTable) return;

    usersTable.innerHTML = `<tr><td colspan="7">Loading users...</td></tr>`;

    try {
        const [userSnap, walletSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "wallets"))
        ]);

        const wallets = new Map();
        walletSnap.forEach(item => wallets.set(item.id, item.data()));

        allUsers = userSnap.docs.map(item => {
            const data = item.data();
            const wallet = wallets.get(item.id) || {};

            return {
                id: item.id,
                ...data,
                walletBalance: Number(data.walletBalance ?? wallet.balance ?? 0),
                lockedBalance: Number(wallet.lockedBalance ?? 0),
                totalDeposited: Number(wallet.totalDeposited ?? 0),
                totalWithdrawn: Number(wallet.totalWithdrawn ?? 0)
            };
        });

        allUsers.sort((a, b) =>
            String(a.username || a.email || a.id)
                .localeCompare(String(b.username || b.email || b.id))
        );

        renderUsers(allUsers);

        document.getElementById("usersTotalCount").textContent = allUsers.length;
        document.getElementById("usersActiveCount").textContent =
            allUsers.filter(u => u.active !== false).length;
        document.getElementById("usersWalletTotal").textContent = money(
            allUsers.reduce((sum, u) => sum + Number(u.walletBalance || 0), 0)
        );
    } catch (error) {
        console.error("loadUsers:", error);
        usersTable.innerHTML =
            `<tr><td colspan="7">Unable to load users: ${esc(error.message)}</td></tr>`;
        notify(error.message || "Unable to load users.", "error");
    }
}

function renderUsers(users) {
    if (!users.length) {
        usersTable.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
        return;
    }

    usersTable.innerHTML = users.map(user => {
        const active = user.active !== false;
        const label = user.username || user.displayName || "Player";

        return `
            <tr>
                <td>
                    <strong>${esc(label)}</strong>
                    <small style="display:block;">${esc(user.id)}</small>
                </td>
                <td>${esc(user.email || "—")}</td>
                <td>${money(user.walletBalance)}</td>
                <td>${money(user.totalDeposited)}</td>
                <td>${money(user.totalWithdrawn)}</td>
                <td>
                    <span class="status ${active ? "active" : ""}">
                        ${active ? "Active" : "Blocked"}
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary user-view-btn"
                            data-user-id="${esc(user.id)}">
                        Manage
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    usersTable.querySelectorAll(".user-view-btn").forEach(button => {
        button.addEventListener("click", () => openUser(button.dataset.userId));
    });
}

function filterUsers() {
    const term = String(userSearch?.value || "").trim().toLowerCase();

    if (!term) {
        renderUsers(allUsers);
        return;
    }

    renderUsers(allUsers.filter(user =>
        [user.id, user.email, user.username, user.displayName, user.playerId]
            .some(value => String(value || "").toLowerCase().includes(term))
    ));
}

async function openUser(uid) {
    const user = allUsers.find(item => item.id === uid);

    if (!user) {
        notify("User not found.", "error");
        return;
    }

    selectedUser = user;

    document.getElementById("selectedUserName").textContent =
        user.username || user.displayName || user.email || "Player";
    document.getElementById("selectedUserUid").textContent = uid;

    document.getElementById("detailBalance").textContent = money(user.walletBalance);
    document.getElementById("detailLocked").textContent = money(user.lockedBalance);
    document.getElementById("detailDeposited").textContent = money(user.totalDeposited);
    document.getElementById("detailWithdrawn").textContent = money(user.totalWithdrawn);

    const active = user.active !== false;
    document.getElementById("detailStatusText").textContent =
        `Status: ${active ? "Active" : "Blocked"}`;
    document.getElementById("toggleUserStatusButton").textContent =
        active ? "Block User" : "Unblock User";

    userDetailsPanel.classList.remove("hidden");

    await Promise.all([
        loadUserTransactions(uid),
        loadUserRequests(uid)
    ]);

    userDetailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadUserTransactions(uid) {
    const target = document.getElementById("userTransactionsTable");

    try {
        const snap = await getDocs(
            query(
                collection(db, "transactions"),
                where("userId", "==", uid),
                limit(100)
            )
        );

        const rows = snap.docs.map(item => ({ id: item.id, ...item.data() }));
        rows.sort((a, b) =>
            timestampValue(b.createdAt) - timestampValue(a.createdAt)
        );

        if (!rows.length) {
            target.innerHTML = `<tr><td colspan="6">No transactions.</td></tr>`;
            return;
        }

        target.innerHTML = rows.map(row => `
            <tr>
                <td>${esc(row.type || "—")}</td>
                <td>${money(row.amount)}</td>
                <td>${esc(row.status || "—")}</td>
                <td>${esc(row.referenceId || row.id)}</td>
                <td>${esc(row.description || "—")}</td>
                <td>${esc(formatDate(row.createdAt))}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("loadUserTransactions:", error);
        target.innerHTML =
            `<tr><td colspan="6">Unable to load transactions.</td></tr>`;
    }
}

async function loadUserRequests(uid) {
    const target = document.getElementById("userRequestsTable");

    try {
        const [deposits, withdrawals] = await Promise.all([
            getDocs(
                query(
                    collection(db, "depositRequests"),
                    where("userId", "==", uid),
                    limit(100)
                )
            ),
            getDocs(
                query(
                    collection(db, "withdrawalRequests"),
                    where("userId", "==", uid),
                    limit(100)
                )
            )
        ]);

        const rows = [];

        deposits.forEach(item =>
            rows.push({ id: item.id, kind: "Deposit", ...item.data() })
        );

        withdrawals.forEach(item =>
            rows.push({ id: item.id, kind: "Withdrawal", ...item.data() })
        );

        rows.sort((a, b) =>
            timestampValue(b.createdAt) - timestampValue(a.createdAt)
        );

        if (!rows.length) {
            target.innerHTML =
                `<tr><td colspan="5">No deposit or withdrawal requests.</td></tr>`;
            return;
        }

        target.innerHTML = rows.map(row => `
            <tr>
                <td>${esc(row.kind)}</td>
                <td>${money(row.amount)}</td>
                <td>${esc(row.status || "—")}</td>
                <td>${esc(
                    row.transactionId ||
                    row.txnId ||
                    row.referenceId ||
                    "—"
                )}</td>
                <td>${esc(formatDate(row.createdAt))}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("loadUserRequests:", error);
        target.innerHTML =
            `<tr><td colspan="5">Unable to load requests.</td></tr>`;
    }
}

async function manualWalletChange() {
    if (!selectedUser) {
        notify("Select a user first.", "error");
        return;
    }

    const amount = Number(
        document.getElementById("manualWalletAmount").value
    );
    const type = document.getElementById("manualWalletType").value;
    const reason = String(
        document.getElementById("manualWalletReason").value || ""
    ).trim();

    if (!Number.isFinite(amount) || amount <= 0) {
        notify("Enter a valid amount.", "error");
        return;
    }

    if (!reason) {
        notify("Enter a reason.", "error");
        return;
    }

    const uid = selectedUser.id;

    try {
        await runTransaction(db, async transaction => {
            const walletRef = doc(db, "wallets", uid);
            const userRef = doc(db, "users", uid);

            const walletSnap = await transaction.get(walletRef);
            const userSnap = await transaction.get(userRef);

            const wallet = walletSnap.exists() ? walletSnap.data() : {};
            const user = userSnap.exists() ? userSnap.data() : {};

            const currentBalance = Number(
                wallet.balance ?? user.walletBalance ?? 0
            );

            const currentDeposited = Number(wallet.totalDeposited ?? 0);
            const currentWithdrawn = Number(wallet.totalWithdrawn ?? 0);

            let newBalance;

            if (type === "DEBIT") {
                if (currentBalance < amount) {
                    throw new Error("Insufficient wallet balance.");
                }
                newBalance = currentBalance - amount;
            } else {
                newBalance = currentBalance + amount;
            }

            transaction.set(walletRef, {
                id: uid,
                userId: uid,
                balance: newBalance,
                lockedBalance: Number(wallet.lockedBalance ?? 0),
                totalDeposited:
                    type === "CREDIT"
                        ? currentDeposited + amount
                        : currentDeposited,
                totalWithdrawn:
                    type === "DEBIT"
                        ? currentWithdrawn + amount
                        : currentWithdrawn,
                currency: wallet.currency || "INR",
                isActive: wallet.isActive !== false,
                updatedAt: serverTimestamp()
            }, { merge: true });

            transaction.set(userRef, {
                walletBalance: newBalance,
                updatedAt: serverTimestamp()
            }, { merge: true });

            const txRef = doc(collection(db, "transactions"));

            transaction.set(txRef, {
                userId: uid,
                type: type === "CREDIT" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
                amount,
                status: "SUCCESS",
                referenceId: txRef.id,
                description: `Admin wallet ${type.toLowerCase()}: ${reason}`,
                createdAt: Date.now(),
                adminId: auth.currentUser?.uid || ""
            });
        });

        notify(
            `${type === "CREDIT" ? "Credited" : "Debited"} ${money(amount)} successfully.`
        );

        document.getElementById("manualWalletAmount").value = "";
        document.getElementById("manualWalletReason").value = "";

        await loadUsers();
        await openUser(uid);
    } catch (error) {
        console.error("manualWalletChange:", error);
        notify(error.message || "Wallet update failed.", "error");
    }
}

async function toggleUserStatus() {
    if (!selectedUser) return;

    const uid = selectedUser.id;
    const nextActive = selectedUser.active === false;

    try {
        await runTransaction(db, async transaction => {
            transaction.set(
                doc(db, "users", uid),
                {
                    active: nextActive,
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );
        });

        notify(nextActive ? "User unblocked." : "User blocked.");

        await loadUsers();
        await openUser(uid);
    } catch (error) {
        console.error("toggleUserStatus:", error);
        notify(error.message || "Unable to change user status.", "error");
    }
}

userSearch?.addEventListener("input", filterUsers);
refreshUsersButton?.addEventListener("click", loadUsers);

closeUserDetails?.addEventListener("click", () => {
    userDetailsPanel.classList.add("hidden");
    selectedUser = null;
});

document.getElementById("manualWalletButton")
    ?.addEventListener("click", manualWalletChange);

document.getElementById("toggleUserStatusButton")
    ?.addEventListener("click", toggleUserStatus);

const usersSection = document.getElementById("section-users");

if (usersSection) {
    const observer = new MutationObserver(() => {
        if (!usersSection.classList.contains("hidden")) {
            loadUsers();
        }
    });

    observer.observe(usersSection, {
        attributes: true,
        attributeFilter: ["class"]
    });

    if (!usersSection.classList.contains("hidden")) {
        loadUsers();
    }
}
'''

html = ADMIN_HTML.read_text(encoding="utf-8")

pattern = re.compile(
    r'\s*<section\s+id=["\']section-users["\'][\s\S]*?</section>',
    re.IGNORECASE
)

if not pattern.search(html):
    raise SystemExit(
        'Could not locate <section id="section-users"> in admin.html. No changes were made.'
    )

html = pattern.sub("\n" + users_section.strip() + "\n", html, count=1)

script_tag = '<script type="module" src="js/admin-users.js"></script>'
if script_tag not in html:
    html = html.replace("</body>", f"    {script_tag}\n\n</body>", 1)

ADMIN_HTML.write_text(html, encoding="utf-8")

USERS_JS.parent.mkdir(parents=True, exist_ok=True)
USERS_JS.write_text(admin_js.strip() + "\n", encoding="utf-8")

print("=" * 72)
print("ELITEXGAMERS USERS MANAGEMENT PATCH INSTALLED")
print("=" * 72)
print(f"Project : {PROJECT}")
print(f"Updated : {ADMIN_HTML}")
print(f"Created : {USERS_JS}")
print(f"Backup  : {backup}")
print()
print("Installed:")
print("  - User search")
print("  - User profile/details")
print("  - Wallet balance")
print("  - Locked balance")
print("  - Total deposited")
print("  - Total withdrawn")
print("  - Transaction history")
print("  - Deposit/withdrawal request history")
print("  - Block/unblock")
print("  - Admin wallet credit")
print("  - Admin wallet debit")
print("  - Automatic transaction record for manual balance changes")
print()
print("Now open admin.html and press Ctrl+Shift+R.")