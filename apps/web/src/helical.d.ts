// The runtime path is configurable through HELICAL_UI; these narrow contracts
// let this experiment typecheck without copying the external library's source.
declare module '@helical/prose' {
  import type { ComponentType, PropsWithChildren } from 'react';
  export const Prose: ComponentType<PropsWithChildren<{ className?: string }>>;
}
declare module '@helical/chart' {
  import type { ComponentType } from 'react';
  export const Chart: ComponentType<{ type: 'bar'; data: Record<string, string | number>[]; series: { key: string; label?: string }[]; xKey?: string; height?: number; showLegend?: boolean; showGrid?: boolean; showAxis?: boolean }>;
}
