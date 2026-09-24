/**
 * Makes mouse/wheel input land correctly when the VM display is being shown
 * with "Stretch" scaling (`VmDisplay.tsx` applies a non-uniform CSS
 * `transform: scale(sx, sy)` directly to noVNC's canvas, since noVNC itself
 * only supports a single uniform scale factor via `scaleViewport`).
 *
 * noVNC turns a mouse event into a guest-relative point via
 * `canvas.getBoundingClientRect()` (`core/util/element.js#clientToElement`),
 * which reflects the CSS transform - so with a non-uniform transform in
 * place, an unmodified click lands proportionally off (worse the further a
 * corner is from the canvas's center). This intercepts mouse/wheel events
 * before they reach noVNC's own canvas listeners, re-expresses each point as
 * a fraction of the canvas's on-screen box, and re-dispatches a corrected
 * copy measured against the canvas's un-transformed size - which is what
 * noVNC's coordinate math actually expects.
 */

const POSITIONAL_TYPES = ["mousedown", "mouseup", "mousemove", "wheel"] as const;

// Marks events this module itself created, so the capture-phase handler
// below doesn't try to "correct" its own corrected copy when it re-enters
// via `canvas.dispatchEvent` (canvas is a descendant of `wrapper`, so the
// redispatched event passes back through the same capture-phase listener).
const CORRECTED = new WeakSet<Event>();

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Re-expresses `ev`'s position against the canvas's un-transformed size,
 * measured as a fraction of its current (transformed) on-screen box so a
 * click anywhere on the visible picture - including in empty letterbox
 * space when `keepAspectRatio` is on - maps to the nearest in-range guest
 * pixel, then dispatches a same-type copy carrying that corrected point. */
function redispatch(ev: MouseEvent, canvas: HTMLCanvasElement): void {
  const shown = canvas.getBoundingClientRect();
  const fx = clamp01((ev.clientX - shown.left) / (shown.width || 1));
  const fy = clamp01((ev.clientY - shown.top) / (shown.height || 1));

  // Momentarily drop the transform so `getBoundingClientRect()` - both here
  // and inside noVNC's own handler once `dispatchEvent` below runs it
  // synchronously - reports the canvas's real, un-transformed box. Transform
  // is paint-only (no reflow), and nothing yields to the browser between the
  // two assignments, so this never paints or is observable outside this
  // function.
  const prevTransform = canvas.style.transform;
  canvas.style.transform = "none";
  const native = canvas.getBoundingClientRect();

  const init: MouseEventInit = {
    clientX: native.left + fx * native.width,
    clientY: native.top + fy * native.height,
    button: ev.button,
    buttons: ev.buttons,
    ctrlKey: ev.ctrlKey,
    shiftKey: ev.shiftKey,
    altKey: ev.altKey,
    metaKey: ev.metaKey,
    bubbles: true,
    cancelable: true,
  };
  const copy =
    ev.type === "wheel"
      ? new WheelEvent("wheel", { ...init, deltaX: (ev as WheelEvent).deltaX, deltaY: (ev as WheelEvent).deltaY, deltaZ: (ev as WheelEvent).deltaZ, deltaMode: (ev as WheelEvent).deltaMode })
      : new MouseEvent(ev.type, init);

  CORRECTED.add(copy);
  canvas.dispatchEvent(copy);

  canvas.style.transform = prevTransform;
}

/**
 * Attaches the correction layer to `wrapper` - the same element passed as
 * `target` to `new RFB(...)`, i.e. an ancestor of noVNC's canvas. Returns a
 * cleanup function that removes the listeners.
 */
export function attachStretchInputCorrection(wrapper: HTMLElement, getCanvas: () => HTMLCanvasElement | null): () => void {
  const handleEvent = (ev: Event) => {
    if (CORRECTED.has(ev)) return;
    const canvas = getCanvas();
    if (!canvas) return;
    ev.preventDefault();
    ev.stopPropagation();
    redispatch(ev as MouseEvent, canvas);
  };

  for (const type of POSITIONAL_TYPES) {
    wrapper.addEventListener(type, handleEvent, { capture: true });
  }

  return () => {
    for (const type of POSITIONAL_TYPES) {
      wrapper.removeEventListener(type, handleEvent, { capture: true });
    }
  };
}
