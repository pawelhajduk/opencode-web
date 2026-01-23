# Implementation Guide: AI Diff Display in VS Code Extension

## Overview

Implement a feature to display diffs of AI-edited files in separate VS Code editor tabs, similar to how vscode-copilot-chat handles file change previews.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Webview (Chat UI)                            │
│  - Detects file edits from OpenCode tool output                 │
│  - Sends diff request via bridge message                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ bridge message: editor:openAIDiff
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Extension Host (bridge.ts)                     │
│  - Receives original/modified content                           │
│  - Registers content with DiffContentProvider                   │
│  - Executes vscode.diff command                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DiffContentProvider                             │
│  - Implements TextDocumentContentProvider                       │
│  - Stores virtual content with custom URI scheme                │
│  - Provides content when VS Code requests it                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   VS Code Diff Editor                            │
│  - Built-in diff view opened via vscode.diff command            │
│  - Shows side-by-side or inline diff                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Infrastructure (Extension Host)

### 1.1 Create DiffContentProvider

**File:** `packages/vscode/src/DiffContentProvider.ts`

```typescript
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
  private static readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Register content and return URI for use in diff command
   */
  registerContent(
    filePath: string,
    content: string,
    side: 'original' | 'modified',
    languageId?: string
  ): vscode.Uri {
    // Create unique key: side/filePath/timestamp
    const timestamp = Date.now();
    const key = `${side}/${filePath}`;
    
    this.contentMap.set(key, {
      content,
      languageId,
      timestamp,
    });

    this.cleanup();

    // URI format: openchamber-diff://side/path/to/file.ts
    return vscode.Uri.parse(`${DIFF_SCHEME}://${side}/${filePath}`);
  }

  /**
   * Update existing content (triggers refresh in diff view)
   */
  updateContent(uri: vscode.Uri, content: string): void {
    const key = uri.authority + uri.path;
    const existing = this.contentMap.get(key);
    if (existing) {
      existing.content = content;
      existing.timestamp = Date.now();
      this._onDidChange.fire(uri);
    }
  }

  /**
   * Clear a specific entry
   */
  clearContent(uri: vscode.Uri): void {
    const key = uri.authority + uri.path;
    this.contentMap.delete(key);
  }

  /**
   * Clear all entries
   */
  clearAll(): void {
    this.contentMap.clear();
  }

  /**
   * Required by TextDocumentContentProvider
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    // Key is authority (side) + path
    const key = uri.authority + uri.path;
    const entry = this.contentMap.get(key);
    return entry?.content ?? '';
  }

  /**
   * Cleanup old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Remove expired entries
    for (const [key, value] of this.contentMap.entries()) {
      if (now - value.timestamp > DiffContentProvider.TTL_MS) {
        this.contentMap.delete(key);
      }
    }

    // If still too many, remove oldest
    if (this.contentMap.size > DiffContentProvider.MAX_ENTRIES) {
      const entries = Array.from(this.contentMap.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - DiffContentProvider.MAX_ENTRIES);
      for (const [key] of toRemove) {
        this.contentMap.delete(key);
      }
    }
  }
}
```

### 1.2 Register Provider in Extension

**File:** `packages/vscode/src/extension.ts`

Add to activate function:

```typescript
import { DiffContentProvider, DIFF_SCHEME } from './DiffContentProvider';

// Near top of activate()
const diffContentProvider = new DiffContentProvider();

context.subscriptions.push(
  vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, diffContentProvider)
);

// Pass to providers that need it
chatViewProvider = new ChatViewProvider(context, context.extensionUri, openCodeManager, diffContentProvider);
// ... same for other providers
```

### 1.3 Add Bridge Handler

**File:** `packages/vscode/src/bridge.ts`

Add new case in `handleBridgeMessage`:

```typescript
case 'editor:openAIDiff': {
  const { 
    filePath,           // Relative or absolute path
    originalContent,    // Content before AI edit
    modifiedContent,    // Content after AI edit (optional - uses current file if not provided)
    label,              // Optional custom label
    languageId,         // Optional language for syntax highlighting
  } = payload as {
    filePath: string;
    originalContent: string;
    modifiedContent?: string;
    label?: string;
    languageId?: string;
  };

  if (!filePath) {
    return { id, type, success: false, error: 'filePath is required' };
  }

  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(workspaceRoot, filePath);
    const relativePath = path.relative(workspaceRoot, absolutePath);

    // Detect language from file extension if not provided
    const detectedLanguageId = languageId || getLanguageIdFromPath(filePath);

    // Register original content with provider
    const originalUri = ctx?.diffContentProvider?.registerContent(
      relativePath,
      originalContent,
      'original',
      detectedLanguageId
    );

    // For modified: use provided content or the actual file
    let modifiedUri: vscode.Uri;
    if (modifiedContent !== undefined) {
      modifiedUri = ctx?.diffContentProvider?.registerContent(
        relativePath,
        modifiedContent,
        'modified',
        detectedLanguageId
      );
    } else {
      // Use the actual file on disk
      modifiedUri = vscode.Uri.file(absolutePath);
    }

    // Build title
    const fileName = path.basename(filePath);
    const title = label || `${fileName} (AI Changes)`;

    // Open diff editor
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      title,
      { preview: false } // Open as permanent tab, not preview
    );

    return { id, type, success: true, data: { opened: true } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { id, type, success: false, error: errorMessage };
  }
}
```

Helper function:

```typescript
function getLanguageIdFromPath(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.html': 'html',
    '.xml': 'xml',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.sql': 'sql',
  };
  return languageMap[ext];
}
```

---

## Phase 2: Bridge Context Update

### 2.1 Update BridgeContext Interface

**File:** `packages/vscode/src/bridge.ts`

```typescript
import { DiffContentProvider } from './DiffContentProvider';

export interface BridgeContext {
  manager?: OpenCodeManager;
  context?: vscode.ExtensionContext;
  diffContentProvider?: DiffContentProvider;  // Add this
}
```

### 2.2 Pass Provider to Bridge Calls

Update all places where `handleBridgeMessage` is called to include `diffContentProvider` in context.

---

## Phase 3: Webview Integration

### 3.1 Add Bridge API Function

**File:** `packages/vscode/webview/api/bridge.ts` (or equivalent)

```typescript
export async function openAIDiff(params: {
  filePath: string;
  originalContent: string;
  modifiedContent?: string;
  label?: string;
}): Promise<{ opened: boolean }> {
  return sendBridgeMessage('editor:openAIDiff', params);
}
```

### 3.2 UI Integration Points

Add "View Diff" buttons/actions in the chat UI where file edits are displayed:

1. **Tool Output Cards** - When displaying `edit` or `write` tool results
2. **Permission Cards** - Show diff preview before approving file changes
3. **Session Summary** - List of files changed with diff links

Example integration in a React component:

```typescript
// In tool output component for file edits
const handleViewDiff = async (filePath: string, originalContent: string, newContent: string) => {
  await bridge.openAIDiff({
    filePath,
    originalContent,
    modifiedContent: newContent,
    label: `${path.basename(filePath)} - AI Edit`,
  });
};

// Render
<Button onClick={() => handleViewDiff(file.path, file.original, file.modified)}>
  View Diff
</Button>
```

---

## Phase 4: Original Content Tracking

### 4.1 Capture Original Content

To show meaningful diffs, capture file content **before** AI makes changes.

**Option A: Read from Git (recommended for committed files)**

```typescript
// Use existing gitService
import { getGitFileDiff } from './gitService';

const { original } = await getGitFileDiff(directory, filePath, false);
```

**Option B: Cache on first access**

Create a content cache that stores file content when:
- A session starts
- A file is first mentioned in context
- Before any edit tool executes

```typescript
// Simple in-memory cache
class OriginalContentCache {
  private cache = new Map<string, string>();

  async getOriginal(filePath: string): Promise<string | null> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }
    
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const text = Buffer.from(content).toString('utf8');
      this.cache.set(filePath, text);
      return text;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
```

---

## Phase 5: Multi-File Diff Support (Optional Enhancement)

For showing multiple file changes at once (like a PR review):

### 5.1 Batch Diff Command

```typescript
case 'editor:openMultiDiff': {
  const { files, label } = payload as {
    files: Array<{
      filePath: string;
      originalContent: string;
      modifiedContent?: string;
    }>;
    label?: string;
  };

  // Open diffs sequentially in a tab group
  for (const file of files) {
    // ... same logic as single diff
  }
  
  return { id, type, success: true, data: { opened: files.length } };
}
```

### 5.2 Quick Pick for Multiple Files

```typescript
// Let user select which files to view
const items = files.map(f => ({
  label: path.basename(f.filePath),
  description: f.filePath,
  file: f,
}));

const selected = await vscode.window.showQuickPick(items, {
  canPickMany: true,
  placeHolder: 'Select files to view diffs',
});
```

---

## File Structure Summary

```
packages/vscode/src/
├── DiffContentProvider.ts    # NEW - Virtual document provider
├── extension.ts              # MODIFY - Register provider
├── bridge.ts                 # MODIFY - Add handler
├── ChatViewProvider.ts       # MODIFY - Pass provider reference
└── ...

packages/vscode/webview/
├── api/
│   └── bridge.ts             # MODIFY - Add openAIDiff function
└── ...

packages/ui/src/components/
├── chat/
│   └── message/
│       └── ToolOutput.tsx    # MODIFY - Add "View Diff" button
└── ...
```

---

## Testing Checklist

- [ ] Single file diff opens correctly
- [ ] Syntax highlighting works based on file extension
- [ ] Original content displays correctly (left side)
- [ ] Modified content displays correctly (right side)
- [ ] Tab title shows meaningful label
- [ ] Memory cleanup works (old entries removed)
- [ ] Works with both relative and absolute paths
- [ ] Works when modified content is on disk vs provided
- [ ] Multiple diffs can be opened simultaneously
- [ ] Diff refreshes if content updates (via `onDidChange`)

---

## Key VS Code APIs Reference

| API | Purpose |
|-----|---------|
| `workspace.registerTextDocumentContentProvider(scheme, provider)` | Register virtual document provider |
| `commands.executeCommand('vscode.diff', left, right, title, options)` | Open diff editor |
| `Uri.parse('scheme://authority/path')` | Create custom URIs |
| `EventEmitter<Uri>` | Signal content changes for refresh |
| `TextDocumentContentProvider.provideTextDocumentContent(uri)` | Provide virtual content |

---

## Notes

1. **No Proposed APIs needed** - This implementation uses only stable VS Code APIs
2. **Memory management** - The provider includes TTL and max entry limits
3. **Language detection** - Automatic syntax highlighting based on file extension
4. **Flexible modified source** - Can show diff against provided content OR current file on disk

---

## Research Source

This guide is based on analysis of the [vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat) repository, specifically:

- `src/extension/chatSessions/vscode-node/prContentProvider.ts` - Virtual document provider pattern
- `src/extension/chatSessions/vscode-node/pullRequestFileChangesService.ts` - Multi-diff creation
- `src/extension/prompts/node/test/fixtures/pullRequestModel.ts` - `vscode.diff` command usage
