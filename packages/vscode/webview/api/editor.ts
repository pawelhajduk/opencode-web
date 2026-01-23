
import { sendBridgeMessage } from './bridge';
import type { EditorAPI, OpenAIDiffParams } from '@openchamber/ui/lib/api/types';

export const createVSCodeEditorAPI = (): EditorAPI => ({
  openFile: async (path: string, line?: number, column?: number) => {
    await sendBridgeMessage('editor:openFile', { path, line, column });
  },
  openDiff: async (original: string, modified: string, label?: string) => {
    await sendBridgeMessage('editor:openDiff', { original, modified, label });
  },
  openAIDiff: async (params: OpenAIDiffParams) => {
    await sendBridgeMessage('editor:openAIDiff', params);
  },
});
