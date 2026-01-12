import * as vscode from 'vscode';

export type ThemeKindName = 'light' | 'dark';

export function getThemeKindName(kind: vscode.ColorThemeKind): ThemeKindName {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'light';
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrast:
    default:
      return 'dark';
  }
}

export function getActiveThemeLabel(): string | undefined {
  return vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') || undefined;
}

export function isHighContrastTheme(kind: vscode.ColorThemeKind): boolean {
  return kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight;
}
