# SDR Copilot — Design System

## Design Direction
Professional dark utility — surfaces at #0F1117, electric blue #3B82F6 accent for active states, compact and information-dense. Feels like a premium developer tool meets a Bloomberg HUD. The popup is a power tool, the overlay a HUD during calls, the dashboard mission control for call analytics.

## Stitch Project
- Project ID: `12790380400793912161`
- Screens: Popup, Overlay, Dashboard, Settings
- Generated with Gemini 3.1 Pro

---

## Color Tokens

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0F1117` | Page/body background |
| `--bg-surface` | `#111319` | Primary surface |
| `--bg-surface-container` | `#1E1F26` | Cards, panels |
| `--bg-surface-container-low` | `#191B22` | Sidebar, subtle containers |
| `--bg-surface-container-high` | `#282A30` | Hover states, elevated cards |
| `--bg-surface-container-highest` | `#33343B` | Input backgrounds, active states |
| `--bg-surface-container-lowest` | `#0C0E14` | Deepest recessed areas |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#E2E2EB` | Primary text |
| `--text-secondary` | `#C2C6D6` | Secondary/variant text |
| `--text-muted` | `#8C909F` | Muted text, outlines |
| `--text-subtle` | `#424754` | Borders, dividers |

### Accent Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#ADC6FF` | Primary accent (light blue) |
| `--accent-primary-container` | `#4D8EFF` | CTA buttons, active indicators |
| `--accent-primary-dark` | `#005AC2` | Inverse primary |
| `--accent-secondary` | `#4EDEA3` | Prospect/success (green) |
| `--accent-secondary-container` | `#00A572` | Green container |

### Status Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--status-success` | `#10B981` | Connected, active |
| `--status-warning` | `#F59E0B` | Warning, objection: Price/Budget |
| `--status-error` | `#FFB4AB` | Error, danger zone |
| `--status-error-container` | `#93000A` | Error background |

### Objection Category Colors
| Category | Color | Hex |
|----------|-------|-----|
| Price | Red | `#EF4444` |
| Timing | Orange | `#F97316` |
| Authority | Yellow | `#EAB308` |
| Need | Green | `#22C55E` |
| Competitor | Blue | `#3B82F6` |
| Trust | Purple | `#A855F7` |

---

## Typography

### Font Stack
- **Primary:** Inter (400, 500, 600, 700, 800)
- **Monospace/Labels:** Space Grotesk (for metrics, timestamps, codes)
- **Fallback:** system-ui, sans-serif

### Scale
| Usage | Size | Weight | Tracking |
|-------|------|--------|----------|
| Page title | 18-20px | 800 (ExtraBold) | tight |
| Section header | 14px | 700 bold | widest (0.15em) |
| Body text | 13px | 400-500 | normal |
| Small body | 12px | 400 | normal |
| Label | 11px | 700 bold | wider (0.1em) |
| Micro label | 10px | 500-600 | widest (0.15em) |
| Tiny/badge | 9px | 500 | tighter |

### Label Convention
All labels use **UPPERCASE** with **wide tracking** and **bold weight**.

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight gaps |
| `--space-sm` | 8px | Card padding, small gaps |
| `--space-md` | 12px | Default component spacing |
| `--space-lg` | 16px | Section spacing |
| `--space-xl` | 20px | Card padding |
| `--space-2xl` | 24px | Section gaps |
| `--space-3xl` | 32px | Major section breaks |

---

## Border & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0px | Sharp edges (dashboard cards) |
| `--radius-sm` | 2px | Default (buttons, inputs) |
| `--radius-md` | 4px | Cards |
| `--radius-lg` | 8px | Panels, containers |
| `--radius-xl` | 12px | Overlay container, save bar |
| `--radius-full` | 9999px | Pills, toggle tracks, dots |

### Border Style
- Default: `1px solid rgba(255, 255, 255, 0.05)` or `border-outline-variant/15`
- Ghost border: `1px solid rgba(66, 71, 84, 0.15)`
- Active/focus: `border-primary/50` with `box-shadow: 0 0 12px rgba(77, 142, 255, 0.15)`
- Danger: `border-error/20`

---

## Components

### Status Indicators
- Small dot: `w-1.5 h-1.5 rounded-full` with glow shadow
- Connected: `bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]`
- Warning: `bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]`
- Disconnected: `bg-outline shadow-[0_0_8px_rgba(140,144,159,0.4)]`

### Buttons
- **Primary CTA:** `bg-primary-container text-white font-bold uppercase tracking-wide`
- **Ghost/Outline:** `bg-transparent border border-outline-variant hover:bg-surface-container-highest`
- **Danger:** `bg-error-container/20 text-error border border-error/20`
- **Small action:** `text-[11px] font-bold uppercase tracking-wider`

### Toggle Switches
- Track: `w-8 h-[18px] rounded-full`
- Thumb: `w-[14px] h-[14px] rounded-full bg-white`
- Active: track `bg-primary-container`, thumb `translate-x-[14px]`
- Inactive: track `bg-surface-container-highest`, thumb `bg-on-surface-variant`

### Input Fields
- `bg-surface-container-lowest text-[13px] border border-outline-variant/15 rounded-md px-3 py-2.5`
- Focus: blue glow ring via `.input-focus-ring`

### Cards
- `bg-surface-container rounded-lg p-5 ghost-border`
- Hover: `hover:bg-surface-container-high transition-all`
- Bottom accent: `border-b-2 border-primary/20` (stats cards)

### Objection Pills
- `text-[9px] px-2 py-0.5 rounded-full font-mono uppercase tracking-tighter`
- Each category: `bg-{color}-500/10 text-{color}-400`

### Glass Panels (Overlay)
- `backdrop-filter: blur(12px); background: rgba(30, 31, 38, 0.7);`
- Or: `bg-surface/80 backdrop-blur-xl`

---

## Surface-Specific Notes

### Popup (300x480px)
- Fixed dimensions, no scroll
- Top header with bolt icon + version badge
- 2x2 status grid
- Compact API key entry with pill-shaped save button
- Bottom nav bar with Dashboard + Settings

### Overlay (340x500px floating)
- Glassmorphism container with rounded corners
- Blue left border on header
- Talk-time split bar (blue vs green)
- Scrollable transcript area
- Amber-bordered objection detection cards with glow
- Bottom action pills (Draft Follow-up, Log to SF)

### Dashboard (full page with 264px sidebar)
- Left sidebar navigation with gradient logo
- Top bar with date navigation (← Yesterday | Today →)
- 4-column stats grid with bottom accent borders
- 3:2 column split for charts (objection bars + talk time donut)
- Full-width call history table with alternating rows
- Empty state with dashed border placeholder

### Settings (640px max-width centered)
- Stacked card sections with section headers
- Two-column grid for compact fields (phone/email, title/company)
- Integration rows with icon + status + action button
- Sticky save bar at bottom with glassmorphism

---

## Icons
Using **Material Symbols Outlined** (variable font):
- Default: `FILL 0, wght 400, GRAD 0, opsz 20-24`
- Active nav: `FILL 1`
- Size: 18px (compact), 20px (buttons), 24px (default)

---

## Animation Patterns
- Button press: `active:scale-95 transition-transform duration-150`
- Hover transitions: `transition-colors` or `transition-all`
- Live indicator: `animate-pulse` on speaking dots
- Nav press: `active:translate-y-0.5`

---

## Stitch Reference Files
- `stitch-designs/popup.html` — Popup panel design
- `stitch-designs/overlay.html` — Call overlay HUD design
- `stitch-designs/dashboard.html` — Dashboard mission control design
- `stitch-designs/settings.html` — Settings page design
