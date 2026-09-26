# Ledgro App Architecture

## 1. Complete Directory Tree

```
src/
├── App.jsx                     # Main router and AuthProvider wrapper
├── App.test.jsx
├── assets/
│   ├── hero.png
│   ├── react.svg
│   └── vite.svg
├── components/
│   ├── BottomNav.jsx           # Global bottom navigation logic
│   ├── CartItem.jsx
│   ├── DiscountDrawer.jsx      # Drawer component for applying discounts
│   ├── ErrorBoundary.jsx       # Top-level error boundary
│   ├── Receipt.jsx             # Thermal receipt preview/export component
│   ├── SearchInput.jsx
│   ├── Skeleton.jsx            # Loading skeleton primitives
│   └── SplashScreen.jsx        # Initial loading screen during auth check
├── context/
│   └── AuthContext.jsx         # Authentication, Shop state, and User context
├── firebase.js                 # Firebase initialization & config
├── hooks/
│   └── useBodyLock.js          # Custom hook to lock body scrolling on iOS (for Vaul)
├── index.css                   # Global styles and Tailwind imports
├── lib/
│   ├── utils.js                # Utilities (cn, debounce, haptics, crypto, etc.)
│   └── utils.test.js
├── main.jsx                    # React DOM root entry
├── pages/
│   ├── Dashboard.jsx           # Home screen with recent stats and top products
│   ├── Expenses.jsx            # Expense tracking
│   ├── Ledger.jsx              # History of bills and transactions
│   ├── Legal.jsx               # Terms/Privacy
│   ├── Members.jsx             # Shop staff management (add/remove, role transfer)
│   ├── PLScreen.jsx            # Profit & Loss analytical dashboard
│   ├── POS.jsx                 # Point of Sale / Checkout builder
│   ├── Products.jsx            # Product catalog management
│   ├── Settings.jsx            # App preferences & Shop settings
│   ├── ShopSetup.jsx           # Initial onboarding (Create/Join shop)
│   └── SignIn.jsx              # Google Login page
├── reducers/
│   ├── billReducer.js          # Reducer for POS cart logic and complex calculations
│   └── billReducer.test.js
└── store/
    ├── catalogStore.js         # Zustand store for offline catalog and prefix trie search
    └── catalogStore.test.js
```

## 2. Firestore Schemas

### `/shops/{shopId}`
* `name` (string): Business name.
* `ownerId` (string): UID of the user who currently holds admin rights.
* `members` (map): Key is user `uid`, value is role (`'admin'` or `'member'`).

### `/shops/{shopId}/bills/{billId}`
* `creatorId` (string): UID of the user who created the bill.
* `items` (array): Array of line items. Each item has:
  * `name` (string)
  * `unitPrice` (number)
  * `qty` (number)
  * `rawTotal` (number)
  * `lineDiscount` (map: `type` ('flat' | 'percent'), `value` (number))
  * `finalLineTotal` (number)
* `subtotal` (number)
* `globalDiscount` (map: `type`, `value`)
* `grandTotal` (number)
* `payment` (map): Payment details:
  * `method` (string: `'cash'`, `'upi'`, `'split'`)
  * `breakdown` (map: `cash` (number), `upi` (number))
* `createdAt` (timestamp): Server timestamp of bill creation.
* `type` (string, optional): `'reversal'` or `'return'` (if applicable).
* `originalBillId` (string, optional): Reference ID if this is a reversal or return.
* `reversedAt` (timestamp, optional)
* `reversedBy` (string, optional)

### `/shops/{shopId}/expenses/{expenseId}`
* `amount` (number): Expense amount.
* `description` (string): Details about the expense.
* `category` (string): ID of the category (e.g. `'electricity'`, `'rent'`).
* `creatorId` (string): UID of the user creating it.
* `createdAt` (timestamp): Server timestamp.

### `/shops/{shopId}/catalog/{productId}`
* `name` (string): Product name.
* `unitPrice` (number): Base price.
* `stockCount` (number, optional): Current inventory level.
* `lowStockAlert` (number, optional): Threshold for low stock warning.
* `unit` (string): Unit of measure (e.g., `'pcs'`, `'kg'`).
* `category` (string, optional)
* `description` (string, optional)
* `frequency` (number): Auto-incremented counter for fast-access sorting in POS.
* `isActive` (boolean): Soft delete flag.
* `createdAt` (timestamp)
* `updatedAt` (timestamp)

### `/invites/{inviteCode}` (Root Level)
* `shopId` (string): ID of the shop to join.
* `expiresAt` (timestamp): Valid for 30 minutes.
* `claimedBy` (string | null): UID of the user who claimed it.

### `/adminRecovery/{shopId}` (Root Level)
* `requestedBy` (string): UID of the member requesting admin.
* `requestedAt` (timestamp)
* `autoApproveAt` (timestamp): Date after which the request auto-approves.

