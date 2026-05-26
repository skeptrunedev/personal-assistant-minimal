# personal-assistant-minimal

A personal AI assistant that lives in your Slack DMs. **127 lines of TypeScript.**

It uses [Composio](https://composio.dev) for every third-party integration (Gmail, Calendar, Linear, Notion, Salesforce, etc.), [OpenRouter](https://openrouter.ai) for the model, and the [Vercel AI SDK](https://ai-sdk.dev) for the loop.

## Setup

### 1. Install

```bash
git clone <this repo>
cd personal-assistant-minimal
npm install
cp .env.example .env
```

### 2. Get an OpenRouter API key

Sign up at https://openrouter.ai and grab a key. Put it in `OPENROUTER_API_KEY`.

### 3. Get a Composio API key

Sign up at https://app.composio.dev. Copy your API key into `COMPOSIO_API_KEY`.

You don't need to connect anything yet. The bot uses your Slack user ID as your Composio user ID and asks for OAuth on the fly — DM it "connect linear" or just ask it to do something with Linear and it'll send you an auth URL.

### 4. Create your Slack app

Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**. Paste the contents of [`slack-manifest.json`](./slack-manifest.json). Install it to your workspace.

- Copy the **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`.
- Under **Basic Information → App-Level Tokens**, create a token with the `connections:write` scope. Copy it (`xapp-…`) → `SLACK_APP_TOKEN`.

### 5. Run

```bash
npm start
```

DM the bot, or `@mention` it in any channel it's been invited to. That's it.

## How it works

[`src/agent.ts`](./src/agent.ts) is the loop. It creates a Composio session, asks Composio for every tool you've connected, and hands them to `streamText`. The model decides what to call.

[`src/index.ts`](./src/index.ts) is the Slack frontend. It maintains a per-thread message history in a `Map`, routes `app_mention` and DM events to the agent (passing the Slack `user` ID as the Composio user ID), and posts the reply back.

OAuth happens via `manageConnections: true` on `composio.create()` — the SDK exposes a `COMPOSIO_MANAGE_CONNECTIONS` tool to the model, and the system prompt tells it to invoke that tool with `action="add"` whenever it needs a toolkit you haven't connected. The model surfaces the resulting URL in Slack; you click; you're connected.

## Want to use Telegram instead of Slack?

Replace `src/index.ts` with a Telegram bot. Ask your coding agent: *"Rewrite src/index.ts as a Telegram bot using the [grammY](https://grammy.dev/) library. Keep the same per-thread history Map, but key it on chat ID. Listen to text messages, ignore commands, route everything to `runAgent`."* The agent.ts file doesn't change at all.

## What's not in here

This repo is intentionally tiny. If you want to scale it up:

- **Multi-user.** Replace the hard-coded `USER_ID` with the Slack `user_id` of the message author. Composio scopes connected accounts by user ID, so each Slack user gets their own connected apps.
- **Persistent history.** The `threads` Map dies with the process. Swap it for Redis, Postgres, or a JSON file.
- **Permission gating.** Right now the model can send emails without asking. To gate destructive calls, wrap each tool's `execute` to require user confirmation. (We do this in [Mintlify's production agent](https://www.mintlify.com/use-cases/personal-assistant).)
- **Better account selection.** If you have two Gmail accounts connected, the model may pick the wrong one. Pass `multiAccount: { enable: true, requireExplicitSelection: true }` to `composio.create()` and tell the model in the system prompt which account IDs are legal.
