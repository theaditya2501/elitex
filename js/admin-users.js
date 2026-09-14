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
