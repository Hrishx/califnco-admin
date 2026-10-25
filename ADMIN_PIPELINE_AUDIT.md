# AquaPure Full Pipeline Audit Report — Admin Dashboard & Mobile App

**Document ID:** AQUA-PIPE-AUDIT-2026-10-25  
**Audit Target:** AquaPure Water Solutions E-Commerce Ecosystem  
- **Admin Dashboard:** `admin/` (Next.js 16.4.3 App Router, React 19, Tailwind CSS v4)  
- **Mobile Application:** `AquaPure-Califnco/artifacts/aquapure-mobile` (Expo SDK 57, React Native 0.86.3, Expo Router 57)  
**Operating Environment:** WSL Ubuntu / Windows Subsystem for Linux (`\\wsl.localhost\Ubuntu\home\harish\projects\aqua-califnco`)  
**Audit Mode:** READ-ONLY forensic inspection & safe local verification  
**Date:** October 25, 2026  

---

## 1. Executive Summary

A comprehensive, read-only forensic audit of the entire AquaPure pipeline was conducted across both the Next.js admin dashboard (`admin/`) and the Expo mobile application (`AquaPure-Califnco/artifacts/aquapure-mobile`).

### Key Findings at a Glance:
1. **Admin Dashboard Isolation (Complete Architectural Disconnect):** The admin portal (`admin/`) is currently a standalone frontend prototype operating on ephemeral in-memory React state (`useState`) initialized from `admin/data/mock-data.ts`. It has **zero backend connection**, **zero API routes**, **zero database adapters**, and **zero Firebase Admin SDK integration**. Any mutations (adding products, changing order fulfillment status, approving dealers, modifying service bookings) exist only in browser memory and are permanently wiped on page refresh.
2. **Page-Reload State Destruction in Admin:** Several primary navigation triggers on the Overview dashboard (`admin/components/admin-app.tsx`) use `window.location.href = '...'` instead of Next.js SPA navigation (`<Link>` or `router.push`). Clicking "Add product", "View all" products, "View all orders", or "View all" services forces a hard browser reload, immediately purging all in-memory changes.
3. **Dead and Deceptive Admin UI Controls:**
   - The Products table ellipsis (`...`) button does not open a menu or product editor; it silently increments numeric inventory by 1 (`stock + 1`) and shows a toast.
   - The Orders status filter dropdown and Dealer application status filter dropdown have no `value` or `onChange` bindings; selecting an option has zero effect on the table.
   - The Topbar notification bell, Products "More filters" button, Services "Date range" button, and all table row action buttons on Orders, Services, Customers, and non-pending Dealers have no event handlers.
   - The Settings panel form fields have frozen empty handlers (`onChange={() => {}}`), rendering them uneditable.
4. **Permanent Dealer Approval Blocker in Mobile App (Firebase Mode):** When Firebase is configured, the mobile app's security helper (`services/dealerAccess.ts:12`) forcibly demotes any requested `approved` status to `pending`. Crucially, **no code exists in the mobile application to query Firestore for admin-granted dealer approval** (`fetchUserProfileFromFirestore` ignores dealer role/status, and `dealerApplications/{userId}` is never fetched for status). As a result, in connected Firebase mode, no dealer can ever access approved wholesale pricing.
5. **Client-Forged Order Pricing & Firestore Update Lock:** In `AquaPure-Califnco/firestore.rules`, `/orders/{orderId}` creation permits any signed-in user to write arbitrary `total`, `unitPrices`, and `items` without server-side validation. Furthermore, `allow update: if false;` blocks legitimate admins or backend processes from updating order status via client SDKs and causes network retries to fail with `PERMISSION_DENIED`.
6. **Mobile Product Catalog Desynchronization:** While `AppContext.tsx` fetches remote products into `catalogProducts`, six critical screens (`product/[id].tsx`, `cart.tsx`, `checkout.tsx`, `order/[id].tsx`, `orders.tsx`, and `(tabs)/index.tsx`) bypass `catalogProducts` and query the static `data/products.ts` array directly. Remote products created in Firestore or by an admin appear in `ShopScreen` but become invisible or unpurchasable in detail, cart, and checkout views.
7. **Complete Data Model Incompatibility:** Admin and Mobile schemas for Products, Orders, Dealers, Services, and Customers have conflicting property names, data types, and status enums. Neither system can consume documents authored by the other without translation.

---

## 2. Framework, Environment, and Build Readiness

| Component | Admin Dashboard (`admin/`) | Mobile App (`AquaPure-Califnco/artifacts/aquapure-mobile`) | Status / Risk |
|---|---|---|---|
| **Framework** | Next.js `16.4.3` (App Router) | Expo SDK `~57.0.7`, Expo Router `~57.0.7` | Verified |
| **Runtime** | React `^19`, React-DOM `^19` | React `19.2.3`, React Native `0.86.3` | Verified |
| **Package Manager** | `pnpm@12.3.4` (Workspace root) | `pnpm` (Replit Workspace catalog) | Dependencies uninstalled in `admin/` |
| **Language / TypeScript** | TypeScript `5.7.3`, `next.config.mjs` ignores build errors | TypeScript `~6.0.3` | `admin/next.config.mjs` has `ignoreBuildErrors: true` |
| **State Management** | Ephemeral React `useState` in `admin-app.tsx` | React Context (`AppContext.tsx`) + `AsyncStorage` | Admin state is strictly in-memory |
| **Database / Persistence** | None (Static mock data in `mock-data.ts`) | Local `AsyncStorage` (`aquapure.demo.v1`) + Firestore REST | No shared database |
| **Android Packaging** | N/A (Web application) | `app.json` has `android.package: "com.aquapure.mobile"`, `eas.json` present | Configured for APK/AAB |
| **Payment Gateway** | None | Boundary stub in `paymentService.ts` (Demo cash/UPI only) | Missing Razorpay integration |

