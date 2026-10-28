---
name: Obsidian Telemetry Engineering Workbench
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#a4d64c'
  on-secondary: '#233600'
  secondary-container: '#719e13'
  on-secondary-container: '#1e2f00'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#996100'
  on-tertiary-container: '#ffeedd'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#bff365'
  secondary-fixed-dim: '#a4d64c'
  on-secondary-fixed: '#131f00'
  on-secondary-fixed-variant: '#354e00'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.025em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-h3:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: '0'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: '0'
  label-mono-stats:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-precision, utilitarian telemetry workbench built for server stress testing, distributed load orchestration, and runtime observability. Grounded in modern developer IDE aesthetics (JetBrains, terminal multiplexers, hardware instrumentation panels), the aesthetic rejects corporate SaaS gloss and bubbly micro-interactions in favor of mathematical rigor, functional density, and tactical clarity.

The visual style blends:
- **Dark Telemetry Minimalism**: Deep midnight voids paired with structured coordinate blueprint grids and razor-sharp hairline dividers.
- **Instrument Glassmorphism**: Translucent container surfaces, high-contrast linear sheens, and muted backdrop blurs that establish structural elevation without obscuring continuous data streams.
- **High-Visibility Diagnostic Accents**: Purpose-built neon focal points where Electric Cobalt dictates intent and throughput velocity, while Acid Lime highlights critical tail latency, active telemetry beacons, and execution states.

## Colors

The color system operates as a strict semantic hierarchy engineered to prevent cognitive fatigue during prolonged operational benchmarks.

### Foundations & Canvas
- **Midnight Obsidian Canvas (Dark)**: `#05070C` serves as the underlying void across all monitors, hosting the background telemetry grid.
- **Deep Surface (Dark)**: `#0A0E17` functions as the primary panel and dashboard workbench background.
- **Elevated Diagnostic Surface (Dark)**: `#101726` anchors nested tables, code wells, input tracks, and diagnostic inspection cards.
- **Interactive Subtle (Dark)**: `#192338` handles active row states, segmented wells, and muted borders.
- **Light Workbench Canvas**: `#F4F7FB` (Background), `#FFFFFF` (Surface), and `#EDF2F9` (Elevated) provide a high-clarity engineering whitepaper alternative with surgical readability.

### Diagnostic & Interactive Accents
- **Electric Cobalt (`#2563EB` / `#3B82F6`)**: Applied to primary operational triggers, throughput baseline curves (p50), selection bounding rings, and network interface nodes.
- **Acid Lime (`#BEF264` / `#A3E635`)**: Reserved exclusively for high-signal telemetry: tail latency benchmarks (p95), real-time packet bursts, active runner status beacons, and high-impact action triggers. In light mode, typography shifts to `#3F6212` to preserve strict WCAG AAA legibility.
- **Amber Warning (`#F59E0B`)**: Extreme p99 outlier latency, pool connection queueing, and near-exhaustion thresholds.
- **Crimson Critical (`#EF4444` / `#DC2626`)**: SLO breaches, 5xx rate spikes, dropped connections, and dead execution tracks.

## Typography

The typography architecture uses a disciplined three-tier structure tailored for dense quantitative displays:

1. **Section Headers & Metric Units (`Plus Jakarta Sans`)**: Delivers tight, mechanical geometric punch across dashboard sections, page titles, and modal headers. Uses tight negative letter-spacing to prevent visual leakage in dense workspaces.
2. **Interface Body (`Inter`)**: Serves general prose, descriptive summaries, form label instructions, and diagnostic explanations with exceptional micro-scale legibility.
3. **Telemetry & Code (`JetBrains Mono`)**: Mandatory for all raw numeric values, latency outputs, request counts, network addresses, HTTP codes, and console traces. All numeric applications must declare `font-variant-numeric: tabular-nums` to eliminate jitter as values stream in real time.

## Layout & Spacing

The layout philosophy implements a rigid, high-density fluid-grid engineering canvas governed by a strict 4px coordinate base.

