import * as vscode from 'vscode';

type VSCodeThemeContribution = {
  label?: string;
  uiTheme?: string;
  path?: string;
};

export type WebviewShikiThemePayload = {
  light?: Record<string, unknown>;
  dark?: Record<string, unknown>;
};

let outputChannel: vscode.OutputChannel | null = null;

const getOutputChannel = (): vscode.OutputChannel => {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('OpenChamber Shiki Themes');
  }
  return outputChannel;
};

const log = (message: string): void => {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
};

type ThemeCache = {
  label: string;
  json: Record<string, unknown>;
  timestamp: number;
};

const themeCache = new Map<string, ThemeCache>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCachedTheme = (label: string): Record<string, unknown> | null => {
  const cached = themeCache.get(label.toLowerCase());
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL_MS) {
    themeCache.delete(label.toLowerCase());
    return null;
  }
  
  return cached.json;
};

const setCachedTheme = (label: string, json: Record<string, unknown>): void => {
  themeCache.set(label.toLowerCase(), {
    label,
    json,
    timestamp: Date.now(),
  });
};

export const clearThemeCache = (): void => {
  themeCache.clear();
  log('Theme cache cleared');
};

const stripJsonc = (input: string): string => {
  let output = '';
  let inString = false;
  let stringQuote: '"' | '\'' | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        output += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (stringQuote && ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'') {
      inString = true;
      stringQuote = ch;
      output += ch;
      continue;
    }

    output += ch;
  }

  return output;
};

const stripTrailingCommas = (input: string): string => {
  let output = '';
  let inString = false;
  let stringQuote: '"' | '\'' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (stringQuote && ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      inString = true;
      stringQuote = ch;
      output += ch;
      continue;
    }

    if (ch === ',') {
      // If the next non-whitespace character is a closing brace/bracket, drop this comma.
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j] ?? '')) j++;
      const nextNonWs = input[j];
      if (nextNonWs === '}' || nextNonWs === ']') {
        continue;
      }
    }

    output += ch;
  }

  return output;
};

const parseJsoncLoose = (input: string): Record<string, unknown> | null => {
  try {
    const noComments = stripJsonc(input);
    const noTrailingCommas = stripTrailingCommas(noComments);
    const parsed = JSON.parse(noTrailingCommas) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const getThemeLabelFromConfig = (key: string): string | undefined => {
  return vscode.workspace.getConfiguration('workbench').get<string>(key) || undefined;
};

const normalizeLabel = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

const labelVariants = (label: string): string[] => {
  const trimmed = label.trim();
  const variants = new Set<string>([trimmed]);

  // VS Code sometimes uses "Default …" in settings while theme contributions omit it.
  if (trimmed.toLowerCase().startsWith('default ')) {
    variants.add(trimmed.slice('default '.length));
  }

  return Array.from(variants);
};

const findContributedTheme = (label: string): { extension: vscode.Extension<unknown>; theme: VSCodeThemeContribution } | null => {
  const targets = labelVariants(label).map(normalizeLabel);
  for (const extension of vscode.extensions.all) {
    const contributes = (extension.packageJSON as { contributes?: { themes?: VSCodeThemeContribution[] } } | undefined)?.contributes;
    const themes = contributes?.themes;
    if (!Array.isArray(themes)) continue;

    const match = themes.find((theme) => theme?.label && targets.includes(normalizeLabel(theme.label)));
    if (match?.path) {
      return { extension, theme: match };
    }
  }
  return null;
};

const readThemeJsonByLabel = async (label: string): Promise<Record<string, unknown> | null> => {
  const cached = getCachedTheme(label);
  if (cached) {
    log(`Using cached theme for "${label}"`);
    return cached;
  }

  const resolved = findContributedTheme(label);
  if (!resolved) {
    log(`Theme not found in extensions: "${label}"`);
    return null;
  }

  try {
    const uri = vscode.Uri.joinPath(resolved.extension.extensionUri, resolved.theme.path as string);
    log(`Reading theme file: ${uri.fsPath}`);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8').decode(bytes);
    const json = parseJsoncLoose(text);
    
    if (json) {
      setCachedTheme(label, json);
      log(`Successfully loaded and cached theme: "${label}"`);
    } else {
      log(`Failed to parse theme JSON for: "${label}"`);
    }
    
    return json;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Error reading theme "${label}": ${message}`);
    return null;
  }
};

const ensureUniqueThemeName = (raw: Record<string, unknown>, suffix: string): Record<string, unknown> => {
  const originalName = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : 'VSCode Theme';
  return { ...raw, name: `${originalName} (${suffix})` };
};

export async function getWebviewShikiThemes(): Promise<WebviewShikiThemePayload | null> {
  const current = getThemeLabelFromConfig('colorTheme');
  const preferredLight = getThemeLabelFromConfig('preferredLightColorTheme') || current;
  const preferredDark = getThemeLabelFromConfig('preferredDarkColorTheme') || current;

  const themeVariant =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
      ? 'light'
      : 'dark';

  const lightLabel = themeVariant === 'light' ? current : preferredLight;
  const darkLabel = themeVariant === 'dark' ? current : preferredDark;

  log(`Resolving Shiki themes - current: "${current}", variant: ${themeVariant}`);
  log(`Light label: "${lightLabel}", Dark label: "${darkLabel}"`);

  const [lightRaw, darkRaw] = await Promise.all([
    lightLabel ? readThemeJsonByLabel(lightLabel) : Promise.resolve(null),
    darkLabel ? readThemeJsonByLabel(darkLabel) : Promise.resolve(null),
  ]);

  const fallbackOneSide = lightRaw ?? darkRaw;
  const effectiveLight = lightRaw ?? fallbackOneSide;
  const effectiveDark = darkRaw ?? fallbackOneSide;

  if (!effectiveLight && !effectiveDark) {
    log('No VS Code theme JSON resolved - webview will use built-in fallback themes');
    return null;
  }

  log(`Resolved themes - light: ${effectiveLight ? 'yes' : 'no'}, dark: ${effectiveDark ? 'yes' : 'no'}`);

  return {
    light: effectiveLight ? ensureUniqueThemeName(effectiveLight, 'Light') : undefined,
    dark: effectiveDark ? ensureUniqueThemeName(effectiveDark, 'Dark') : undefined,
  };
}