---

## 3. Detailed Admin Dashboard Audit (`admin/`)

### 3.1 Routing & Navigation
- **File:** `admin/app/page.tsx:1-5`  
  Redirects root path `/` to `/dashboard`.
- **File:** `admin/app/[section]/page.tsx:1-10`  
  Validates route segment against `['dashboard', 'products', 'orders', 'dealers', 'services', 'customers', 'settings', 'automation']`. Calls `notFound()` for unknown segments.
- **File:** `admin/components/admin-app.tsx:34`  
  Sidebar navigation renders `<Link href="/orders">` with a hardcoded badge `<em>4</em>`. This badge never reflects dynamic order counts.
- **File:** `admin/components/admin-app.tsx:52`  
  In `Dashboard`, four navigation triggers use raw `window.location.href`:
  - `Add product` button: `window.location.href = '/products'`
  - `Best-selling products` "View all": `window.location.href = '/products'`
  - `Recent orders` "View all orders": `window.location.href = '/orders'`
  - `Service bookings` "View all": `window.location.href = '/services'`  
  *Impact:* Because all data in `AdminApp` is held in React `useState`, navigating via `window.location.href` forces a full browser reload, wiping all state changes made during the session.

### 3.2 Buttons and Interactive Controls
1. **Topbar Notifications Bell** (`admin/components/admin-app.tsx:38`):  
   `<button className="icon-button" aria-label="Notifications"><Bell size={18} /><span className="notification-dot" /></button>`  
   *Defect:* Has no `onClick` handler. Clicking the bell does nothing. No drawer or popover exists.
2. **Topbar Theme Toggle** (`admin/components/admin-app.tsx:38`):  
   Toggles `dark` CSS class on container.  
   *Defect:* Not persisted to `localStorage` or cookies. Resets to light theme on navigation or reload.
3. **Dashboard Sales Period Selector** (`admin/components/admin-app.tsx:52`):  
   `<select aria-label="Sales period"><option>Last 7 months</option><option>Last 30 days</option></select>`  
   *Defect:* Uncontrolled select without `value` or `onChange`. Changing options does not update the static chart.
4. **Products "More Filters" Button** (`admin/components/admin-app.tsx:56`):  
   `<button className="filter-button"><Filter size={15} /> More filters</button>`  
   *Defect:* Dead button; no `onClick` handler.
5. **Products Table Action ("...") Button** (`admin/components/admin-app.tsx:56`):  
   `<button className="more-button" onClick={() => { setProducts(items => items.map(i => i.id === p.id ? { ...i, stock: i.stock + 1 } : i)); notify('Inventory updated for demo product') }} ...>`  
   *Defect:* Misleading and destructive behavior. Clicking the standard "more actions" ellipsis increments `stock` by 1 instead of showing an action menu (Edit/Delete). Furthermore, it fails to update `status` (e.g. stock goes from 0 to 1, but status remains "Out of stock").
6. **Orders Status Filter Dropdown** (`admin/components/admin-app.tsx:62`):  
   `<select aria-label="Filter order status"><option>All statuses</option><option>Pending</option><option>Processing</option><option>Shipped</option><option>Delivered</option></select>`  
   *Defect:* Completely disconnected. Has no `value` or `onChange`. Filtering in Orders only checks the search text box.
7. **Orders Table Action ("...") Button** (`admin/components/admin-app.tsx:62`):  
   `<button className="more-button" aria-label="View order details"><MoreHorizontal size={18} /></button>`  
   *Defect:* Dead button; no `onClick` handler. Order line items, shipping address, and payment details cannot be inspected.
8. **Dealers Status Filter Dropdown** (`admin/components/admin-app.tsx:63`):  
   `<select aria-label="Filter application status"><option>All statuses</option>...</select>`  
   *Defect:* Disconnected; no `value` or `onChange`.
9. **Dealers Table Action ("...") Button** (`admin/components/admin-app.tsx:63`):  
   For non-pending dealers, renders a dead `<MoreHorizontal>` button with no handler.
10. **Services "Date Range" Filter Button** (`admin/components/admin-app.tsx:64`):  
    `<button className="filter-button"><Filter size={15} /> Date range</button>`  
    *Defect:* Dead button; no handler.
11. **Services Table Action ("...") Button** (`admin/components/admin-app.tsx:64`):  
    Dead button; no handler.
12. **Customers Table Action ("...") Button** (`admin/components/admin-app.tsx:65`):  
    Dead button; no handler.
13. **Settings Form Fields** (`admin/components/admin-app.tsx:66`):  
    - Store name: `<Field ... value="AquaPure India" onChange={() => {}} />`
    - Support email: `<Field ... value="hello@aquapure.in" onChange={() => {}} />`
    - Store address: `<Field ... value="12 Waterworks Avenue..." onChange={() => {}} />`  
    *Defect:* All fields have empty `onChange` functions, rendering inputs frozen and uneditable.