### Blueprint Grid & Viewport Alignment
- **Telemetry Blueprint Grid**: Base canvases feature an architectural 36px × 36px linear coordinate grid (`rgba(59, 130, 246, 0.06)`). Visual panels align to grid intersections.
- **Desktop Grid**: 12-column layout utilizing a 252px sticky collapsible utility rail, 24px gutters, and 24px outer margins, clamped at a maximum desktop width of 1680px for widescreen telemetry workstations.
- **Tablet / Split View (768px - 1023px)**: 8-column grid with 16px gutters; sidebars collapse into a 68px icon rail; metric cards shift into a 2x2 multi-card layout.
- **Mobile (320px - 767px)**: Single column stream with 16px margins, vertical graph stacking, and collapsible bottom utility drawers.

## Elevation & Depth

Visual hierarchy uses physical material layers rather than dramatic ambient drop shadows:

- **Surface 0 (Void)**: Base canvas `#05070C` containing the passive 36px coordinate grid.
- **Surface 1 (Base Panels)**: Background `#0A0E17` bounded by 1px hairline borders (`#182235`). Overlaid with a diagonal specular sheen gradient (`linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(10, 14, 23, 0) 50%, rgba(190, 242, 100, 0.05) 100%)`).
- **Surface 2 (Elevated & Modals)**: `#101726` with crisp structural borders (`#283A5A`) and an inset specular rim light (`inset 0 1px 0 rgba(255, 255, 255, 0.08)`).
- **Surface 3 (Active Telemetry Glow)**: Interactive buttons and high-priority alerts project tinted atmospheric glows:
  - Cobalt Interactive: `0 10px 34px -8px rgba(37, 99, 235, 0.42)`
  - Acid Lime Burst: `0 10px 30px -8px rgba(190, 242, 100, 0.25)`

## Shapes

The design uses an intentional, compact corner radius scale (`roundedness: 2`) that emphasizes industrial control consoles:

- **Interactive Inputs, Badges, and Small Buttons**: Standardize on `4px` to `6px` radius (`rounded-sm` / `rounded-md`) to ensure sharp rectangular precision.
- **Telemetry Cards & Data Containers**: Bound by `8px` (`rounded-lg`) to create distinct module boundaries without appearing bubbly.
- **Primary Viewport Shells & Drawers**: Capped at `12px` (`rounded-xl`).
- **Status Signal Beacons**: Strict geometric circles (`rounded-full`) used strictly for live status beacons and radio nodes.

## Components

### Buttons & Interactive Controls
- **Cobalt Specular Primary**: Solid vertical gradient (`linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)`) with an inset top rim (`inset 0 1px 0 rgba(255, 255, 255, 0.25)`), white bold typography, and a cobalt glow. 
- **Acid Lime Burst Action**: High-priority runner execution control (`linear-gradient(180deg, #BEF264 0%, #A3E635 100%)`) paired with midnight text (`#05070C`) and an inset highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.45)`).
- **Secondary Outlined Workbench**: Container surface `#101726` bound by a 1px `#283A5A` border, transitioning on hover to an `#BEF264` border with crisp white typography.

### Input Fields & Parameter Controls
- **Technical Inputs (URL, Concurrency, Ramp-Up)**: Background `#101726`, 1px border `#182235`, rendered in `JetBrains Mono` at 12px. Active focus strips standard browser outlines, applying `border-color: #BEF264` accompanied by a localized 2px soft lime glow ring.

### Telemetry Cards & Metric Panels
- **Metric Cards**: Background `#0A0E17` framed by a 1px hairline border (`#182235`) and the diagonal specular gradient. Metric titles sit unboxed in muted slate (`#7E8FA6`), followed by oversized tabular-numeric readouts in pure white (`#F8FAFC`) with monospace unit indicators (`req/s`, `ms`, `MB/s`).

### Chips & Unboxed Metadata
- **Inline Metadata Rows (`InlineMeta`)**: Favor unboxed typography lines using `JetBrains Mono` 12px separated by middle dot glyphs (`·`) colored in `#283A5A`, preventing noisy "badge soup".
- **Status Badges**: Translucent fills (`rgba(190, 242, 100, 0.13)`) paired with high-contrast text (`#BEF264`) and an animated 6px pulse beacon.

### Checkboxes, Radios & Switches
- **Toggles**: Compact rectangular sliders (`4px` radius) over `#192338` tracks that light up in vivid Cobalt or Lime on engagement.

### DevTools Wire Inspector
- Bottom-docked terminal drawer (`#0A0E17` at 95% opacity with `backdrop-blur-md`), utilizing monospace tab navigation, live streaming request rows, and colored method indicators (Cobalt for GET, Lime for POST, Amber for PUT, Red for DELETE).