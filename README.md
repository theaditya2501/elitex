# EliteXGamers Web & Admin System

## Project Configuration
- **Firebase Project ID**: `elitexgamers-17353`
- **Firebase Services**: Firebase Authentication, Cloud Firestore, Firebase Hosting, Cloud Functions.
- **Storage**: **Not Used**. The platform does not require Firebase Storage or Supabase Storage. All media (e.g. hero banners) accept direct image URLs, and all financial or tournament results (deposits, payouts, kills, positions) use structured transactional data without screenshots.
- **Payment Gateway**: Razorpay (Key ID: `rzp_live_TbxTWY1CD6udie`).
6. Approval atomically credits `wallets/{uid}` and creates an approved transaction.
7. Android wallet listens to the wallet document, so the approved balance updates without a manual refresh.

## Withdrawal flow
1. Player submits amount + UPI/account details.
2. Request is created as `PENDING`.
3. Admin approves/declines it.
4. Approval atomically deducts the wallet and creates an approved transaction.

## Admin user management
The Users section now shows wallet balance, total deposited, total withdrawn and account status. Open Manage to edit the username, enable/disable the account, or make an audited wallet credit/debit. Admin wallet adjustments create an `ADMIN_CREDIT` or `ADMIN_DEBIT` transaction.

## App settings
`appSettings/config` controls maintenance mode, registrations, global deposits/withdrawals, minimum deposit, minimum withdrawal, maximum withdrawal, support contact and the home announcement. The Android wallet enforces the deposit/withdrawal switches and limits.

## Firestore rules
Deploy the included `firestore.rules` in Firebase Console after replacing the old rules. User accounts cannot change their own wallet balance or active status.
