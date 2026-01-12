export type EditorType = 'vscode' | 'vim';
export async function openDiff(oldPath: string, newPath: string) {
  console.log('[Editor] Mock openDiff:', { oldPath, newPath });
}
export const DEFAULT_GUI_EDITOR = 'vscode';
