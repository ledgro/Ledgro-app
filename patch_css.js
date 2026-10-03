import fs from 'fs';

let css = fs.readFileSync('src/index.css', 'utf-8');

// Combine theme blocks, fix font-variant-numeric, safe area inset, color schemes, remove aggressive overscroll blocking causing input hide
css = `@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme {
  --color-primary: #2563EB;
  --color-primary-dark: #1D4ED8;
  --color-success: #10B981;
  --radius-card: 12px;
  --radius-sheet: 24px;
  --shadow-subtle: 0 4px 6px -1px rgb(0 0 0 / 0.05);
  --font-bruno: "Bruno Ace", sans-serif;
}

@utility pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

@layer base {
  :root {
    --color-bg-base: #F8FAFC;
    --color-bg-surface: #FFFFFF;
    --color-text-main: #0F172A;
    --color-text-muted: #64748B;
  }

  [data-theme="dark"] {
    color-scheme: dark;
    --color-bg-base: #020617;
    --color-bg-surface: #0F172A;
    --color-text-main: #E2E8F0;
    --color-text-muted: #94A3B8;
  }

  body {
    background-color: var(--color-bg-base);
    color: var(--color-text-main);
    overscroll-behavior-y: none;
    height: 100dvh;
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  }

  /* Scoped to classes that explicitly need tabular nums instead of universal */
  .tabular-nums-money {
    font-variant-numeric: tabular-nums;
  }
}

@layer utilities {
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
`;

fs.writeFileSync('src/index.css', css);
