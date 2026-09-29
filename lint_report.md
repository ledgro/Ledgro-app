# Codebase Scan Report

I have scanned the repository for issues, errors, unfinished code, and unused junk using `oxlint` (the project's configured linter).

Below is the summary of the identified issues:

### Unused Imports & Variables (Junk)
- **`src/pages/ShopSetup.jsx`**: Unused imports `doc`, `getDoc`, `updateDoc`.
- **`src/firebase.js`**: `appCheck` variable is declared and assigned but never read.
- **`src/pages/Settings.jsx`**: Unused import `broadcastSessionTerminated` and unused function `handleThemeChange`.
- **`src/pages/PLScreen.jsx`**: `user` variable is extracted from context but never used. Unused catch parameter `_err`.
- **`src/pages/Dashboard.jsx`**: Several unused state variables (`alerts`, `setAlerts`, `varianceLogs`, `setVarianceLogs`). Unused catch parameter `_err`.
- **`src/pages/Members.jsx`**: Unused parameter `b` in sort function, and several unused `_err` parameters in catch blocks. Unused `updateSW` variable in `main.jsx`.
- **`src/components/SearchInput.jsx`**: Unused `useNavigate` import in `POS.jsx`.

### React Hook Warnings
- **`react(set-state-in-effect)`**: There are several instances across `Dashboard.jsx`, `SignIn.jsx`, `Ledger.jsx`, and `SearchInput.jsx` where state is being updated synchronously within a `useEffect`. While often used for data-fetching, this can trigger cascading re-renders and should ideally be optimized or explicitly suppressed if intentional.
- **`react(immutability)`**: In `src/pages/Members.jsx` (line 54), `autoElevateAdmin` is being called while its declaration is still being initialized (recursive callback issue).
- **`react-hooks(exhaustive-deps)`**: In `src/pages/POS.jsx` (line 131), a `useMemo` hook has an unnecessary dependency (`state.items.length`).

### Unfinished/Broken Code Errors
- **`src/pages/POS.jsx`**: Contains several `react(jsx-no-undef)` errors indicating missing imports or undefined components: `AnimatePresence`, `motion`, `animated`, and `Drawer`.
- **`src/pages/Members.jsx` & `src/main.jsx`**: Contains scattered `console.log` statements that should ideally be removed or changed to `console.info`/`console.warn` for production builds.

You can run `npx oxlint --react-plugin` to view the full detailed output at any time.

I have placed this report in `lint_report.md` in the root of the repository so you can easily pull it and share it with your AI agent.