14. **Settings Currency Display & Notifications** (`admin/components/admin-app.tsx:66`):  
    Currency select and notifications checkbox have no state binding.
15. **Settings "Save Settings" Button** (`admin/components/admin-app.tsx:66`):  
    Fires a toast notification ("Settings saved to this local demo"), but persists nothing.
16. **Sidebar Workspace, Help, and User Elements** (`admin/components/admin-app.tsx:33, 35`):  
    Rendered as plain styled `<div>` elements without interaction, profile links, or logout capability.

### 3.3 Search and Filter Cross-Contamination
- **File:** `admin/components/admin-app.tsx:27`  
  `const [search, setSearch] = useState('')` is declared at the top-level `AdminApp` and passed to all section views (`Products`, `Orders`, `Dealers`, `Services`, `Customers`).  
  *Defect:* Switching navigation tabs does not reset `search`. If a user filters by "RO" in Products and navigates to Orders, Orders immediately searches for "RO" against order IDs and customer names, producing an empty table.
- **File:** `admin/components/admin-app.tsx:56`  
  The category filter dropdown in Products lists: `Purifiers`, `Filters`, `Membranes`, `Pumps`, `Dispensers`.  
  *Defect:* Omits `Cartridges` and `Spare parts` (which are valid members of `ProductCategory` in `admin/types/index.ts:1`). Products in these categories cannot be filtered.

### 3.4 Product Creation Validation & Image Handling
- **File:** `admin/components/admin-app.tsx:57` (`ProductForm`)  
  Validation condition: `if (!name || !price || Number(price) < 0 || !stock || Number(stock) < 0 || !Number.isInteger(Number(stock))) return;`  
  *Defect:* Silently aborts without rendering error messages when validation fails. Stock units can only be integers, but price cannot be 0. Image is hardcoded to `/placeholder.jpg` with no upload or URL input.

### 3.5 Build Configuration Suppression
- **File:** `admin/next.config.mjs:3-5`  
  `typescript: { ignoreBuildErrors: true }`  
  *Defect:* Suppresses all TypeScript compiler errors during `next build`, masking type regressions in production builds.

---

## 4. Detailed Mobile App Audit (`AquaPure-Califnco/artifacts/aquapure-mobile`)

### 4.1 Authentication & Session Management
- **File:** `services/firebaseService.ts:120-231`  
  Implements Firebase Auth REST API (`identitytoolkit.googleapis.com/v1/accounts:signUp`, `signInWithPassword`, `sendOobCode`). Stores session in `AsyncStorage` under `@aquapure.firebase.session.v1`.
- **File:** `services/firebaseService.ts:258-275`  
  Correctly implements token refresh via `securetoken.googleapis.com` if the token expires within 5 minutes.
- **Defects & Limitations:**
  1. No email verification requirement.
  2. In demo mode (`!firebaseStatus.configured`), authentication is completely simulated and stored in local `AsyncStorage` (`aquapure.demo.v1`).
  3. In `login.tsx:60-68` (Dealer Apply), submitting an application sets `dealerStatus = 'pending'` locally. If the user is unauthenticated, `firebaseSession` is null, so `persistDealerApplicationToFirestore` is bypassed silently.

### 4.2 Security Flaw: Client-Side Dealer Self-Elevation vs Permanent Lock
- **File:** `services/dealerAccess.ts:8-14`
  ```typescript
  export function resolveDealerStatus(
    firebaseConfigured: boolean,
    requested: DealerStatusValue,
  ): DealerStatusValue {
    if (firebaseConfigured && requested === 'approved') return 'pending';
    return requested;
  }
  ```
- **File:** `context/AppContext.tsx:146, 327, 370, 419`  
  Calls `resolveDealerStatus` on bootstrap, sign-in, and status updates.
- **The Critical Architecture Flaw:**
  1. In **Demo Mode** (`firebaseConfigured: false`): The user can self-elevate to approved dealer via shortcut buttons in `login.tsx:152` and `(tabs)/profile.tsx:177`, unlocking wholesale pricing (~18% discount + bulk tiers up to 12%). This is explicitly labelled as demo-only.
  2. In **Firebase Mode** (`firebaseConfigured: true`): `resolveDealerStatus` safely converts any requested `'approved'` to `'pending'`. **However, there is no code in the entire mobile app that fetches an approved dealer status from Firestore!**
     - `fetchUserProfileFromFirestore` (`services/firebaseService.ts:329-348`) extracts only `displayName`, `email`, `phone`, `addresses`, `notificationsEnabled`. It never parses `role` or `dealerStatus`.
     - `fetchUserOrdersFromFirestore` and `fetchUserServiceRequestsFromFirestore` only query orders and service requests.
     - There is no query to `/dealerApplications/{userId}` to read updated approval status.
  3. **Consequence:** In a connected production deployment with Firebase, no user can ever become an approved dealer, permanently locking wholesale pricing out of reach.

