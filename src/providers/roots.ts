import * as path from 'path'

import * as vscode from 'vscode'

/**
 * Roots to search for installed Koishi plugins when serving a document.
 *
 * Prefers the owning workspace folder, since that is where a project's
 * `node_modules` lives, and falls back to the file's own directory so the
 * features still work for a file opened outside any workspace — which is the
 * common case when running `code koishi.yml` against a bare file.
 */
export function pluginSearchRoots(document: vscode.TextDocument): string[] {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (folder) {
    return [folder.uri.fsPath]
  }
  if (document.uri.scheme !== 'file') {
    return []
  }
  return [path.dirname(document.uri.fsPath)]
}
