declare global {
  interface Window {
    __OPENCHAMBER_VSCODE_SYNTAX_THEMES__?: {
      light?: Record<string, unknown>;
      dark?: Record<string, unknown>;
    } | null;
    __OPENCHAMBER_VSCODE_SHIKI_THEMES__?: {
      light?: Record<string, unknown>;
      dark?: Record<string, unknown>;
    } | null;
  }
}

export {};

