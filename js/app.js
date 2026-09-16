/**
 * Elite X Gamers - Main Application Bootstrapper
 * Wires all client routes to portal views.
 */

import { router } from "./router.js";
import { requireAuth } from "./auth.js";
import {
    initAuth,
    renderHome,
    renderLogin,
    renderRegister,
    renderSso,
    renderDashboard,
    renderTournaments,
    renderTournamentDetails,
    renderMyMatches,
    renderWallet,
    renderDeposit,
    renderWithdraw,
    renderTransactions,
    renderResults,
    renderNotifications,
    renderSupport,
    renderProfile,
    renderSettings
} from "./portal.js";

// Guard protected routes via centralized auth bootstrap
router.beforeEach(async (matched) => {
    if (matched.isProtected) {
        const user = await requireAuth(matched.pattern);
        if (!user) return false;
    }
    return true;
});

// Register All Canonical Routes
router.add("/", () => renderHome());
router.add("/login", () => renderLogin());
router.add("/register", (params, query) => renderRegister(query));
router.add("/sso", (params, query) => renderSso(params, query));
router.add("/dashboard", () => renderDashboard(), true);
router.add("/tournaments", (params, query) => renderTournaments(params, query));
router.add("/tournaments/:id", (params) => renderTournamentDetails(params));
router.add("/my-matches", (params, query) => renderMyMatches(params, query), true);
router.add("/matches/:id", (params) => renderTournamentDetails(params));
router.add("/wallet", () => renderWallet(), true);
router.add("/deposit", () => renderDeposit(), true);
router.add("/withdraw", () => renderWithdraw(), true);
router.add("/transactions", () => renderTransactions(), true);
router.add("/results", (params) => renderResults(params));
router.add("/results/:id", (params) => renderResults(params));
router.add("/notifications", () => renderNotifications(), true);
router.add("/support", (params) => renderSupport(params));
router.add("/support/:id", (params) => renderSupport(params));
router.add("/profile", () => renderProfile(), true);
router.add("/referrals", () => renderProfile(), true);
router.add("/settings", () => renderSettings());

// Boot Auth & Router
initAuth();
router.start();
