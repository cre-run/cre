const PATHS = {
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chat: "M4 5h16v11H9l-5 4z",
  shield: "M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  info: "M12 11v5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  code: "M9 7l-5 5 5 5M15 7l5 5-5 5",
  book: "M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  scale: "M12 4v16M5 20h14M6 8l-3 6h6zM18 8l-3 6h6zM6 8h12",
  users:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M21 20c0-2.5-1.5-4.3-4-4.9",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
} as const;

export type IconName = keyof typeof PATHS;

export const Icon = ({ name, size = 16 }: { name: IconName; size?: number }) => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={PATHS[name]} />
  </svg>
);
