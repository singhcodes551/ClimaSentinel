# ClimaSentinel — Frontend Client

This directory contains the frontend client application for **ClimaSentinel**, a web-based weather and climate anomaly detection platform.

For complete project documentation, system architecture, detection methodology, and installation instructions, please refer to the primary repository [README.md](../README.md).

---

## Technology Stack

- **Framework:** React 19 (TypeScript)
- **Build Tool:** Vite 8
- **Styling:** Tailwind CSS v4
- **Visualization:** Recharts
- **Iconography:** Lucide React
- **Linter:** Oxlint

---

## Local Development Setup

Ensure Node.js (v18+) is installed.

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start local development server (proxies /api to http://127.0.0.1:8000)
npm run dev
```

The application will be accessible at: `http://localhost:5173`

---

## Available Scripts

- `npm run dev` — Starts the local Vite development server with Hot Module Replacement (HMR).
- `npm run build` — Type-checks with TypeScript (`tsc -b`) and generates optimized production bundle in `dist/`.
- `npm run lint` — Runs fast static analysis via Oxlint.
- `npm run preview` — Previews the production build locally.
