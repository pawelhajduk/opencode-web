import * as vscode from 'vscode';

export const DIFF_SCHEME = 'openchamber-diff';

interface DiffContent {
  content: string;
  languageId?: string;
  timestamp: number;
}

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private contentMap = new Map<string, DiffContent>();
  private static readonly MAX_ENTRIES = 100;
  private static readonly TTL_MS = 30 * 60 * 1000;

  registerContent(
    filePath: string,
    content: string,
    side: 'original' | 'modified',
    languageId?: string
  ): vscode.Uri {
    const key = `${side}/${filePath}`;

    this.contentMap.set(key, {
      content,
      languageId,
      timestamp: Date.now(),
    });

    this.cleanup();

    return vscode.Uri.parse(`${DIFF_SCHEME}://${side}/${filePath}`);
  }

  updateContent(uri: vscode.Uri, content: string): void {
    const key = uri.authority + uri.path;
    const existing = this.contentMap.get(key);
    if (existing) {
      existing.content = content;
      existing.timestamp = Date.now();
      this._onDidChange.fire(uri);
    }
  }

  clearContent(uri: vscode.Uri): void {
    const key = uri.authority + uri.path;
    this.contentMap.delete(key);
  }

  clearAll(): void {
    this.contentMap.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = uri.authority + uri.path;
    const entry = this.contentMap.get(key);
    return entry?.content ?? '';
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, value] of this.contentMap.entries()) {
      if (now - value.timestamp > DiffContentProvider.TTL_MS) {
        this.contentMap.delete(key);
      }
    }

    if (this.contentMap.size > DiffContentProvider.MAX_ENTRIES) {
      const entries = Array.from(this.contentMap.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = entries.slice(0, entries.length - DiffContentProvider.MAX_ENTRIES);
      for (const [key] of toRemove) {
        this.contentMap.delete(key);
      }
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.contentMap.clear();
  }
}
