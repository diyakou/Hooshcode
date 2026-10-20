import { execFileSync } from 'child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const USER_ENVIRONMENT_KEY = 'HKCU\\Environment';

function readUserPath(): string {
  try {
    const output = execFileSync('reg.exe', ['query', USER_ENVIRONMENT_KEY, '/v', 'Path'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return output.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im)?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

function addToUserPath(binDirectory: string): void {
  const userPath = readUserPath();
  const entries = userPath.split(';').filter(Boolean);
  if (entries.some((entry) => path.resolve(entry) === path.resolve(binDirectory))) {
    return;
  }

  const updatedPath = [...entries, binDirectory].join(';');
  execFileSync(
    'reg.exe',
    ['add', USER_ENVIRONMENT_KEY, '/v', 'Path', '/t', 'REG_EXPAND_SZ', '/d', updatedPath, '/f'],
    { windowsHide: true }
  );
}

export async function installWindowsCli(
  resourcesPath: string,
  userDataPath: string
): Promise<void> {
  if (process.platform !== 'win32') return;

  const executable = path.join(resourcesPath, 'bin', 'goose.exe');
  await fs.access(executable);
  const commands = ['houshiar.cmd', 'goose.cmd'] as const;

  const binDirectory = path.join(userDataPath, 'bin');
  await fs.mkdir(binDirectory, { recursive: true });
  await Promise.all(
    commands.map(async (name) => {
      const destination = path.join(binDirectory, name);
      const temporary = `${destination}.new`;
      const command = `@echo off\r\n"${executable}" %*\r\n`;
      await fs.writeFile(temporary, command, 'utf8');
      await fs.rename(temporary, destination).catch(async () => {
        await fs.unlink(destination).catch(() => undefined);
        await fs.rename(temporary, destination);
      });
    })
  );

  addToUserPath(binDirectory);
}