### 4.3 Firestore Security Rules Vulnerabilities (`firestore.rules`)
- **File:** `AquaPure-Califnco/firestore.rules:41-47`
  ```javascript
  match /orders/{orderId} {
    allow read: if owns(resource.data.userId);
    allow create: if signedIn()
      && request.resource.data.userId == request.auth.uid
      && (request.resource.data.status == 'Confirmed' || request.resource.data.status == 'Processing');
    allow update, delete: if false;
  }
  ```
  - **Vulnerability 1 (Client Price Forgery):** Rules do not validate `subtotal`, `total`, `unitPrices`, or `items`. A compromised or modified client can write `{ total: 1, subtotal: 1, items: [...] }` to place orders for arbitrary low amounts.
  - **Vulnerability 2 (Admin Update Lockout):** `allow update: if false;` prevents an admin client or non-privileged SDK from updating order fulfillment status (`Processing` -> `Shipped` -> `Delivered`).
  - **Vulnerability 3 (Network Retry Rejection):** `persistOrderToFirestore` sends an HTTP `PATCH`. If a client network timeout occurs after Firestore creates the document, the subsequent retry is evaluated as an `update`, which is rejected with `PERMISSION_DENIED`.
- **File:** `AquaPure-Califnco/firestore.rules:29-37`
  - `/dealerApplications/{userId}` has `allow update, delete: if false;`. An admin dashboard using client-side Firestore SDK cannot approve applications; approval requires privileged server-side Firebase Admin SDK.

### 4.4 Catalog Desynchronization across Mobile Screens
- **File:** `context/AppContext.tsx:179, 525-560`  
  `fetchCatalogueFromFirestore` loads remote products into `catalogProducts`.
- **Defect:** Five major screens directly import and read static `products` from `data/products.ts`, completely ignoring `catalogProducts`:
  1. `app/product/[id].tsx:14`: `const product = products.find((item) => item.id === id);` — Cannot view details of remote products.
  2. `app/(tabs)/cart.tsx:25`: `const product = products.find((item) => item.id === line.productId);` — Remote products in cart render blank/null.
  3. `app/checkout.tsx:108`: `const product = products.find((item) => item.id === line.productId);` — Remote products omitted from order summary.
  4. `app/order/[id].tsx:28`: `const product = products.find((item) => item.id === line.productId);` — Remote products cannot be rendered in order history details.
  5. `app/(tabs)/orders.tsx:19`: `const firstProduct = products.find((product) => product.id === order.items[0]?.productId);` — Remote product names missing in order cards.
  6. `app/(tabs)/index.tsx:75`: `products.filter((product) => product.featured)...` — Remote featured products never show on Home screen.
- Only `app/(tabs)/shop.tsx:16` correctly checks `catalogProducts`.

### 4.5 Checkout Calculation Discrepancy
- **File:** `app/checkout.tsx:107-111` vs `context/AppContext.tsx:552-556`  
  In `checkout.tsx`, line items calculate:  
  `formatINR((unitPrice ?? product.retailPrice) * line.quantity)`  
  This multiplies base price by quantity, ignoring `BULK_DISCOUNT_TIERS` (5%, 8%, 12%). However, `cartSubtotal` is computed via `calculateLinePrice`, which includes the bulk tier discount. The displayed line item prices do not sum to the displayed subtotal.

---

## 5. End-to-End Data Pipeline Tracing

```
+----------------------------------------------------------------------------------------------------+
|                                    DATA PIPELINE TRACE OVERVIEW                                    |
+----------------------------------------------------------------------------------------------------+

1. PRODUCT CREATION (ADMIN)
   UI Form -> submit() -> setProducts() [In-Memory React State]
   [DISCONNECTED] -> Never reaches Firestore -> Never reaches Mobile App -> Wiped on page refresh

2. CATALOG RETRIEVAL (MOBILE)
   Bootstrap -> fetchCatalogueFromFirestore() -> GET /documents/products -> catalogProducts state
   [DESYNCHRONIZED] -> ShopScreen displays catalogProducts, but Product Details, Cart, Checkout,
                       and Home Screen read static products.ts

3. ORDER PLACEMENT (MOBILE)
   Checkout UI -> confirmOrder() -> placeOrder() -> persistOrderToFirestore() -> PATCH /orders/{id}
   [UNVALIDATED]   -> Client dictates arbitrary total and item prices (Security Risk)
   [DISCONNECTED]  -> Admin has zero listener/query for Firestore orders; views static demoOrders
   [ADMIN LOCKOUT] -> Firestore rules allow update: false; Admin cannot update fulfillment

4. DEALER APPLICATION & APPROVAL
   Mobile Apply -> applyAsDealer() -> persistDealerApplicationToFirestore() -> /dealerApplications/{uid}
   [DISCONNECTED]  -> Admin views static demoDealers; approve click updates in-memory React state
   [RULES BLOCKED] -> Firestore rules allow update: false; Client admin cannot approve application
   [MOBILE BLIND]  -> Mobile never queries Firestore for approval; permanently demotes to 'pending'

5. SERVICE BOOKINGS
   Mobile Service -> addServiceRequest() -> persistServiceRequestToFirestore() -> /serviceRequests/{id}
   [DISCONNECTED] -> Admin views static demoServices; cannot view mobile customer requests

6. INSTAGRAM AUTOMATION
   Admin Tab -> /automation route -> renders static mock cards
   [NON-EXISTENT] -> Zero server scheduler, zero Meta Graph API client, zero webhook or sheets sync
```

### Detailed Pipeline Breakdown:

