import type { WorkspaceClient } from '../clients/workspaceClient'
import type { WorkspaceService } from '../services/workspaceService.svelte'

export interface ShellProps {
  client: WorkspaceClient
}
export interface FileTreeProps {
  workspace: WorkspaceService
}
export interface ArticlePaneProps {
  workspace: WorkspaceService
}
export interface DraftRecoveryDialogProps {
  open: boolean
  message: string
  copyStatus?: string
  busy?: boolean
  onclose: () => void
  oncopy: () => void
  ondiscard: () => void
  onretry?: () => void
}
