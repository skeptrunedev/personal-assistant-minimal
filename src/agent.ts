import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, stepCountIs, type ModelMessage } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  provider: new VercelProvider(),
});

const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const model = provider.chat(process.env.MODEL ?? 'anthropic/claude-sonnet-4.5');

const SYSTEM_PROMPT = `You are a personal assistant. The user talks to you in Slack.
You have access to every toolkit they've connected via Composio (Gmail, Calendar, Linear,
Notion, Salesforce, etc). Use them.

If the user asks for something that needs a toolkit they haven't connected yet (or you get
"no connected account" errors), call COMPOSIO_MANAGE_CONNECTIONS with action="add" and the
toolkit slug, then post the returned auth URL to the user as a clickable link.

Rules:
- Be brief. Slack messages over 4 sentences are obnoxious.
- Confirm destructive actions (sending email, moving calendar events) before doing them.
- When the user is ambiguous about which account to use and they have multiple connected, ask.`;

export async function runAgent(
  userId: string,
  history: ModelMessage[]
): Promise<{ messages: ModelMessage[]; reply: string }> {
  const session = await composio.create(userId, { manageConnections: true });
  const tools = await session.tools();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: history,
    tools,
    stopWhen: stepCountIs(20),
  });

  const reply = await result.text;
  const { messages: newMessages } = await result.response;
  return { messages: [...history, ...newMessages], reply };
}
