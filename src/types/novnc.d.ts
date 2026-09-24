/**
 * Minimal hand-written types for `@novnc/novnc` (v1.7.0) - the package ships
 * no `.d.ts` and there's no `@types` package for it. Covers only what
 * `VmDisplay.tsx` actually uses; see `node_modules/@novnc/novnc/docs/API.md`
 * for the full surface if more is needed later.
 */
declare module "@novnc/novnc" {
  export interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
  }

  export interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBOptions);

    viewOnly: boolean;
    focusOnClick: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    readonly capabilities: { power: boolean };
    readonly clippingViewport: boolean;

    disconnect(): void;
    approveServer(): void;
    sendCredentials(credentials: RFBCredentials): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    sendCtrlAltDel(): void;
    machineReboot(): void;
    machineReset(): void;
    machineShutdown(): void;
    clipboardPasteFrom(text: string): void;
    focus(options?: FocusOptions): void;
    blur(): void;

    addEventListener(type: "connect", listener: (ev: CustomEvent<Record<string, never>>) => void): void;
    addEventListener(type: "disconnect", listener: (ev: CustomEvent<{ clean: boolean }>) => void): void;
    addEventListener(type: "credentialsrequired", listener: (ev: CustomEvent<{ types: string[] }>) => void): void;
    addEventListener(type: "securityfailure", listener: (ev: CustomEvent<{ status: number; reason?: string }>) => void): void;
    addEventListener(type: "desktopname", listener: (ev: CustomEvent<{ name: string }>) => void): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;

    removeEventListener(type: "connect", listener: (ev: CustomEvent<Record<string, never>>) => void): void;
    removeEventListener(type: "disconnect", listener: (ev: CustomEvent<{ clean: boolean }>) => void): void;
    removeEventListener(type: "credentialsrequired", listener: (ev: CustomEvent<{ types: string[] }>) => void): void;
    removeEventListener(type: "securityfailure", listener: (ev: CustomEvent<{ status: number; reason?: string }>) => void): void;
    removeEventListener(type: "desktopname", listener: (ev: CustomEvent<{ name: string }>) => void): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }
}
