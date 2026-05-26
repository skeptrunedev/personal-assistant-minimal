import { Daytona, type Sandbox } from '@daytonaio/sdk';

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY!, _experimental: {} });
const sandboxes = new Map<string, Sandbox>();

const SANDBOX_OPTS = {
  language: 'typescript' as const,
  autoStopInterval: 15,
  autoArchiveInterval: 60,
  autoDeleteInterval: 60 * 8,
};

export async function ensureSandbox(threadKey: string): Promise<Sandbox> {
  const cached = sandboxes.get(threadKey);
  if (cached) {
    await cached.refreshData();
    if (cached.state === 'started') return cached;
    if (cached.state === 'stopped') {
      await cached.start();
      await cached.waitUntilStarted(60);
      return cached;
    }
    sandboxes.delete(threadKey);
  }
  const sandbox = await daytona.create(SANDBOX_OPTS);
  sandboxes.set(threadKey, sandbox);
  return sandbox;
}

export function clearSandbox(threadKey: string): void {
  sandboxes.delete(threadKey);
}