#### Pipeline 1: Product Creation & Catalog Management
| Step | Admin Dashboard | Mobile Application | Disconnect / Risk |
|---|---|---|---|
| **UI Action** | Click "Add product" -> Fill modal -> Click "Add product" | N/A (Client catalog browsing) | Admin action is client-only |
| **Handler** | `ProductForm.submit` (`admin-app.tsx:57`) | `AppContext.refreshCatalog` | No backend API invoked |
| **Service / API** | None (Direct state setter) | `fetchCatalogueFromFirestore` (`firebaseService.ts:525`) | No write API exists anywhere |
| **Storage Target** | In-memory `products` array | Cloud Firestore `/products` collection | Admin stores in RAM; Mobile reads Firestore |
| **Persistence** | Lost on navigation/refresh | Static 56 products fallback | Admin data never reaches Mobile |

#### Pipeline 2: Order Placement & Fulfillment
| Step | Mobile Application | Admin Dashboard | Disconnect / Risk |
|---|---|---|---|
| **UI Action** | Fill checkout form -> Click "Place demo order" | Admin selects status in Orders table | Both update local state only |
| **Handler** | `confirmOrder` -> `placeOrder` (`AppContext.tsx:491`) | `inline-select.onChange` (`admin-app.tsx:62`) | Admin does not call Firestore |
| **Service / API** | `persistOrderToFirestore` (`firebaseService.ts:351`) | None | Admin has no API layer |
| **Storage Target** | `AsyncStorage` + Firestore `/orders/{id}` | In-memory `orders` array | Disjoint data stores |
| **Security / Rules** | Writes unvalidated client total; no payment check | N/A | Rules block admin status updates |

#### Pipeline 3: Dealer Application & Approval
| Step | Mobile Application | Admin Dashboard | Disconnect / Risk |
|---|---|---|---|
| **UI Action** | Submit dealer form (`login.tsx:60`) | Click "Approve" button (`admin-app.tsx:63`) | Actions are isolated |
| **Handler** | `applyAsDealer` (`AppContext.tsx:423`) | `setDealers` in `admin-app.tsx:63` | Admin mutates in-memory state |
| **Service / API** | `persistDealerApplicationToFirestore` | None | No backend sync |
| **Approval Flow** | Forcibly demoted to `'pending'` in Firebase mode | In-memory status set to `'Approved'` | Mobile never reads Firestore status |

---

## 6. Cross-Project Data Model Discrepancies

| Field / Attribute | Admin Model (`admin/types/index.ts`) | Mobile Model (`data/products.ts`, `AppContext.tsx`) | Firestore Document Schema | Breaking Discrepancy |
|---|---|---|---|---|
| **Product ID** | `AP-PUR-001` (Alphanumeric code) | `aquapure-ro-uv-smart-8l` (Slugified string) | Document ID | ID formats collide; foreign key references will fail |
| **Product Pricing** | Single `price: number` | `retailPrice: number`, `wholesalePrice: number` | `retailPrice`, `wholesalePrice` | Admin cannot view or edit wholesale dealer rates |
| **Product Inventory** | `stock: number` (e.g. `24`) | `availability: 'In stock' \| 'Low stock' \| 'Out of stock'` | `availability: string` | Admin uses numeric inventory; Mobile uses status enum |
| **Product Metadata** | `image: string` (`/placeholder.jpg`) | `description`, `specifications`, `imageRef`, `rating`, `featured` | Full specifications map | Admin products lack specs, descriptions, and category art refs |
| **Order Customer** | `customerId: string`, `customer: string` | Implicit via `userId: string` | `userId: string` | Admin expects customer name; Firestore only stores UID |
| **Order Items** | `[{ productId, name, quantity, price }]` | `items: [{ productId, quantity }]`, `unitPrices: Record<string, number>` | Matches Mobile | Admin expects inline `name` and `price`; crashes on Mobile orders |
| **Order Status** | `'Pending' \| 'Processing' \| 'Shipped' \| 'Delivered' \| 'Cancelled'` | `'Confirmed' \| 'Processing' \| 'Shipped' \| 'Delivered'` | Matches Mobile | Mobile places `'Confirmed'`; Admin select dropdown lacks `'Confirmed'` |
| **Order Payment** | `payment: 'Paid' \| 'Pending' \| 'Refunded'` | `paymentMethod: 'Cash on delivery' \| 'UPI (demo)'` | `paymentMethod: string` | Admin expects payment settlement status; Mobile stores payment channel |
| **Dealer Business** | `business: string` | `businessName: string` | `businessName: string` | Field name mismatch |
| **Dealer Details** | `contact`, `city`, `notes` | Not collected | Not collected | Admin table renders blanks for mobile applications |
| **Dealer Status** | `'Pending' \| 'Approved' \| 'Rejected'` | `'not_applied' \| 'pending' \| 'approved' \| 'rejected'` | `'pending'` (lowercase) | Case sensitivity mismatch |
| **Service Customer** | `customer: string`, `phone: string` | Not collected | Not collected | Admin services table renders blanks |
| **Service Timing** | `date: string`, `time: string` | `preferredDate: string` | `preferredDate: string` | Admin expects separate date and time fields |

---

## 7. Incomplete Integrations and Placeholders

