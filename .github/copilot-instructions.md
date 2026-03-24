# AI Coding Agent Instructions

## Architecture Overview

This is a Cloudflare Workers-based AI chat agent built with the `agents` framework. The application consists of:

- **Frontend**: React app with custom component library (`src/components/`)
- **Backend**: Cloudflare Worker using Durable Objects for state management
- **Tool System**: Dual-mode tools (auto-executing vs. human confirmation required)
- **AI Integration**: Configurable AI providers via AI SDK (currently Volcano Engine Ark)

## Key Components

### Core Files

- `src/server.ts`: Main agent logic extending `AIChatAgent`
- `src/app.tsx`: React chat interface with real-time streaming
- `src/tools.ts`: Tool definitions and executions
- `src/utils.ts`: Message processing utilities

### Tool System Pattern

Tools are defined in two ways:

1. **Auto-executing**: Include `execute` function in tool definition
2. **Confirmation-required**: No `execute` function, handled in `executions` object

```typescript
// Auto-executing tool
const getLocalTime = tool({
  description: "get the local time",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    /* logic */
  }
});

// Confirmation-required tool
const getWeatherInformation = tool({
  description: "show weather",
  inputSchema: z.object({ city: z.string() })
  // No execute = requires confirmation
});

// Execution logic in separate object
export const executions = {
  getWeatherInformation: async ({ city }) => {
    /* confirmed logic */
  }
};
```

**Critical**: Keep `toolsRequiringConfirmation` array in `app.tsx` synchronized with tools lacking `execute` functions.

### Message Processing

- Use `processToolCalls()` utility for handling human-in-the-loop confirmations
- Messages flow through `cleanupMessages()` before AI processing
- Approval responses use constants from `shared.ts`: `APPROVAL.YES` / `APPROVAL.NO`

### AI Provider Configuration

Currently configured for Volcano Engine Ark:

```typescript
const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "compatible"
});
```

### Development Workflow

**Local Development**:

```bash
npm start  # Runs Vite dev server
```

**Testing**:

```bash
npm test   # Vitest with Cloudflare Workers test environment
```

**Deployment**:

```bash
npm run deploy  # Builds and deploys to Cloudflare
```

**Code Quality**:

```bash
npm run check  # Prettier + Biome linting + TypeScript
```

### Project Conventions

- **Import Aliases**: Use `@/` for `src/` directory
- **Component Structure**: Custom components in `src/components/{component}/Component.tsx`
- **Styling**: Tailwind CSS with dark/light theme support
- **State Management**: Durable Objects with embedded SQLite for agent state
- **Error Handling**: Console logging with user-friendly error messages

### Scheduling System

Supports flexible task scheduling:

- **Scheduled**: Specific date/time
- **Delayed**: Seconds from now
- **Cron**: Recurring patterns

Tasks execute via `executeTask()` method in the agent class.

### Configuration Files

- `wrangler.jsonc`: Worker config with Durable Objects and AI bindings
- `vite.config.ts`: Build config with Cloudflare plugin
- `biome.json`: Linting/formatting rules

### Testing Pattern

Uses Cloudflare's test environment:

```typescript
import { env, createExecutionContext } from "cloudflare:test";
```

## Common Patterns

### Adding New Tools

1. Define tool in `tools.ts` (with or without `execute`)
2. If confirmation required, add to `executions` object
3. Update `toolsRequiringConfirmation` array in `app.tsx`
4. Tool name must match between definition and execution

### UI Components

Follow established patterns in `src/components/`:

- Export default component from `Component.tsx`
- Use class-variance-authority for variants
- Support dark/light themes
- Include proper TypeScript interfaces

### Environment Variables

- `OPENAI_API_KEY`: Required for AI functionality
- Set in `.dev.vars` locally, upload via `wrangler secret bulk .dev.vars`

### Streaming & Real-time Updates

- Use `createUIMessageStream()` for AI responses
- `useAgentChat()` hook manages message state
- Automatic scroll-to-bottom on new messages</content>
  <parameter name="filePath">x:\MyAgent2\shrill-voice-c6a7\.github\copilot-instructions.md
