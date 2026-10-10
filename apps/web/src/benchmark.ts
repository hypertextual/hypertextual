// Opt-in marker observed by the external macOS compositor capture driver.
// It changes with the document, without logging or timing work in the editor.
let enabled = false;
let sequence = 0;
let marker: HTMLDivElement | undefined;
export function enableBenchmark(value: boolean) {
  enabled = value;
  if (enabled) document.addEventListener('scroll', () => requestAnimationFrame(markBenchmark), true);
}
export function markBenchmark() {
  if (!enabled) return;
  if (!marker) {
    marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, { position: 'fixed', left: '328px', top: '76px', width: '16px', height: '16px', zIndex: '99999', pointerEvents: 'none' });
    document.body.append(marker);
  }
  marker.style.backgroundColor = `rgb(${32 + (++sequence % 16) * 12},220,90)`;
}
