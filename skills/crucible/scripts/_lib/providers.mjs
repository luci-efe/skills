import { readFileSync } from 'node:fs';

export const providers = JSON.parse(readFileSync(new URL('./providers.json', import.meta.url), 'utf8'));
export default providers;

export function installCommand(id, platform = process.platform) {
  const install = Object.hasOwn(providers, id) ? providers[id].install : undefined;
  return install?.[platform] ?? install?.any ?? null;
}
