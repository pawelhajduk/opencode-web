import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_NAME = '@openchamber/web';
const GITHUB_REPO = 'pawelhajduk/opencode-web';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Detect which package manager was used to install this package.
 * Strategy:
 * 1. Check npm_config_user_agent (set during npm/pnpm/yarn/bun install)
 * 2. Check npm_execpath for PM binary path
 * 3. Analyze package location path for PM-specific patterns
 * 4. Fall back to npm
 */
export function detectPackageManager() {
  // Strategy 1: Check user agent (most reliable during install)
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  if (userAgent.startsWith('npm')) return 'npm';

  // Strategy 2: Check execpath
  const execPath = process.env.npm_execpath || '';
  if (execPath.includes('pnpm')) return 'pnpm';
  if (execPath.includes('yarn')) return 'yarn';
  if (execPath.includes('bun')) return 'bun';

  // Strategy 3: Analyze package location for PM-specific patterns
  try {
    const pkgPath = path.resolve(__dirname, '..', '..');
    if (pkgPath.includes('.pnpm')) return 'pnpm';
    if (pkgPath.includes('/.yarn/') || pkgPath.includes('\\.yarn\\')) return 'yarn';
    if (pkgPath.includes('/.bun/') || pkgPath.includes('\\.bun\\')) return 'bun';
  } catch {
    // Ignore path resolution errors
  }

  // Strategy 4: Check which PM binaries are available and preferred
  const pmChecks = [
    { name: 'pnpm', check: () => isCommandAvailable('pnpm') },
    { name: 'yarn', check: () => isCommandAvailable('yarn') },
    { name: 'bun', check: () => isCommandAvailable('bun') },
  ];

  for (const { name, check } of pmChecks) {
    if (check()) {
      // Verify this PM actually has the package installed globally
      if (isPackageInstalledWith(name)) {
        return name;
      }
    }
  }

  return 'npm';
}

function isCommandAvailable(command) {
  try {
    const result = spawnSync(command, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function isPackageInstalledWith(pm) {
  try {
    let args;
    switch (pm) {
      case 'pnpm':
        args = ['list', '-g', '--depth=0', PACKAGE_NAME];
        break;
      case 'yarn':
        args = ['global', 'list', '--depth=0'];
        break;
      case 'bun':
        args = ['pm', 'ls', '-g'];
        break;
      default:
        args = ['list', '-g', '--depth=0', PACKAGE_NAME];
    }

    const result = spawnSync(pm, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });

    if (result.status !== 0) return false;
    return result.stdout.includes(PACKAGE_NAME) || result.stdout.includes('openchamber');
  } catch {
    return false;
  }
}

/**
 * Get the update command for the detected package manager
 */
export async function getUpdateCommand(pm = detectPackageManager()) {
  const tarballUrl = await getLatestReleaseTarballUrl();
  if (!tarballUrl) {
    throw new Error('Unable to fetch latest release tarball URL from GitHub');
  }
  return `bun add -g ${tarballUrl}`;
}

/**
 * Get current installed version from package.json
 */
export function getCurrentVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch latest version from GitHub releases API
 */
export async function getLatestVersion() {
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 403 || response.status === 429) {
      // Rate limited
      console.warn('GitHub API rate limit exceeded');
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    const data = await response.json();
    const tagName = data.tag_name || '';
    // Strip 'v' prefix: v1.5.5.1 → 1.5.5.1
    return tagName.replace(/^v/, '') || null;
  } catch (error) {
    console.warn('Failed to fetch latest version from GitHub:', error.message);
    return null;
  }
}

/**
 * Parse semver version to numeric for comparison
 */
function parseVersion(version) {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

/**
 * Get the tarball URL from the latest GitHub release
 */
async function getLatestReleaseTarballUrl() {
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const asset = data.assets?.find((a) => a.name.endsWith('.tgz'));
    return asset?.browser_download_url || null;
  } catch {
    return null;
  }
}

/**
 * Fetch changelog notes from GitHub release body
 */
export async function fetchChangelogNotes(fromVersion, toVersion) {
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    return data.body || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check for updates and return update info
 */
export async function checkForUpdates() {
  const currentVersion = getCurrentVersion();
  const latestVersion = await getLatestVersion();

  if (!latestVersion || currentVersion === 'unknown') {
    return {
      available: false,
      currentVersion,
      error: 'Unable to determine versions',
    };
  }

  const currentNum = parseVersion(currentVersion);
  const latestNum = parseVersion(latestVersion);
  const available = latestNum > currentNum;

  let changelog;
  if (available) {
    changelog = await fetchChangelogNotes(currentVersion, latestVersion);
  }

  return {
    available,
    version: latestVersion,
    currentVersion,
    body: changelog,
    updateCommand: 'openchamber update',
  };
}

/**
 * Execute the update (used by CLI)
 */
export async function executeUpdate(pm = detectPackageManager()) {
  try {
    const tarballUrl = await getLatestReleaseTarballUrl();
    if (!tarballUrl) {
      console.error('Failed to fetch latest release tarball URL from GitHub');
      return {
        success: false,
        exitCode: 1,
      };
    }

    const tempFile = '/tmp/openchamber-update.tgz';
    console.log(`Downloading update from ${tarballUrl}...`);

    // Download tarball
    const downloadResponse = await fetch(tarballUrl);
    if (!downloadResponse.ok) {
      console.error(`Failed to download tarball: ${downloadResponse.status}`);
      return {
        success: false,
        exitCode: 1,
      };
    }

    const buffer = await downloadResponse.arrayBuffer();
    fs.writeFileSync(tempFile, Buffer.from(buffer));

    console.log(`Installing update using bun...`);
    const command = `bun add -g ${tempFile}`;
    const [cmd, ...args] = command.split(' ');
    const result = spawnSync(cmd, args, {
      stdio: 'inherit',
      shell: true,
    });

    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: result.status === 0,
      exitCode: result.status,
    };
  } catch (error) {
    console.error('Update failed:', error.message);
    return {
      success: false,
      exitCode: 1,
    };
  }
}