### 7.1 Payment Gateway (Razorpay)
- **Status:** Complete Placeholder / Stub.
- **Evidence:** `AquaPure-Califnco/artifacts/aquapure-mobile/services/paymentService.ts:1-12` returns static `{ connected: false, provider: 'Razorpay' }`.
- **Reality:** No Razorpay native SDK (`react-native-razorpay`) or REST client is installed. Checkout records orders without financial verification.

### 7.2 Push Notifications
- **Status:** Local Mockup Only.
- **Evidence:** `FIREBASE_SETUP.md:35-39` and `context/AppContext.tsx:118-121`.
- **Reality:** No Firebase Cloud Messaging (FCM) or Expo Push Notifications integration exists. Notifications are hardcoded strings appended to `AppContext` state and saved in `AsyncStorage`.

### 7.3 Instagram Automation
- **Status:** Visual Preview Placeholder.
- **Evidence:** `admin/components/admin-app.tsx:67` (`function Automation`).
- **Reality:** Renders a static card describing 4 planned steps ("Select next eligible product", "Generate image and caption", "Publish through Meta Graph API", "Record result in Google Sheets"). Zero server routes, scheduler jobs (n8n/cron), or Meta Graph API SDKs exist.

### 7.4 Firebase Admin Backend in Admin Portal
- **Status:** Completely Absent.
- **Evidence:** `admin/.env.example:1-5` explicitly notes:
  ```
  # Firebase integration is intentionally not configured in this UI prototype.
  # Add server-only Firebase Admin credentials when the trusted backend is ready.
  ```
  `admin/package.json` contains no `firebase-admin` dependency.

---

## 8. Confirmed Issues Log with Evidence

### Issue 1: Hard Browser Navigation Destroys Ephemeral Admin State
- **Severity:** High
- **Project & File:** `admin/components/admin-app.tsx:52`
- **User Action:** Admin clicks "+ Add product", "View all" products, "View all orders", or "View all" services on the Overview dashboard.
- **Root Cause:** Uses `onClick={() => window.location.href = '/products'}` instead of Next.js SPA router (`router.push` or `<Link>`). Forces a full page reload which resets all React `useState` hooks.
- **Smallest Safe Fix:** Replace `window.location.href = '...'` with Next.js `<Link href="...">` or `router.push('...')`.
- **Verification:** Static code inspection.

### Issue 2: Products Table Ellipsis Mutates Stock Silently
- **Severity:** High
- **Project & File:** `admin/components/admin-app.tsx:56`
- **User Action:** Admin clicks the ellipsis (`...`) button on any product row.
- **Root Cause:** Handler executes `setProducts(items => items.map(i => i.id === p.id ? { ...i, stock: i.stock + 1 } : i))`.
- **Smallest Safe Fix:** Remove the inline stock mutation; open an edit modal or action popover allowing explicit stock adjustment and status recalculation.
- **Verification:** Static code inspection.

### Issue 3: Disconnected Filter Dropdowns in Orders and Dealers Tables
- **Severity:** High
- **Project & File:** `admin/components/admin-app.tsx:62, 63`
- **User Action:** Admin selects an option in "Filter order status" or "Filter application status".
- **Root Cause:** `<select>` elements lack `value` and `onChange` attributes; table filtering logic only filters by `search` text.
- **Smallest Safe Fix:** Introduce state variables (`orderStatusFilter`, `dealerStatusFilter`), bind them to `<select value={...} onChange={...}>`, and include them in `.filter(...)`.
- **Verification:** Static code inspection.

### Issue 4: Global Search State Cross-Pollinates Between Admin Sections
- **Severity:** High
- **Project & File:** `admin/components/admin-app.tsx:27, 38`
- **User Action:** Admin searches for a product (e.g. "purifier") in Products, then clicks "Orders" in the sidebar.
- **Root Cause:** A single `search` state variable is hoisted in `AdminApp` and passed to all tab components without resetting on route change.
- **Smallest Safe Fix:** Move `search` state into each individual tab component, or add a `useEffect` on `pathname` to clear `search`.
- **Verification:** Static code inspection.

### Issue 5: Settings Panel Inputs Frozen Due to Empty Handlers
- **Severity:** High
- **Project & File:** `admin/components/admin-app.tsx:66`
- **User Action:** Admin attempts to type in Store Name, Support Email, or Store Address.
- **Root Cause:** Inputs have `onChange={() => {}}`.
- **Smallest Safe Fix:** Bind each field to a local React state variable and update state in `onChange`.
- **Verification:** Static code inspection.

### Issue 6: TypeScript Build Error Suppression Enabled
- **Severity:** Medium
- **Project & File:** `admin/next.config.mjs:3-5`
- **User Action:** Running `pnpm build` or CI deployment.
- **Root Cause:** `typescript: { ignoreBuildErrors: true }` suppresses compiler diagnostics.
- **Smallest Safe Fix:** Remove `ignoreBuildErrors: true` and resolve any type mismatches.
- **Verification:** Static code inspection.

