# Telehealth AI Frontend

The frontend is a React and TypeScript application served by Vite. It provides
separate navigation and workflows for administrators, clinicians, and patients.
All live requests pass through the `src/api` facade to the Spring Boot API;
provider credentials never enter the browser bundle.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development
server proxies `/api` to Spring on `http://127.0.0.1:8091`.

## Verification

```bash
npm run lint
npm run build
```

The production build includes TypeScript checking.
