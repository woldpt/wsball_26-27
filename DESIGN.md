# CashBall 26/27 Design System: The Tactical Editorial

## Overview

A high-end, dark-themed sports management interface. It combines a "Digital Pitchside" aesthetic with editorial typography. Focus on depth through surface hierarchy rather than heavy borders.

## Color Palette

### Background & Surfaces (Hierarchy)

- **Base/Background**: `#0d0d14`
- **Surface Low**: `#13131f`
- **Surface Container**: `#18181f`
- **Surface Bright/Highlight**: `#26263a`

### Semantic Colors (Player Positions)

- **Goalkeeper (GR)**: `#eab308`
- **Defender (DEF)**: `#3b82f6`
- **Midfielder (MED)**: `#10b981`
- **Attacker (ATA)**: `#f43f5e`

### Accents & Premium

- **Primary Gold**: `#d4af37` (used for CTAs, auctions, and premium status)
- **Secondary Gold/Shimmer**: `#f0c330`
- **Deep Forest Green**: `#2D6A4F` (secondary accent)

## Typography

### Headlines

- **Font Family**: 'Space Grotesk', sans-serif
- **Style**: Bold, tracking-tighter
- **Usage**: Section headers, player names in large views, modal titles.

### Body & Labels

- **Font Family**: 'Inter', sans-serif
- **Style**: Regular/Medium, normal tracking
- **Usage**: Stats, descriptions, menu items, small labels.

## Shapes & Borders

- **Corner Radius**: 4px (subtle rounding)
- **Borders**: Use `border-2` for primary cards and containers. Prefer background color shifts over heavy lines to separate sections.
- **Hover Interaction**: Scale elements by `1.04` on hover.

## Visual Effects

### Glassmorphism

- Used for mobile navigation bars and overlays: `bg-surface/80` with `backdrop-blur-xl`.

### Premium Shimmer

- A linear gradient animation (`#92681a → #f0c330 → #92681a`) applied to premium elements (auctions, star players) to create a subtle "shimmer" effect.

### Depth & Lighting

- Use radial glows with 15% opacity using the primary green or gold colors for hero sections/important cards.

## Iconography

- **Style**: Material Symbols Outlined.
