/**
 * The app's icon set: window controls, sidebar/nav-adjacent glyphs, and VM
 * lifecycle/hardware icons. All 1em, currentColor, 1.6 stroke, 24x24 - same
 * visual language across every Thomsen app. Never emoji.
 */

type P = { className?: string; size?: number };

const svg = (size: number, children: React.ReactNode, extra?: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={extra}
  >
    {children}
  </svg>
);

// -- Window controls --------------------------------------------------------
export const MinimizeIcon = ({ size = 12 }: P) => svg(size, <path d="M5 12h14" />);
export const MaximizeIcon = ({ size = 12 }: P) => svg(size, <rect x="5" y="5" width="14" height="14" rx="1.5" />);
export const RestoreIcon = ({ size = 12 }: P) =>
  svg(
    size,
    <>
      <rect x="7.5" y="7.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 14.5V6a1.5 1.5 0 0 1 1.5-1.5h8.5" />
    </>,
  );
export const CloseIcon = ({ size = 12 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);

// -- General -----------------------------------------------------------------
export const ChevronDown = ({ className, size = 16 }: P) => svg(size, <path d="M6 9l6 6 6-6" />, className);
export const ChevronRight = ({ className, size = 16 }: P) => svg(size, <path d="M9 6l6 6-6 6" />, className);
export const PlusIcon = ({ className, size = 16 }: P) => svg(size, <path d="M12 5v14M5 12h14" />, className);
export const CheckIcon = ({ className, size = 16 }: P) => svg(size, <path d="M20 6L9 17l-5-5" />, className);
export const XIcon = ({ className, size = 16 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />, className);
export const CopyIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>,
    className,
  );
export const ExternalIcon = ({ className, size = 14 }: P) =>
  svg(
    size,
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>,
    className,
  );
export const TrashIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </>,
    className,
  );
export const SearchIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
    className,
  );
export const DotsIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
    className,
  );
export const StopIcon = ({ className, size = 14 }: P) => svg(size, <rect x="6" y="6" width="12" height="12" rx="2" />, className);
export const AlertTriangleIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </>,
    className,
  );
export const InfoIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </>,
    className,
  );
export const FolderIcon = ({ className, size = 16 }: P) =>
  svg(size, <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2.5h7A1.5 1.5 0 0 1 20 9v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" />, className);
export const UploadIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 16.5v2A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>,
    className,
  );
export const RefreshIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M20 11a8 8 0 1 0-2.6 6.9" />
      <path d="M20 5v6h-6" />
    </>,
    className,
  );

// -- VM lifecycle -------------------------------------------------------------
export const PlayIcon = ({ className, size = 15 }: P) => svg(size, <path d="M7 4.5v15l13-7.5-13-7.5Z" strokeLinejoin="round" />, className);
export const PauseIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <rect x="6" y="5" width="4.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
    </>,
    className,
  );
export const RestartIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M4 12a8 8 0 0 1 14.2-5" />
      <path d="M20 12a8 8 0 0 1-14.2 5" />
      <path d="M18 3v4.5h-4.5" />
      <path d="M6 21v-4.5h4.5" />
    </>,
    className,
  );
export const PowerIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M12 4v7" />
      <path d="M7 6.3a8 8 0 1 0 10 0" />
    </>,
    className,
  );
export const TerminalIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 9.5 11 12.5 7.5 15.5" />
      <path d="M12.5 15.5h4" />
    </>,
    className,
  );
export const FullscreenIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M9 4.5H5.5a1 1 0 0 0-1 1V9" />
      <path d="M15 4.5h3.5a1 1 0 0 1 1 1V9" />
      <path d="M9 19.5H5.5a1 1 0 0 1-1-1V15" />
      <path d="M15 19.5h3.5a1 1 0 0 0 1-1V15" />
    </>,
    className,
  );
export const ExitFullscreenIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M9 5.5V9H5.5" />
      <path d="M15 5.5V9h3.5" />
      <path d="M9 18.5V15H5.5" />
      <path d="M15 18.5V15h3.5" />
    </>,
    className,
  );
export const KeyboardIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 13.5h10" />
    </>,
    className,
  );

// -- Hardware / system --------------------------------------------------------
export const CpuIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M9 3.5V6M15 3.5V6M9 18v2.5M15 18v2.5M3.5 9H6M3.5 15H6M18 9h2.5M18 15h2.5" />
    </>,
    className,
  );
export const MemoryIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="3.5" y="8" width="17" height="9" rx="1.5" />
      <path d="M7 8V5.5M11 8V5.5M15 8V5.5M7 20v-3M11 20v-3M15 20v-3" />
    </>,
    className,
  );
export const DiskIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 14.5h17" />
      <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>,
    className,
  );
export const NetworkIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.7 5.2 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.2-3.7-8.5S9.6 5.8 12 3.5Z" />
    </>,
    className,
  );
export const MonitorIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>,
    className,
  );
export const GpuIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <circle cx="8" cy="12" r="2" />
      <path d="M13 9.5h5M13 12h5M13 14.5h5" />
    </>,
    className,
  );
export const ShieldIcon = ({ className, size = 16 }: P) =>
  svg(size, <path d="M12 3.5 19 6.3v5.4c0 4.4-2.9 7.7-7 8.8-4.1-1.1-7-4.4-7-8.8V6.3L12 3.5Z" />, className);
export const LockIcon = ({ className, size = 16 }: P) =>
  svg(
    size,
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>,
    className,
  );
export const CameraIcon = ({ className, size = 15 }: P) =>
  svg(
    size,
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>,
    className,
  );
