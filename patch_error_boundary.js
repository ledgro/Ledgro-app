import fs from 'fs';

let content = fs.readFileSync('src/components/ErrorBoundary.jsx', 'utf-8');

// Fix raw error leak, cart wiping, chunkload recovery
const errorBoundaryCode = `import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Ledgro Error Boundary:', error, info);

    // Save in-progress cart just in case
    try {
      const cartState = window.__LEDGRO_CART_STATE__;
      const uid = window.__LEDGRO_UID__;
      const shopId = window.__LEDGRO_SHOPID__;
      if (cartState && cartState.items?.length > 0) {
        localStorage.setItem('ledgro-cart-recovery', JSON.stringify({
          cartState, uid, shopId, savedAt: new Date().toISOString()
        }));
      }
    } catch(e) {}

    // Auto-recover chunk load errors once per session
    if (error.name === 'ChunkLoadError' || error.message.includes('dynamically imported module')) {
      const lastReload = sessionStorage.getItem('ledgro-chunk-reload');
      if (!lastReload || Date.now() - parseInt(lastReload) > 10000) {
        sessionStorage.setItem('ledgro-chunk-reload', Date.now().toString());
        window.location.reload();
      }
    }
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleUnhandledRejection = (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  }

  handleHardReset = () => {
    if (window.confirm("Clear app cache? Unsynced offline data will be lost.")) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (let reg of regs) {
            reg.unregister();
          }
        });
      }
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-50 p-8 text-center" role="alert">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
            An unexpected error occurred. You can return to the dashboard or refresh the app.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
             <button
               onClick={this.handleReset}
               className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold"
             >
               Go to Dashboard
             </button>
             <button
               onClick={() => window.location.reload()}
               className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold"
             >
               Refresh App
             </button>
             <button
               onClick={this.handleHardReset}
               className="text-red-500 text-sm font-semibold mt-4 py-2"
             >
               Clear App Cache
             </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
`;

fs.writeFileSync('src/components/ErrorBoundary.jsx', errorBoundaryCode);
