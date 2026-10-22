export interface TreeNode {
  value: string
  displayLabel?: string
  label: string
  description?: string
  branch?: boolean
  children?: TreeNode[]
}
