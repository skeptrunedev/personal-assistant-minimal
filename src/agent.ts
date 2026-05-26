import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, stepCountIs, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { ensureSandbox } from './sandbox.js';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  provider: new VercelProvider(),
});

const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const model = provider.chat(process.env.MODEL ?? 'anthropic/claude-sonnet-4.5');

const SYSTEM_PROMPT = `You are a personal assistant. The user talks to you in Slack.
You have access to every toolkit they've connected via Composio (Gmail, Calendar, Linear,
Notion, Salesforce, etc). Use them.

You also have a Linux sandbox (Daytona) with Python, Node, and git pre-installed.
Use \`bash\` to run shell commands, \`read_file\` and \`write_file\` for files.
Useful for parsing data, doing computations, running scripts on Composio output.

If the user asks for something that needs a toolkit they haven't connected yet (or you get
"no connected account" errors), call COMPOSIO_MANAGE_CONNECTIONS with action="add" and the
toolkit slug, then post the returned auth URL to the user as a clickable link.

Rules:
- Be brief. Slack messages over 4 sentences are obnoxious.
- Confirm destructive actions (sending email, moving calendar events) before doing them.
- When the user is ambiguous about which account to use and they have multiple connected, ask.`;

function buildSandboxTools(threadKey: string) {
  return {
    bash: tool({
      description:
        'Run a shell command in your sandbox. Returns exitCode and combined output.',
      inputSchema: z.object({
        command: z.string().describe('Shell command to run.'),
        cwd: z.string().optional().describe('Working directory.'),
      }),
      execute: async ({ command, cwd }) => {
        const sandbox = await ensureSandbox(threadKey);
        const res = await sandbox.process.executeCommand(command, cwd);
        return { exitCode: res.exitCode, output: res.result };
      },
    }),
    read_file: tool({
      description: 'Read a UTF-8 file from the sandbox.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const sandbox = await ensureSandbox(threadKey);
        const buf = await sandbox.fs.downloadFile(path);
        return { content: buf.toString('utf8') };
      },
    }),
    write_file: tool({
      description: 'Write a UTF-8 file to the sandbox. Creates parent dirs if needed.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        const sandbox = await ensureSandbox(threadKey);
        await sandbox.fs.uploadFile(Buffer.from(content, 'utf8'), path);
        return { ok: true };
      },
    }),
  };
}

export async function runAgent(
  userId: string,
  threadKey: string,
  history: ModelMessage[]
): Promise<{ messages: ModelMessage[]; reply: string }> {
  const session = await composio.create(userId, { manageConnections: true });
  const composioTools = await session.tools();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: history,
    tools: { ...composioTools, ...buildSandboxTools(threadKey) },
    stopWhen: stepCountIs(20),
  });

  const reply = await result.text;
  const { messages: newMessages } = await result.response;
  return { messages: [...history, ...newMessages], reply };
}
