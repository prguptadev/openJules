# OpenJules

Enterprise-grade autonomous software engineering agent.

## Structure
- `apps/server`: Node.js Express server with Async Job Queue.
- `apps/web`: React/Vite/Tailwind frontend.
- `packages/agent-core`: Extracted and shimmed `gemini-cli` logic.
- `packages/shared`: Shared types and constants.

## Setup
```bash
npm install
npm run build
```

## Running
### Server
```bash
cd apps/server
npm run dev
```

### Web
```bash
cd apps/web
npm run dev
```

## Features Built
- [x] **Monorepo Architecture**
- [x] **Headless Agent Core** (Extracted from Gemini-CLI)
- [x] **Async Job Queue** (Fire-and-forget execution)
- [x] **Guardrail Interceptor** (Human-in-the-loop safety for dangerous commands)
- [x] **REST API** for task management
