import 'dotenv/config';
import { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { ModelMessage } from 'ai';
import { runAgent } from './agent.js';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
});

const threads = new Map<string, ModelMessage[]>();

function toSlackMrkdwn(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*');
}

function humanizeTool(slug: string): string {
  return slug.toLowerCase().replace(/_/g, ' ');
}

async function handle(opts: {
  text: string;
  threadKey: string;
  userId: string;
  channel: string;
  thread_ts: string;
  client: WebClient;
}): Promise<void> {
  const { text, threadKey, userId, channel, thread_ts, client } = opts;
  const history = threads.get(threadKey) ?? [];
  history.push({ role: 'user', content: text });

  const placeholder = await client.chat.postMessage({
    channel,
    thread_ts,
    text: '_thinking…_',
  });
  const ts = placeholder.ts!;

  let lastUpdateAt = 0;
  const pushStatus = async (statusText: string): Promise<void> => {
    const now = Date.now();
    if (now - lastUpdateAt < 1000) return;
    lastUpdateAt = now;
    await client.chat.update({ channel, ts, text: statusText }).catch(() => {});
  };

  try {
    const { messages, reply } = await runAgent(userId, threadKey, history, (toolName) => {
      void pushStatus(`_using ${humanizeTool(toolName)}…_`);
    });
    threads.set(threadKey, messages);
    await client.chat.update({
      channel,
      ts,
      text: toSlackMrkdwn(reply) || '(no response)',
    });
  } catch (err) {
    await client.chat.update({
      channel,
      ts,
      text: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

app.event('app_mention', async ({ event, client }) => {
  const thread_ts = event.thread_ts ?? event.ts;
  await handle({
    text: event.text,
    threadKey: thread_ts,
    userId: event.user ?? 'unknown',
    channel: event.channel,
    thread_ts,
    client,
  });
});

app.message(async ({ message, client }) => {
  if (message.subtype || 'bot_id' in message) return;
  if (message.channel_type !== 'im' || !('text' in message) || !message.text) return;
  await handle({
    text: message.text,
    threadKey: message.channel,
    userId: message.user ?? 'unknown',
    channel: message.channel,
    thread_ts: message.thread_ts ?? message.ts,
    client,
  });
});

await app.start();
console.log('Personal assistant listening on Slack');
