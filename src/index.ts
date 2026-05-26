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

async function handle(opts: {
  text: string;
  threadKey: string;
  userId: string;
  channel: string;
  thread_ts?: string;
  client: WebClient;
}): Promise<void> {
  const { text, threadKey, userId, channel, thread_ts, client } = opts;
  const history = threads.get(threadKey) ?? [];
  history.push({ role: 'user', content: text });

  const placeholder = await client.chat.postMessage({
    channel,
    ...(thread_ts && { thread_ts }),
    text: '_thinking…_',
  });
  const ts = placeholder.ts!;

  try {
    const { messages, reply } = await runAgent(userId, threadKey, history);
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
  await handle({
    text: event.text,
    threadKey: event.thread_ts ?? event.ts,
    userId: event.user ?? 'unknown',
    channel: event.channel,
    thread_ts: event.ts,
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
    client,
  });
});

await app.start();
console.log('Personal assistant listening on Slack');
