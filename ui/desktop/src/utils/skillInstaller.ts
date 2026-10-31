import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, ipcMain } from 'electron';

const execFileAsync = promisify(execFile);

ipcMain.handle('skills-install', async (_event, source: string) => {
  if (typeof source !== 'string') {
    throw new Error('Enter a skills repository URL or owner/repo.');
  }
  const cleanSource = source.trim().replace(/^npx\s+(?:--yes\s+|-y\s+)?skills\s+add\s+/, '');
  if (!/^(?:https:\/\/github\.com\/)?[\w.-]+\/[\w.-]+(?:\/[\w./@%-]+)?\/?$/.test(cleanSource)) {
    throw new Error('Enter a GitHub URL, owner/repo, or npx skills add owner/repo.');
  }

  const args = ['--yes', 'skills', 'add', cleanSource, '--global', '--agent', 'codex', '--yes'];
  const isWindows = process.platform === 'win32';
  try {
    await execFileAsync(
      isWindows ? 'powershell.exe' : 'npx',
      isWindows
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '& npx.cmd --yes skills add $env:GOOSE_SKILL_SOURCE --global --agent codex --yes; exit $LASTEXITCODE',
          ]
        : args,
      {
        cwd: app.getPath('home'),
        env: { ...process.env, GOOSE_SKILL_SOURCE: cleanSource },
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (error) {
    const failure = error as Error & { code?: string; stderr?: string; stdout?: string };
    if (failure.code === 'ENOENT') {
      throw new Error('Skill installation requires Node.js and npm/npx on PATH.');
    }
    throw new Error(failure.stderr?.trim() || failure.stdout?.trim() || failure.message);
  }
});
