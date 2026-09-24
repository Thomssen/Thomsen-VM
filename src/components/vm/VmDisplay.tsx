import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { MonitorIcon } from "@/components/icons";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { getVmDisplayInfo } from "@/services/vms";
import type { AppErrorShape, ScalingMode } from "@/types";
import { attachStretchInputCorrection } from "./vncStretchInput";
import "./VmDisplay.css";

const POLL_MS = 500;
const POLL_TIMEOUT_MS = 20_000;

type Phase = "connecting" | "connected" | "disconnected" | "error";

interface VmDisplayProps {
  vmId: string;
  scalingMode: ScalingMode;
  keepAspectRatio: boolean;
  autoResizeGuest: boolean;
}

/**
 * Renders the running VM's actual guest display: connects to QEMU's VNC-
 * over-WebSocket listener (see `virtualization/qemu.rs::start_vm`) with
 * noVNC and draws it into a canvas that fills this component. Only mounted
 * by `ConsoleWindow` while the VM is running or paused - it owns its own
 * connect/reconnect lifecycle keyed on `vmId` so it survives the host
 * window entering/leaving full screen without dropping the connection.
 */
export function VmDisplay({ vmId, scalingMode, keepAspectRatio, autoResizeGuest }: VmDisplayProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [rfb, setRfb] = useState<RFB | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<AppErrorShape | null>(null);

  // Connect/reconnect lifecycle.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let cancelled = false;
    let pollTimer: number | undefined;
    let elapsedMs = 0;
    let instance: RFB | null = null;

    setPhase("connecting");
    setError(null);

    const poll = () => {
      void getVmDisplayInfo(vmId)
        .then((info) => {
          if (cancelled) return;
          if (!info) {
            elapsedMs += POLL_MS;
            if (elapsedMs >= POLL_TIMEOUT_MS) {
              setPhase("error");
              setError({ message: "Couldn't reach this virtual machine's display.", reason: "No display was reported within the expected startup time." });
              return;
            }
            pollTimer = window.setTimeout(poll, POLL_MS);
            return;
          }

          instance = new RFB(surface, `ws://${info.host}:${info.wsPort}/`, { shared: true, credentials: {} });
          instance.background = "var(--bg)";
          instance.addEventListener("connect", () => {
            if (cancelled) return;
            setPhase("connected");
            setError(null);
            instance?.focus();
          });
          instance.addEventListener("disconnect", (ev) => {
            if (cancelled) return;
            setRfb(null);
            if (ev.detail.clean) {
              setPhase("disconnected");
            } else {
              setPhase("error");
              setError({ message: "Lost connection to this virtual machine's display.", reason: "The display connection closed unexpectedly - the VM may still be running." });
            }
          });
          instance.addEventListener("securityfailure", (ev) => {
            if (cancelled) return;
            setPhase("error");
            setError({ message: "Couldn't establish the display connection.", reason: ev.detail.reason ?? `Security handshake failed (status ${ev.detail.status}).` });
          });
          instance.addEventListener("credentialsrequired", () => {
            if (cancelled) return;
            setPhase("error");
            setError({ message: "This virtual machine's display unexpectedly asked for credentials.", reason: "Thomsen VM doesn't configure a VNC password." });
          });
          setRfb(instance);
        })
        .catch(() => {
          if (!cancelled) pollTimer = window.setTimeout(poll, POLL_MS);
        });
    };
    poll();

    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      instance?.disconnect();
      setRfb(null);
    };
  }, [vmId]);

  // Scaling mode / auto-resize-guest, applied (and re-applied live) to
  // whichever RFB connection is currently active.
  useEffect(() => {
    if (!rfb) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    rfb.resizeSession = autoResizeGuest;

    if (scalingMode === "fit") {
      rfb.scaleViewport = true;
      rfb.clipViewport = false;
      return;
    }
    if (scalingMode === "native") {
      rfb.scaleViewport = false;
      rfb.clipViewport = true;
      return;
    }

    // "stretch" - noVNC has no built-in non-uniform scale, so this drives
    // the canvas's CSS transform directly (scaleViewport/clipViewport stay
    // off so noVNC leaves the canvas at its native, untransformed size) and
    // corrects mouse/wheel coordinates to match (see vncStretchInput.ts).
    rfb.scaleViewport = false;
    rfb.clipViewport = false;

    const canvas = surface.querySelector("canvas");
    if (!canvas) return;

    const applyTransform = () => {
      const nativeW = canvas.width;
      const nativeH = canvas.height;
      const boxW = surface.clientWidth;
      const boxH = surface.clientHeight;
      if (!nativeW || !nativeH || !boxW || !boxH) return;
      let sx = boxW / nativeW;
      let sy = boxH / nativeH;
      if (keepAspectRatio) {
        sx = sy = Math.min(sx, sy);
      }
      canvas.style.transform = `scale(${sx}, ${sy})`;
    };

    applyTransform();
    const detachInput = attachStretchInputCorrection(surface, () => surface.querySelector("canvas"));
    const roSurface = new ResizeObserver(applyTransform);
    roSurface.observe(surface);
    const roCanvas = new ResizeObserver(applyTransform);
    roCanvas.observe(canvas);

    return () => {
      detachInput();
      roSurface.disconnect();
      roCanvas.disconnect();
      canvas.style.transform = "";
    };
  }, [rfb, scalingMode, keepAspectRatio, autoResizeGuest]);

  return (
    <div className="vm-display">
      {/* React never renders children into this element - noVNC owns it
          exclusively once connected, appending/removing its own canvas. */}
      <div className="vm-display__surface" ref={surfaceRef} />
      {phase !== "connected" && (
        <div className="vm-display__overlay">
          <MonitorIcon size={40} className="vm-display__overlay-icon" />
          {phase === "connecting" && <p className="vm-display__overlay-status">Connecting to display…</p>}
          {phase === "disconnected" && <p className="vm-display__overlay-status">Display disconnected</p>}
          {phase === "error" && (
            <>
              <p className="vm-display__overlay-status">Display unavailable</p>
              {error && (
                <div className="vm-display__overlay-error">
                  <ErrorNotice error={error} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