## 3. Auth & State Flow

* **Authentication:** Users authenticate exclusively via Firebase Auth with Google Sign-In (`SignIn.jsx`).
* **AuthContext Initialization:**
  1. The `AuthContext` listens to `onAuthStateChanged`.
  2. If a user is logged in, it queries the `/shops` collection where `members.[uid]` exists to find their shop.
  3. If a shop is found, `hasShop` is set to `true`, and `shopId` is stored in the context.
  4. Role checking (`admin` vs `member`) is derived dynamically by comparing `user.uid` to the `ownerId` of the current shop document, or by checking the value in the `members` map. Administrative actions (like adding/removing members) verify this role.
  5. If no shop is found, the user is directed to `ShopSetup.jsx` to create or join one.
* **Session Storage:** Firebase handles persistent local caching of auth state. Global state like the active `shopId` and user details are held in `AuthContext` memory. App preferences (like default payment method or haptic settings) are stored in browser `localStorage`.
* **State Management:**
  * Complex POS bill building is managed by a `useReducer` (`billReducer.js`).
  * The Product Catalog and offline search index (Prefix Trie) are managed globally via `zustand` (`catalogStore.js`).

## 4. Key Write Operations

### Creating a Bill (`POS.jsx`)
* Uses a **Firestore WriteBatch** to ensure atomic execution.
* Writes a new document to `/shops/{shopId}/bills` containing the `grandTotal`, `items`, and `payment` details.
* If `editBill` exists, simultaneously writes a `'reversal'` bill document pointing to the original bill ID.
* Iterates through the cart items, and for any items linked to the catalog, updates the `/shops/{shopId}/catalog/{id}` document to:
  * Increment `frequency` by `1`.
  * Decrement `stockCount` by the purchased quantity (if stock tracking is enabled).
* Commits the batch.

### Claiming an Invite (`ShopSetup.jsx` & `Members.jsx`)
1. The joining user enters the code in `ShopSetup.jsx`.
2. Client checks `/invites/{code}` for existence and expiration.
3. Joining user updates the invite document setting `claimedBy: user.uid`.
4. The admin's active client (which is listening via `onSnapshot` in `Members.jsx`) detects the change.
5. The admin's client executes `updateDoc` on `/shops/{shopId}` to add `[`members.${claimedBy}`]: 'member'`.
6. Admin deletes the invite document.
7. Joining user's polling loop detects they are now in the shop's `members` map and completes the setup.

### Voiding/Reversing a Transaction (`Ledger.jsx`)
* Uses a **Firestore WriteBatch**.
* Updates the original bill document in `/shops/{shopId}/bills/{billId}` adding `type: 'reversal'`, `reversedAt`, and `reversedBy`.
* Iterates through the items, updating the corresponding catalog documents to decrement `frequency` by `1` (undoing the popularity bump).
* Commits the batch.
* *Note: The ledger explicitly masks voided transactions rather than showing a separate negative entry in the history UI.*

### Adding a Product (`Products.jsx`)
* Validates inputs (name, price, stock limits).
* Executes `addDoc` on `/shops/{shopId}/catalog` with product payload, `isActive: true`, `frequency: 0`, and `createdAt: serverTimestamp()`.
* Updates the local `zustand` catalog store optimistically to instantly reflect the new item in the UI and search index.

## 5. External Dependencies & Build

**Build Tools:**
* `vite`: ^8.3.0
* `@vitejs/plugin-react`: ^6.1.1
* `tailwindcss`: ^4.3.3
* `@tailwindcss/vite`: ^4.3.3
* `vitest`: ^5.0.1
* `oxlint`: ^1.81.0

**Core Libraries:**
* `react` & `react-dom`: ^19.2.8
* `react-router-dom`: ^7.18.4
* `firebase`: ^11.10.0 (Client SDK)
* `zustand`: ^5.0.15 (State management)

**UI & Styling:**
* `lucide-react`: ^1.47.0 (Icons)
* `vaul`: ^1.1.2 (Drawer components)
* `framer-motion`: ^13.4.0 (Animations)
* `sonner`: ^2.0.8 (Toast notifications)
* `clsx`: ^2.1.1 & `tailwind-merge`: ^3.7.0 (CSS class utility)
* `react-day-picker`: ^10.0.1
* `canvas-confetti`: ^1.9.4

**Data Visualization & Export:**
* `chart.js`: ^4.5.1
* `react-chartjs-2`: ^5.3.1
* `html2canvas-pro`: ^2.4.3 (For capturing receipts/ledger)
* `jspdf`: ^4.2.1

**Utilities:**
* `date-fns`: ^4.4.0
* `dompurify`: ^3.4.16
* `uuid`: ^14.0.2
* `vite-plugin-pwa`: ^1.3.0 (Progressive Web App support)
