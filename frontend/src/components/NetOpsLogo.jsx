import React from "react";

export default function NetOpsLogo({
  height = 56,
  showTagline = true,
  className = "",
  style = {}
}) {
  return (
    <div
      className={`netops-logo ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        ...style
      }}
    >
      <svg
        viewBox="0 0 290 56"
        height={height}
        style={{
          display: "block",
          height: height,
          width: "auto",
          maxWidth: "100%",
          overflow: "visible"
        }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="NetOps - Network Operations Console"
      >
        <defs>
          {/* Gradient for emblem backdrop */}
          <linearGradient id="netopsBadgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.16" />
          </linearGradient>

          {/* Glowing strokes for network nodes and links */}
          <linearGradient id="netopsStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Radiant text gradient for 'Ops' */}
          <linearGradient id="netopsTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Central node radial gradient */}
          <radialGradient id="netopsCoreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>

          {/* Glow filter */}
          <filter id="netopsGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <style>{`
          @keyframes netopsPulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.15); opacity: 1; filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.8)); }
          }
          @keyframes netopsBeacon {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
          }
          .netops-core-pulse {
            transform-origin: 28px 28px;
            animation: netopsPulse 3s ease-in-out infinite;
          }
          .netops-beacon-dot {
            transform-origin: 174px 17px;
            animation: netopsBeacon 2s ease-in-out infinite;
          }
        `}</style>

        {/* ── 1. EMBLEM / NETWORK NEXUS ── */}
        <g id="netops-emblem">
          {/* Rounded squircle backdrop plate */}
          <rect
            x="4"
            y="4"
            width="48"
            height="48"
            rx="12"
            fill="url(#netopsBadgeGrad)"
            stroke="url(#netopsStrokeGrad)"
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />

          {/* Background telemetry orbit arc */}
          <circle
            cx="28"
            cy="28"
            r="16"
            fill="none"
            stroke="url(#netopsStrokeGrad)"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.45"
          />

          {/* Network Interconnection Lattice */}
          <g stroke="url(#netopsStrokeGrad)" strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
            {/* Outer ring links */}
            <line x1="28" y1="13" x2="41" y2="21" />
            <line x1="41" y1="21" x2="41" y2="35" />
            <line x1="41" y1="35" x2="28" y2="43" />
            <line x1="28" y1="43" x2="15" y2="35" />
            <line x1="15" y1="35" x2="15" y2="21" />
            <line x1="15" y1="21" x2="28" y2="13" />

            {/* Inner nexus spokes to central node */}
            <line x1="28" y1="28" x2="28" y2="13" strokeWidth="1.5" />
            <line x1="28" y1="28" x2="41" y2="35" strokeWidth="1.5" />
            <line x1="28" y1="28" x2="15" y2="35" strokeWidth="1.5" />
          </g>

          {/* Secondary cross-connections */}
          <g stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5">
            <line x1="15" y1="21" x2="28" y2="28" />
            <line x1="41" y1="21" x2="28" y2="28" />
            <line x1="28" y1="43" x2="28" y2="28" />
          </g>

          {/* Outer Network Nodes */}
          <circle cx="28" cy="13" r="2.5" fill="#38bdf8" />
          <circle cx="41" cy="21" r="2.5" fill="#818cf8" />
          <circle cx="41" cy="35" r="2.5" fill="#6366f1" />
          <circle cx="28" cy="43" r="2.5" fill="#0284c7" />
          <circle cx="15" cy="35" r="2.5" fill="#06b6d4" />
          <circle cx="15" cy="21" r="2.5" fill="#38bdf8" />

          {/* Central Nexus Core Node */}
          <g className="netops-core-pulse">
            <circle cx="28" cy="28" r="6" fill="#38bdf8" opacity="0.25" />
            <circle cx="28" cy="28" r="4.2" fill="url(#netopsCoreGrad)" filter="url(#netopsGlow)" />
            <circle cx="28" cy="28" r="1.8" fill="#ffffff" />
          </g>

          {/* Small data packet pulses */}
          <circle cx="22" cy="17" r="1" fill="#ffffff" opacity="0.9" />
          <circle cx="34" cy="39" r="1" fill="#ffffff" opacity="0.9" />
        </g>

        {/* ── 2. WORDMARK / TYPOGRAPHY ── */}
        <g transform="translate(64, 33)">
          {/* Main Title "NetOps" */}
          <text
            fontFamily="var(--font-ui), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            fontSize="28"
            fontWeight="800"
            letterSpacing="-0.5px"
          >
            <tspan fill="var(--txt)">Net</tspan>
            <tspan fill="url(#netopsTextGrad)">Ops</tspan>
          </text>

          {/* Live System Beacon Pill */}
          <g transform="translate(108, -19)">
            <rect
              x="0"
              y="0"
              width="44"
              height="16"
              rx="4"
              fill="var(--cyan-dim)"
              stroke="var(--blue-primary)"
              strokeWidth="0.8"
              strokeOpacity="0.35"
            />
            <circle
              className="netops-beacon-dot"
              cx="8"
              cy="8"
              r="2.6"
              fill="#10b981"
            />
            <text
              x="16"
              y="11"
              fontFamily="var(--font-mono), monospace"
              fontSize="7.5"
              fontWeight="700"
              fill="var(--blue-primary)"
              letterSpacing="0.8px"
            >
              CORE
            </text>
          </g>
        </g>

        {/* ── 3. SUBTITLE / PLATFORM CONSOLE TAGLINE ── */}
        {showTagline && (
          <text
            x="66"
            y="48"
            fontFamily="var(--font-mono), ui-monospace, monospace"
            fontSize="8.5"
            fontWeight="700"
            letterSpacing="2.8px"
            fill="var(--txt-3)"
          >
            NETWORK OPERATIONS CONSOLE
          </text>
        )}
      </svg>
    </div>
  );
}