### Issue 7: Wholesale Dealer Access Permanently Locked in Firebase Mode
- **Severity:** Critical
- **Project & File:** `AquaPure-Califnco/artifacts/aquapure-mobile/services/dealerAccess.ts:8-14`, `services/firebaseService.ts:329-348`, `context/AppContext.tsx:146`
- **User Action:** Dealer registers or logs in with Firebase configured.
- **Root Cause:** `resolveDealerStatus(true, 'approved')` returns `'pending'`. Mobile app never fetches approval status from `/dealerApplications/{userId}` or `/users/{userId}`.
- **Smallest Safe Fix:** Implement `fetchDealerApplicationStatusFromFirestore(userId, token)` in `firebaseService.ts`, call it during session initialization, and allow `approved` status when verified against Firestore.
- **Verification:** Verified by executed test (`node --experimental-strip-types`) confirming `resolveDealerStatus(true, 'approved') === 'pending'`.

### Issue 8: Unvalidated Order Creation Allows Client Price Tampering
- **Severity:** Critical
- **Project & File:** `AquaPure-Califnco/firestore.rules:41-47`
- **User Action:** Placing an order via mobile app.
- **Root Cause:** Firestore security rules allow any signed-in user to write any order payload without validating item prices, bulk discounts, delivery fees, or totals.
- **Smallest Safe Fix:** Move order creation to a trusted server endpoint (Cloud Function / API Route) that recalculates prices against the database catalogue before creating the Firestore order document.
- **Verification:** Static code inspection.

### Issue 9: Mobile App Screens Bypass Remote Firestore Catalog
- **Severity:** High
- **Project & File:** `AquaPure-Califnco/artifacts/aquapure-mobile/app/product/[id].tsx:14`, `app/(tabs)/cart.tsx:25`, `app/checkout.tsx:108`, `app/order/[id].tsx:28`
- **User Action:** User taps a dynamic product loaded from Firestore in the shop.
- **Root Cause:** Screens import static `products` from `@/data/products` instead of reading `catalogProducts` from `useApp()`.
- **Smallest Safe Fix:** Replace `products.find(...)` with `catalogProducts.find(...)` (with fallback to `products`).
- **Verification:** Static code inspection.

### Issue 10: Checkout Item Total Calculation Excludes Bulk Tier Discounts
- **Severity:** Medium
- **Project & File:** `AquaPure-Califnco/artifacts/aquapure-mobile/app/checkout.tsx:107-111`
- **User Action:** Approved dealer reviews checkout summary for 10+ units.
- **Root Cause:** Line price is calculated as `(unitPrice ?? product.retailPrice) * line.quantity` without applying `BULK_DISCOUNT_TIERS`, causing a mismatch with `cartSubtotal`.
- **Smallest Safe Fix:** Use `calculateLinePrice(product, line.quantity, isDealer).lineTotal` for each line item.
- **Verification:** Static code inspection.

---

## 9. Safe Commands & Tests Executed

The following safe, read-only checks were executed in the environment. Actual results are recorded below:

### Command 1: Admin TypeScript Check via pnpm
- **Command:** `pnpm exec tsc --noEmit` (in `admin/`)
- **Result:** Exited with code 1.
- **Actual Output:**
  ```
  pnpm: EPERM: operation not permitted, symlink 'C:\Users\mrspa\AppData\Local\pnpm\.tools\pnpm\12.3.4_tmp_19968_0' -> 'C:\Users\mrspa\AppData\Local\pnpm\store\v10\projects\161ca2aaf0397a2708348faeb91984f9'
  ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/pnpm: request to https://registry.npmjs.org/pnpm failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org
  ```
- **Finding:** `admin/node_modules` does not exist (`Test-Path .\node_modules` returned `False`). Corepack attempted to fetch `pnpm@12.3.4` from the public registry, which failed due to sandbox network isolation. Dependencies have never been installed in `admin/`.

### Command 2: Mobile Dealer Access Unit Test
- **Command:** `node --test ..\AquaPure-Califnco\artifacts\aquapure-mobile\tests\dealerAccess.test.mjs`
- **Result:** Exited with code 1.
- **Actual Output:**
  ```
  Error: Cannot find module 'typescript'
  Require stack:
  - \\wsl.localhost\Ubuntu\home\harish\projects\aqua-califnco\AquaPure-Califnco\artifacts\aquapure-mobile\tests\dealerAccess.test.mjs
  ```
- **Finding:** Node.js CJS loader failed to resolve `typescript` through `createRequire(import.meta.url)` across the WSL UNC file share path.

### Command 3: Runtime Verification of Dealer Access Logic
- **Command:**
  ```powershell
  node --experimental-strip-types -e "import { resolveDealerStatus, canSimulateDealerApproval } from '../AquaPure-Califnco/artifacts/aquapure-mobile/services/dealerAccess.ts'; console.log('resolve(true, approved):', resolveDealerStatus(true, 'approved')); console.log('resolve(false, approved):', resolveDealerStatus(false, 'approved')); console.log('canSimulate(true):', canSimulateDealerApproval(true)); console.log('canSimulate(false):', canSimulateDealerApproval(false));"
  ```
- **Result:** Exited with code 0.
- **Actual Output:**
  ```
  resolve(true, approved): pending
  resolve(false, approved): approved
  canSimulate(true): false
  canSimulate(false): true
  ```
- **Runtime Verification:** Confirmed that whenever Firebase is configured (`true`), `resolveDealerStatus` immediately converts `'approved'` to `'pending'` and disables simulation controls, proving the dealer lock defect at runtime.

