# OpenJules Roadmap & Development Plan

> **Vision**: Build a "Senior AI Software Engineer" - an autonomous coding agent like Google Jules that understands your codebase, executes tasks, and integrates with your workflow.

---

## Table of Contents
1. [Current State](#current-state)
2. [Vision & Goals](#vision--goals)
3. [Phase 2A: Clone by URL/Key](#phase-2a-clone-by-urlkey)
4. [Phase 2B: Project Mind Map](#phase-2b-project-mind-map)
5. [Phase 2C: Enhanced Chat Experience](#phase-2c-enhanced-chat-experience)
6. [Phase 3: Jira Integration](#phase-3-jira-integration)
7. [Technical Decisions](#technical-decisions)
8. [Architecture Notes](#architecture-notes)
9. [Future Ideas](#future-ideas)

---

## Current State

### Completed (Phase 1)

| Feature | Status | Notes |
|---------|--------|-------|
| 3-Pane UI | Done | Professional layout with collapsible sidebar |
| Multi-Tenant Sessions | Done | Per-user workspaces at `~/.openjules/workspaces/{userId}/{repoName}` |
| Auth System | Done | JWT + bcrypt with SQLite/Prisma |
| GitHub OAuth | Done | Connect GitHub, list repos, clone |
| Context Isolation | Done | Agent instances cleared on repo/branch switch |
| Approval System | Done | Dangerous commands (shell, write, edit) require approval |
| Chat Interface | Done | Markdown, collapsible tool calls, streaming updates |
| Codebase Investigator | Done | Sub-agent for deep code analysis |

### Architecture
```
apps/
├── web/                    # React + Vite frontend
│   ├── components/
│   │   ├── layout/        # ThreePaneLayout, Sidebar, ChatSidebar
│   │   └── features/      # ChatBot, RepoSelector, TaskList
│   ├── pages/             # Dashboard, Login, Register, Settings
│   └── lib/               # AuthContext, SessionContext, session API
│
├── server/                 # Express backend
│   ├── services/          # SessionManager, AuthService, GitHubService, JobManager
│   ├── llm/               # AgentService (Gemini integration)
│   └── prisma/            # SQLite schema (User, Session, Task)
│
└── packages/
    └── agent-core/        # Tool registry, codebase investigator, memory system
```

---

## Vision & Goals

### Core Experience
1. **Workspace Management**: Users create workspaces, add multiple repos (OAuth OR URL/key)
2. **Intelligent Context**: Auto-build "mind map" on clone, update as tasks progress
3. **Full Chat Integration**: Terminal in chat, file attachments, code display
4. **Jira Integration**: Auto-plan from tickets, background execution
5. **Senior Engineer Behavior**: Understands context, makes smart decisions, asks clarifying questions

### User Flow
```
Login → Create Workspace → Add Repo (OAuth or URL) → AI Analyzes Codebase
                                    ↓
                          Project Mind Map Created
                                    ↓
              Chat with AI → Execute Tasks → Approve Dangerous Actions
                                    ↓
                          Mind Map Updated → Context Persists
```

---

## Phase 2A: Clone by URL/Key

### Goal
Allow users to clone repos via URL without GitHub OAuth. Support public repos, private repos with PAT, and SSH key auth.

### User Story
> As a user, I want to clone any Git repo by URL so I don't have to connect my GitHub account.

### Implementation

#### 1. Prisma Schema Updates
```prisma
model Session {
  // Existing fields...

  // New fields for clone method
  cloneMethod       String    @default("oauth")  // 'oauth' | 'https' | 'ssh'
  credentialType    String?   // 'pat' | 'ssh_key' | null
  encryptedCredential String? // Encrypted PAT or SSH key reference
}
```

#### 2. Server API
```
POST /api/clone-url
Body: {
  url: string,           // Git URL (HTTPS or SSH)
  authType: 'none' | 'pat' | 'ssh',
  credential?: string    // PAT or SSH key content
}
Response: {
  sessionId: string,
  status: 'cloning'
}
```

#### 3. SessionManager Changes
- `cloneByUrl(userId, url, authType, credential)` - New method
- Validate URL format (HTTPS vs SSH)
- For SSH: Store key in `~/.openjules/ssh/{userId}/{keyId}`
- Encrypt credentials using existing AES-256
- Create session and trigger clone

#### 4. Frontend UI
```
RepoSelector
├── Tab: "GitHub" (existing OAuth flow)
└── Tab: "Clone URL" (new)
    ├── URL input
    ├── Auth type dropdown: None | PAT | SSH Key
    ├── Credential input (conditional)
    └── Clone button
```

### Files to Modify
- [ ] `apps/server/prisma/schema.prisma` - Add clone fields
- [ ] `apps/server/src/services/SessionManager.ts` - Add `cloneByUrl()`
- [ ] `apps/server/src/index.ts` - Add `/api/clone-url` endpoint
- [ ] `apps/web/src/components/features/RepoSelector.tsx` - Add tabbed UI
- [ ] `apps/web/src/lib/session.ts` - Add `cloneByUrl()` API call

### Testing Checklist
- [ ] Clone public repo via HTTPS URL
- [ ] Clone private repo with PAT
- [ ] Clone with SSH key
- [ ] Session created correctly
- [ ] Repo cloned to correct workspace path
- [ ] Can switch between OAuth and URL-cloned repos
- [ ] Error handling for invalid URLs/credentials

---

## Phase 2B: Project Mind Map

### Goal
Auto-analyze repos after cloning to build an internal "understanding" that the AI uses for context. Users can view and edit this understanding.

### User Story
> As a user, I want the AI to automatically understand my codebase structure so it can give better answers without me explaining everything.

### Implementation

#### 1. ProjectAnalyzer Service
```typescript
// apps/server/src/services/ProjectAnalyzer.ts
interface ProjectContext {
  overview: string;           // High-level description
  architecture: string;       // Architecture patterns
  keyFiles: {
    path: string;
    purpose: string;
  }[];
  techStack: string[];        // Languages, frameworks, tools
  patterns: string[];         // Code patterns, conventions
  entryPoints: string[];      // Main files, CLI commands
  dependencies: {
    name: string;
    purpose: string;
  }[];
  lastAnalyzed: string;       // ISO timestamp
}
```

#### 2. Analysis Trigger
- After clone completes (`status: 'ready'`)
- Run codebase investigator with structured prompt
- Parse output into `ProjectContext`
- Store in `Session.projectContext` (JSON)
- Write to `.openjules/PROJECT_CONTEXT.md` in workspace

#### 3. Context Injection
- On agent init, load `projectContext` from session
- Inject into system prompt
- After task completes, trigger incremental update

#### 4. Editable UI
```
Sidebar
├── Codebases list
├── [NEW] "Project Understanding" button per codebase
│   └── Opens modal/drawer with:
│       ├── Markdown editor
│       ├── Rendered preview
│       ├── Save button
│       └── "Re-analyze" button
└── History list
```

### Files to Create/Modify
- [ ] `apps/server/src/services/ProjectAnalyzer.ts` - NEW
- [ ] `apps/server/src/services/SessionManager.ts` - Trigger analysis
- [ ] `apps/server/prisma/schema.prisma` - Add `projectContext` field
- [ ] `apps/server/src/llm/AgentService.ts` - Inject context
- [ ] `apps/web/src/components/features/ProjectContext.tsx` - NEW
- [ ] `apps/web/src/components/layout/Sidebar.tsx` - Add button

### Testing Checklist
- [ ] Analysis runs after clone completes
- [ ] PROJECT_CONTEXT.md created in workspace
- [ ] Context viewable in UI
- [ ] Context editable and saves
- [ ] Context loaded in agent prompts
- [ ] Switching repos loads correct context
- [ ] Re-analyze button works

---

## Phase 2C: Enhanced Chat Experience

### Goal
Improve chat with file attachments, better terminal output display, and workspace file browser.

### Features

#### 1. File Tree Component
```
┌─────────────────────────────────┐
│ Files                    [+] [-]│
├─────────────────────────────────┤
│ ▼ src/                          │
│   ├── components/               │
│   │   └── Button.tsx            │
│   ├── pages/                    │
│   └── index.ts                  │
│ ▼ tests/                        │
│   └── button.test.ts            │
│   package.json                  │
└─────────────────────────────────┘
```
- Click file to view
- Drag to chat to attach
- Search/filter files

#### 2. Attachments in Chat
- Drag-drop files into chat input
- Shows file chip with name
- Click to expand/preview
- Included in agent context

#### 3. Terminal Improvements
- Better shell output styling (dark terminal look)
- Copy button for commands/output
- Syntax highlighting for code in output
- Collapsible long outputs

### Files to Create/Modify
- [ ] `apps/web/src/components/features/FileTree.tsx` - NEW
- [ ] `apps/web/src/components/features/ChatBot.tsx` - Add attachments
- [ ] `apps/server/src/index.ts` - File content API
- [ ] `apps/web/src/components/features/TerminalOutput.tsx` - NEW

---

## Phase 3: Jira Integration

### Goal
Connect Jira to import tickets, auto-generate execution plans, and run tasks in background.

### User Story
> As a developer, I want to import a Jira ticket and have the AI create and execute a plan automatically.

### Implementation

#### 1. Jira Connection
- OAuth or API token auth
- Store encrypted credentials
- List projects, boards, tickets

#### 2. Ticket Import Flow
```
User clicks "Import from Jira"
    ↓
Browse/search tickets
    ↓
Select ticket → AI reads description, acceptance criteria
    ↓
AI generates step-by-step execution plan
    ↓
User reviews and approves plan
    ↓
Tasks execute in background with status updates
```

#### 3. Execution Plan UI
```
┌─────────────────────────────────────────┐
│ Execution Plan for PROJ-123             │
├─────────────────────────────────────────┤
│ □ 1. Analyze current implementation     │
│ □ 2. Create new component structure     │
│ □ 3. Implement business logic           │
│ □ 4. Add unit tests                     │
│ □ 5. Update documentation               │
├─────────────────────────────────────────┤
│ [Approve & Run]  [Edit Plan]  [Cancel]  │
└─────────────────────────────────────────┘
```

### Files to Create
- [ ] `apps/server/src/services/JiraService.ts`
- [ ] `apps/web/src/components/features/JiraImport.tsx`
- [ ] `apps/web/src/components/features/ExecutionPlan.tsx`
- [ ] `apps/server/prisma/schema.prisma` - JiraConnection model

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Clone Auth | HTTPS+PAT & SSH | Full flexibility for all users |
| Mind Map Storage | DB + File | Fast access (DB) + persistence (file) |
| Mind Map Visibility | Editable | Users can correct AI's understanding |
| Real-time Updates | Polling (1.5s) | WebSocket deferred to later phase |
| Credential Encryption | AES-256-CBC | Reuse existing pattern in GitHubService |

---

## Architecture Notes

### Session Lifecycle
```
User Login
    ↓
Create/Select Workspace
    ↓
Add Repo (OAuth or URL)
    ↓
Clone starts (status: 'cloning')
    ↓
Clone complete (status: 'ready')
    ↓
[NEW] Project analysis runs
    ↓
Mind map stored
    ↓
Ready for chat
```

### Context Flow
```
User switches to Repo A
    ↓
SessionManager loads Session A
    ↓
Agent instance for Session A cleared (if exists)
    ↓
New Agent created with:
  - projectContext from Session A
  - workspacePath from Session A
  - Conversation history from Session A
    ↓
User chats → Agent has full context
```

### Tool Approval Flow
```
Agent wants to run shell command
    ↓
Check if tool in TOOLS_REQUIRING_APPROVAL
    ↓
If yes: Create ApprovalRequest, pause job
    ↓
UI shows approval buttons
    ↓
User approves → Resume job, execute tool
User rejects → Fail job with rejection message
```

---

## Future Ideas

### Short Term (Phase 2)
- [ ] Model switching (per-task or per-session)
- [ ] Conversation branching (fork from any message)
- [ ] Export chat as markdown/PDF

### Medium Term (Phase 3-4)
- [ ] PR creation and review
- [ ] CI/CD integration (GitHub Actions, Jenkins)
- [ ] Slack/Discord notifications
- [ ] Team workspaces (shared repos)

### Long Term
- [ ] Self-improving agent (learns from corrections)
- [ ] Custom tool definitions
- [ ] Plugin system
- [ ] IDE extension (VS Code, JetBrains)

---

## Changelog

| Date | Phase | Changes |
|------|-------|---------|
| 2024-01-XX | 1.0 | Initial foundation - 3-pane UI, auth, sessions |
| 2024-01-XX | 2A | Clone by URL/Key (in progress) |

---

## References

- [Google Jules](https://jules.google.com) - Inspiration
- [Gemini CLI](https://github.com/anthropics/gemini-cli) - Codebase reference
- [Agent-Core Package](./packages/agent-core/) - Tool registry, memory system
