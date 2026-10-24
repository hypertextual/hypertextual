import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { errorMessage } from '../clients/workspaceClient'
import type { EditorService } from './editorService.svelte'

export function attachDesktopLifecycle(editor: EditorService) {
  let active = true
  const unlisteners: (() => void)[] = []
  async function close(quit: boolean) {
    if (editor.closing) return
    editor.closing = true
    if (await editor.flush()) {
      try {
        if (quit) await invoke('workspace_finish_quit')
        else await getCurrentWindow().destroy()
      } catch (error) {
        editor.openingError = errorMessage(error)
        editor.closing = false
      }
    } else editor.closing = false
  }
  if (isTauri()) {
    void Promise.all([
      getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault()
        void close(false)
      }),
      listen('workspace-quit-requested', () => {
        void close(true)
      }),
    ])
      .then(async (stops) => {
        if (!active) {
          stops.forEach((stop) => stop())
          return
        }
        unlisteners.push(...stops)
        await invoke('workspace_frontend_ready')
      })
      .catch((error) => {
        if (active) editor.openingError = errorMessage(error)
      })
  }
  return () => {
    active = false
    unlisteners.forEach((stop) => stop())
  }
}