### Command 4: WSL Environment Availability Check
- **Command:** `wsl -d Ubuntu -e node -v`
- **Result:** Exited with code 1 (`Access is denied. Error code: Wsl/E_ACCESSDENIED`).
- **Finding:** Direct WSL execution is restricted within the Windows sandbox environment.

### Command 5: Git Status Verification
- **Command:** `git -C ..\AquaPure-Califnco -c safe.directory=* status`
- **Result:** Exited with code 1 (`fatal: cannot change to '..\AquaPure-Califnco': Permission denied`).
- **Finding:** Windows Git binary cannot traverse the WSL UNC path without explicit Windows-level network share permissions.

---

## 10. Prioritized Repair Plan

### Phase 1: Security & Permissions Boundaries (Immediate)
1. **Server-Side Order Authorizer:**
   - Deploy a trusted Firebase Cloud Function / Next.js Server Action for order placement.
   - Enforce server-side product lookup, price calculation, bulk tier application, and Razorpay signature verification before creating documents in Firestore `/orders`.
2. **Dealer Approval Verification in Mobile App:**
   - Add a Firestore query in `services/firebaseService.ts` to check `/dealerApplications/{userId}` for `status == 'approved'`.
   - Update `AppContext.tsx` to set `dealerStatus = 'approved'` and `role = 'dealer'` only when verified against Firestore.
3. **Firestore Rules Adjustment:**
   - Allow trusted backend service accounts (Firebase Admin SDK) to update order statuses and dealer applications.
   - Restrict client write access on sensitive order financial fields.

### Phase 2: Catalog Consistency Across Mobile Screens
1. **Unify Catalog Source:**
   - In `product/[id].tsx`, `cart.tsx`, `checkout.tsx`, `order/[id].tsx`, `orders.tsx`, and `(tabs)/index.tsx`, replace static `products` imports with `catalogProducts` from `useApp()`.
2. **Checkout Tier Calculation Fix:**
   - Update `checkout.tsx:109` to use `calculateLinePrice` so individual line item prices reflect bulk tier discounts matching the subtotal.

### Phase 3: Admin Dashboard Navigation & State Persistence
1. **Replace Hard Navigations:**
   - Change `window.location.href = '...'` in `admin-app.tsx:52` to Next.js `<Link>` or `router.push`.
2. **Isolate Tab Search State:**
   - Scope the `search` state to individual tab views so switching between Products and Orders does not carry over search keywords.
3. **Unfreeze Settings & Reconnect Filters:**
   - Bind `onChange` handlers for Store Profile fields.
   - Bind `value` and `onChange` for Orders status filter and Dealers application status filter.
4. **Remove Destructive Ellipsis Mutation:**
   - Replace the `stock + 1` mutation on product rows with an explicit Edit/Stock Adjustment modal.

### Phase 4: Full-Stack Pipeline Connection
1. **Implement Server-Side API in Admin (`admin/app/api`):**
   - Install `firebase-admin` in `admin/package.json`.
   - Configure server-only environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
   - Create Route Handlers for Products CRUD, Orders fulfillment updates, and Dealer approvals.
2. **Model Normalization Layer:**
   - Create a shared schema translation module to map Mobile/Firestore order documents (`items: [{ productId, quantity }]`, `unitPrices`) into Admin order views.

### Phase 5: Build & Production Hardening
1. **Enable Strict Typechecking:**
   - Remove `typescript.ignoreBuildErrors = true` from `admin/next.config.mjs`.
   - Run `pnpm install` in `admin/` in an environment with registry access to generate a clean build.
2. **Instagram Automation Backend:**
   - Set up an independent worker/scheduler (n8n or Cloud Run) with server-side Meta Graph API credentials and Google Sheets sync, decoupling it completely from the frontend dashboard.

---

## 11. Five Highest-Priority Findings Summary

1. **[CRITICAL] Client Price Forgery in Firestore Orders (`AquaPure-Califnco/firestore.rules:41-47`)**  
   Mobile clients write orders directly to Firestore with unvalidated prices and totals. Any authenticated user can forge order amounts. Furthermore, `allow update: false;` locks out order fulfillment updates and causes network retries to fail.
2. **[CRITICAL] Broken Dealer Approval Loop in Connected Firebase Mode (`artifacts/aquapure-mobile/services/dealerAccess.ts:12`)**  
   When Firebase is configured, `resolveDealerStatus` forcibly converts `'approved'` to `'pending'`. The app never queries Firestore for admin approval, permanently locking wholesale pricing out of reach in production.
3. **[HIGH] Ephemeral Admin State Destroyed by Hard Navigations (`admin/components/admin-app.tsx:52`)**  
   The admin dashboard holds all data in React `useState`. Overview action buttons invoke `window.location.href`, triggering full page reloads that wipe all created products, updated order statuses, and dealer decisions.
4. **[HIGH] Complete Decoupling Between Admin Portal and Mobile Backend (`admin/data/mock-data.ts`)**  
   The admin dashboard has zero connection to Firestore, zero API routes, and conflicting data schemas. Product additions in Admin are never synced to the database or mobile app.
5. **[HIGH] Mobile Screen Catalog Desynchronization (`artifacts/aquapure-mobile/app/product/[id].tsx:14` etc.)**  
   While `AppContext.tsx` fetches remote Firestore products, six key mobile screens bypass `catalogProducts` and query static `products.ts`. Dynamic products added to the catalogue become invisible in detail, cart, and checkout views.
