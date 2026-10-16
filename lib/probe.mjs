import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import providers from './providers.mjs';

export async function probe(providerIds, { cwd = process.cwd(), timeoutMs = 5000, maxOutput = 16384, catalog = providers } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive integer');
  if (!Number.isSafeInteger(maxOutput) || maxOutput <= 0) throw new TypeError('maxOutput must be a positive integer');
  return Promise.all(providerIds.map((id) => new Promise((done) => {
    const provider = Object.hasOwn(catalog, id) ? catalog[id] : undefined;
    const install = provider?.install?.[process.platform] ?? provider?.install?.any ?? null;
    const result = (ok, version, diagnostic) => ({ id, ok, version, missing_install: ok ? null : install, ...(diagnostic ? { diagnostic } : {}) });
    const argv = provider?.probe;
    if (!Array.isArray(argv) || !argv.length || argv.some((arg) => typeof arg !== 'string' || arg.includes('\0')) || !argv[0]) {
      done(result(false, null, 'unknown provider or invalid probe argv'));
      return;
    }
    let child;
    let timer;
    let settled = false;
    let bytes = 0;
    const stdout = [];
    const stderr = [];
    const finish = (ok, diagnostic) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = Buffer.concat(stdout.length ? stdout : stderr).toString('utf8').trim();
      done(result(ok, ok && provider.version !== false ? output.split(/\r?\n/)[0] || null : null, diagnostic));
    };
    const stop = (diagnostic) => {
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      finish(false, diagnostic);
    };
    try {
      const bin = provider.local ? resolve(cwd, argv[0]) : argv[0];
      child = spawn(bin, argv.slice(1), { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      finish(false, 'unable to start probe');
      return;
    }
    timer = setTimeout(() => stop('probe timeout'), timeoutMs);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      stream.on('data', (chunk) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > maxOutput) stop('probe output limit exceeded');
        else chunks.push(chunk);
      });
    }
    child.on('error', (error) => finish(false, `probe ${error.code ?? 'spawn error'}`));
    child.on('close', (code, signal) => {
      const output = Buffer.concat(stdout).toString('utf8');
      if (code === 0 && provider.outputIncludes && !output.includes(provider.outputIncludes)) {
        finish(false, 'unexpected binary identity');
      } else finish(code === 0, code === 0 ? undefined : `probe exit ${code ?? signal}`);
    });
  })));
}
