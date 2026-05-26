import { Daytona, type Sandbox } from '@daytonaio/sdk';

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY!, _experimental: {} });
const sandboxes = new Map<string, Sandbox>();

export async function ensureSandbox(threadKey: string): Promise<Sandbox> {
  const cached = sandboxes.get(threadKey);
  if (cached) return cached;
  const sandbox = await daytona.create({
    language: 'typescript',
    autoStopInterval: 15,
    autoArchiveInterval: 60,
  });
  sandboxes.set(threadKey, sandbox);
  return sandbox;
}

export function clearSandbox(threadKey: string): void {
  sandboxes.delete(threadKey);
}
