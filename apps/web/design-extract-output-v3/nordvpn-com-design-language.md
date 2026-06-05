# Design Language: 링크 검사기: 이 URL은 안전한가요? | NordVPN

> Extracted from `https://nordvpn.com/ko/link-checker/` on June 5, 2026
> 1854 elements analyzed

This document describes the complete design language of the website. It is structured for AI/LLM consumption — use it to faithfully recreate the visual design in any framework.

## Color Palette

### Primary Colors

| Role | Hex | RGB | HSL | Usage Count |
|------|-----|-----|-----|-------------|
| Primary | `#3e5fff` | rgb(62, 95, 255) | hsl(230, 100%, 62%) | 267 |
| Secondary | `#e02f1f` | rgb(224, 47, 31) | hsl(5, 76%, 50%) | 8 |
| Accent | `#2563eb` | rgb(37, 99, 235) | hsl(221, 83%, 53%) | 6 |

### Neutral Colors

| Hex | HSL | Usage Count |
|-----|-----|-------------|
| `#2a2a2d` | hsl(240, 3%, 17%) | 2322 |
| `#f7f7f8` | hsl(240, 7%, 97%) | 522 |
| `#4f5054` | hsl(228, 3%, 32%) | 296 |
| `#000000` | hsl(0, 0%, 0%) | 148 |
| `#c8c9cb` | hsl(220, 3%, 79%) | 118 |
| `#696a6d` | hsl(225, 2%, 42%) | 48 |
| `#e2e2e4` | hsl(240, 4%, 89%) | 16 |
| `#b2b2b3` | hsl(240, 1%, 70%) | 12 |
| `#404040` | hsl(0, 0%, 25%) | 6 |
| `#141415` | hsl(240, 2%, 8%) | 5 |

### Background Colors

Used on large-area elements: `#ffffff`, `#f3f7fc`, `#141415`

### Text Colors

Text color palette: `#000000`, `#2a2a2d`, `#404040`, `#383c43`, `#ffffff`, `#2563eb`, `#3e5fff`, `#696a6d`, `#4f5054`, `#f7f7f8`

### Full Color Inventory

| Hex | Contexts | Count |
|-----|----------|-------|
| `#2a2a2d` | text, border | 2322 |
| `#f7f7f8` | background, text, border | 522 |
| `#4f5054` | text, border | 296 |
| `#3e5fff` | text, border, background | 267 |
| `#000000` | text, border | 148 |
| `#c8c9cb` | border, background, text | 118 |
| `#696a6d` | text, border | 48 |
| `#e2e2e4` | border | 16 |
| `#b2b2b3` | border, text | 12 |
| `#e02f1f` | background, border | 8 |
| `#404040` | text, border | 6 |
| `#2563eb` | background, border, text | 6 |
| `#141415` | background | 5 |

## Typography

### Font Families

- **Inter** — used for all (1142 elements)
- **Noto Sans KR** — used for all (712 elements)

### Type Scale

| Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Used On |
|-----------|------------|--------|-------------|----------------|---------|
| 48px | 3rem | 600 | 62.4px | -0.496px | h1, br |
| 40px | 2.5rem | 600 | 52px | -0.256px | h2, br |
| 32px | 2rem | 400 | 38.4px | normal | button, span, svg, path |
| 20px | 1.25rem | 600 | 30px | normal | p, div, a, button |
| 16px | 1rem | 400 | 24px | normal | html, head, meta, title |
| 14px | 0.875rem | 400 | 21px | normal | p, a, div, button |
| 12px | 0.75rem | 500 | 18px | normal | div, p, slot, astro-slot |
| 10px | 0.625rem | 500 | 15px | normal | div, span |

### Heading Scale

```css
h1 { font-size: 48px; font-weight: 600; line-height: 62.4px; }
h2 { font-size: 40px; font-weight: 600; line-height: 52px; }
h3 { font-size: 20px; font-weight: 600; line-height: 30px; }
h3 { font-size: 16px; font-weight: 400; line-height: 24px; }
```

### Body Text

```css
body { font-size: 16px; font-weight: 400; line-height: 24px; }
```

### Font Weights in Use

`400` (1227x), `500` (530x), `600` (84x), `700` (13x)

## Spacing

**Base unit:** 2px

| Token | Value | Rem |
|-------|-------|-----|
| spacing-2 | 2px | 0.125rem |
| spacing-16 | 16px | 1rem |
| spacing-20 | 20px | 1.25rem |
| spacing-24 | 24px | 1.5rem |
| spacing-32 | 32px | 2rem |
| spacing-40 | 40px | 2.5rem |
| spacing-56 | 56px | 3.5rem |
| spacing-64 | 64px | 4rem |

## Border Radii

| Label | Value | Count |
|-------|-------|-------|
| md | 6px | 67 |
| lg | 12px | 37 |
| xl | 20px | 2 |
| full | 9999px | 22 |

## Box Shadows

**sm** — blur: 0px
```css
box-shadow: rgba(42, 43, 50, 0.07) 0px 0px 0px 1px, rgba(42, 43, 50, 0.12) 0px 15px 20px 1px;
```

**sm** — blur: 0px
```css
box-shadow: rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 60, 67, 0.07) 0px 0px 0px 1px, rgba(56, 60, 67, 0.15) 0px 3px 6px 0px;
```

## CSS Custom Properties

### Colors

```css
--cl-primary: #2563eb;
--cl-primary-hover: #60a5fa;
--cl-secondary-hover: #2563eb;
--cl-secondary-text: #2563eb;
--cl-secondary-text-hover: #fff;
--cl-secondary-border: #2563eb;
--cl-font-color-title: #404040;
--cl-font-color-text: #404040;
--cl-btn-border-radius: 9999px;
--cl-wdgt-border-radius: 20px;
--cl-customize-color: #3b82f6;
--cl-primary-text: #fff;
--bg-primary: #f7f7f8;
--color-neutral-150: #ededed;
--border-inverse-primary: #3e3f42;
--text-accent: #3e5fff;
--bg-warning: #fac900;
--color-red-900: #5a0e07;
--text-color-nordpass: #43a5a1;
--color-neutral-600: #696a6d;
--text-primary-hover: #696a6d;
--color-blue-700: #243dcc;
--bg-inverse-primary: #141415;
--border-width-md: 1px;
--color-inverse-primary: #141415;
--color-neutral-300: #c8c9cb;
--color-brand-600: #3e5fff;
--bg-critical: #e02f1f;
--tw-inset-ring-shadow: 0 0 #0000;
--color-success-subtle: #ecf9ee;
--text-accent-hover: #6b90fa;
--color-neutral-200: #e2e2e4;
--color-blue-300: #b5cdf5;
--color-gray-300: oklch(87.2% .01 258.338);
--color-brand-400: #8caef8;
--color-gray-500: oklch(55.1% .027 264.364);
--color-brand-300: #b5cdf5;
--color-green-500: #0ea464;
--border-color-tertiary: #b2b2b3;
--text-color-primary-hover: #696a6d;
--color-white: #fff;
--border-warning: #fac900;
--color-blue-400: #8caef8;
--color-accent: #3e5fff;
--bg-tertiary: #ededed;
--text-color-warning: #654a0b;
--color-yellow-300: #fac900;
--bg-critical-subtle: #fcefee;
--color-brand-100: #f3f7fc;
--color-gray-100: oklch(96.7% .003 264.542);
--border-inverse-primary-hover: #696a6d;
--border-reversed: #141415;
--border-color-primary: #c8c9cb;
--color-neutral-700: #4f5054;
--color-text-coveron: #c74800;
--color-green-900: #043420;
--color-tertiary: #ededed;
--color-blue-800: #263482;
--color-critical-hover: #ec6255;
--text-color-success: #075f3c;
--ring-focus-inset: inset 0 0 0 2px #3e5fff,inset 0 0 0 4px #fff;
--color-neutral-900: #2a2a2d;
--bg-accent-active: #243dcc;
--border-critical: #e02f1f;
--border-critical-active: #9e1c10;
--text-color-warning-subtle: #fac900;
--color-neutral-100: #f7f7f8;
--fill-accent-subtle: #f3f7fc;
--color-blue-100: #f3f7fc;
--text-secondary: #4f5054;
--color-green-600: #0a8550;
--fill-secondary: #fff;
--text-color-success-subtle: #37c871;
--color-red-300: #f6beb9;
--border-width-lg: 2px;
--border-color-secondary: #e2e2e4;
--border-width-xl: 3px;
--color-brand-200: #d4e2f7;
--text-color-secondary-on-color: #f7f7f8;
--text-color-disabled: #b2b2b3;
--text-color-accent-on-dark: #6b90fa;
--border-secondary: #e2e2e4;
--color-text-nordpass: #43a5a1;
--color-neutral-1000: #141415;
--color-secondary: #fff;
--text-color-tertiary: #696a6d;
--border-color-inverse-primary: #3e3f42;
--bg-accent: #3e5fff;
--color-brand-500: #6b90fa;
--color-green-400: #37c871;
--border-tertiary: #b2b2b3;
--bg-nordlocker: #dddcfb;
--color-neutral-0: #fff;
--border-color-critical: #e02f1f;
--text-color-critical-subtle: #e02f1f;
--border-input: #909192;
--color-gray-600: oklch(44.6% .03 256.802);
--color-accent-hover: #6b90fa;
--color-yellow-200: #fee071;
--color-blue-600: #3e5fff;
--tw-border-style: solid;
--text-primary: #2a2a2d;
--color-red-600: #e02f1f;
--border-color-accent-subtle: #f3f7fc;
--border-color-warning: #fac900;
--color-neutral-950: #1d1e20;
--color-black: #000;
--text-color-accent: #3e5fff;
--text-color-accent-hover: #6b90fa;
--color-neutral-400: #b2b2b3;
--tw-border-spacing-y: 0px;
--bg-success-subtle: #ecf9ee;
--text-color-accent-active: #243dcc;
--color-bg-nordlocker: #dddcfb;
--border-color-accent: #3e5fff;
--text-color-secondary: #4f5054;
--tw-ring-shadow: 0 0 #0000;
--cl-secondary: #fff;
--color-yellow-600: #8e6c10;
--text-primary-on-color: #fff;
--color-neutral-500: #909192;
--text-accent-on-dark: #6b90fa;
--color-green-100: #ecf9ee;
--tw-border-spacing-x: 0px;
--color-red-200: #f9d7d3;
--color-neutral-1000-50: #14141580;
--text-color-primary-on-color: #fff;
--text-color-coveron: #c74800;
--color-text-nordlocker: #7f7aee;
--bg-secondary: #fff;
--color-critical-subtle: #fcefee;
--border-color-inverse-primary-hover: #696a6d;
--border-color-accent-active: #243dcc;
--border-width-none: 0;
--tw-ring-offset-color: #fff;
--border-critical-hover: #ec6255;
--color-red-400: #f29086;
--border-color-accent-hover: #6b90fa;
--color-critical: #e02f1f;
--text-color-nordlocker: #7f7aee;
--border-accent-hover: #6b90fa;
--color-bg-nordpass: #c9e9e8;
--color-red-800: #771209;
--color-red-500: #ec6255;
--tw-ring-offset-width: 0px;
--bg-inverse-secondary: #1d1e20;
--bg-accent-subtle: #f3f7fc;
--border-color-success: #37c871;
--bg-critical-hover: #ec6255;
--color-warning-subtle: #fff6db;
--border-focus: #3e5fff;
--color-yellow-100: #fff6db;
--tw-ring-offset-shadow: 0 0 #0000;
--color-accent-active: #243dcc;
--border-primary: #c8c9cb;
--text-color-placeholder: #696a6d;
--text-accent-active: #243dcc;
--fill-primary: #f7f7f8;
--ring-focus: 0px 0px 0 2px #fff,0 0 0 4px #3e5fff;
--fill-accent: #3e5fff;
--bg-critical-active: #9e1c10;
--color-warning: #fac900;
--text-color-critical: #9e1c10;
--color-yellow-700: #654a0b;
--bg-nordpass: #c9e9e8;
--color-critical-active: #9e1c10;
--color-success: #0a8550;
--bg-accent-hover: #6b90fa;
--color-inverse-secondary: #1d1e20;
--color-red-700: #9e1c10;
--bg-success: #0a8550;
--color-brand-800: #263482;
--color-blue-500: #6b90fa;
--border-color-focus: #3e5fff;
--color-yellow-900: #3c2a07;
--color-nordlocker: #dddcfb;
--border-accent-subtle: #f3f7fc;
--border-color-reversed: #141415;
--text-color-primary: #2a2a2d;
--color-accent-subtle: #f3f7fc;
--color-red-100: #fcefee;
--border-color-input: #909192;
--text-secondary-on-color: #f7f7f8;
--border-accent: #3e5fff;
--border-color-critical-hover: #ec6255;
--color-blue-200: #d4e2f7;
--color-primary: #f7f7f8;
--bg-warning-subtle: #fff6db;
--color-gray-200: oklch(92.8% .006 264.531);
--color-red-950: #450c07;
--color-nordpass: #c9e9e8;
--border-accent-active: #243dcc;
--color-green-700: #075f3c;
--border-success: #37c871;
--color-neutral-800: #3e3f42;
--border-color-critical-active: #9e1c10;
```

### Spacing

```css
--cl-font-size-button: 16px;
--container-margin: 32px;
--spacing-12: 3rem;
--letterSpacing-sm: -.016rem;
--tw-space-x-reverse: 0;
--spacing-5: 1.25rem;
--spacing-4: 1rem;
--spacing-1: .25rem;
--letterSpacing-2xs: -.046875rem;
--spacing-6: 1.5rem;
--spacing: .25rem;
--spacing-0: 0px;
--spacing-24: 6rem;
--tw-space-y-reverse: 0;
--spacing-8: 2rem;
--spacing-20: 5rem;
--spacing-3: .75rem;
--spacing-10: 2.5rem;
--letterSpacing-xs: -.031rem;
--spacing-2: .5rem;
--spacing-16: 4rem;
```

### Typography

```css
--text-placeholder: #696a6d;
--font-body: "Inter","Helvetica Neue","Helvetica","Arial","sans-serif";
--font-mono: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
--line-height-md: 1.5;
--text-nordpass: #43a5a1;
--font-weight-bold: 600;
--text-2xs: .625rem;
--text-xs--line-height: calc(1/.75);
--line-height-xs: 1.3;
--line-height-2xs: 1.2;
--text-xl: 1.375rem;
--font-main: "Inter","Helvetica Neue","Helvetica","Arial","sans-serif";
--text-md: 1rem;
--text-sm: .875rem;
--text-4xl--line-height: 1.1;
--text-critical: #9e1c10;
--text-2xl: 1.75rem;
--text-lg: 1.25rem;
--text-5xl--line-height: 1;
--text-critical-subtle: #e02f1f;
--text-coveron: #c74800;
--text-disabled: #b2b2b3;
--text-warning: #654a0b;
--text-lg--line-height: 1.5;
--text-md--line-height: 1.5;
--text-6xl: 4rem;
--default-font-family: "Inter","Helvetica Neue","Helvetica","Arial","sans-serif";
--font-inter: "Inter","Helvetica Neue","Helvetica","Arial","sans-serif";
--text-nordlocker: #7f7aee;
--text-success: #075f3c;
--text-tertiary: #696a6d;
--text-warning-subtle: #fac900;
--font-weight-semibold: 600;
--leading-md: 1.5;
--text-4xl: 2.5rem;
--leading-sm: 1.4;
--text-sm--line-height: calc(1.25/.875);
--text-3xl--line-height: 1.2;
--text-5xl: 3rem;
--text-3xl: 2rem;
--text-xs: .75rem;
--font-weight-medium: 500;
--font-weight-normal: 400;
--text-success-subtle: #37c871;
--default-mono-font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
--line-height-sm: 1.4;
```

### Shadows

```css
--tw-inset-shadow-alpha: 100%;
--tw-inset-shadow: 0 0 #0000;
--tw-shadow-alpha: 100%;
--tw-drop-shadow-alpha: 100%;
--tw-shadow: 0 0 #0000;
```

### Radii

```css
--radius-none: 0;
--radius-sm: 6px;
--radius-md: 12px;
--radius-lg: 20px;
--radius-full: 9999px;
--radius-xs: 3px;
--radius-xl: .75rem;
```

### Other

```css
--cl-active: #1d4ed8;
--cl-toggle-checked: #2563eb;
--cl-toggle-focus: #2563eb;
--container-md: 28rem;
--tw-outline-style: solid;
--ease-in: cubic-bezier(.4,0,1,1);
--opacity-100: 100%;
--tw-gradient-from: rgba(0, 0, 0, 0);
--tw-gradient-to: rgba(0, 0, 0, 0);
--tw-gradient-via-position: 50%;
--tw-gradient-to-position: 100%;
--background-image-beam: conic-gradient(#1d1e20,#6b90fa,0deg,#1d1e20,#6b90fa,#1d1e20);
--default-transition-duration: .25s;
--container-xs: 20rem;
--default-transition-timing-function: cubic-bezier(.4,0,.2,1);
--tw-translate-z: 0;
--tw-gradient-via: rgba(0, 0, 0, 0);
--tw-scale-y: 1;
--cl-link: #383c43;
--container-3xl: 48rem;
--tw-translate-y: 0;
--blur-xs: 4px;
--ease-out: cubic-bezier(0,0,.2,1);
--tw-content: "";
--tw-translate-x: 0;
--transition-duration-fast: .15s;
--transition-duration-medium: .25s;
--opacity-50: 50%;
--fill-dark: #141415;
--fill-tertiary: #e2e2e4;
--opacity-0: 0%;
--cl-link-hover: #73757a;
--cl-default-container-width: 360px;
--container-max: calc(1200px - 32px);
--tw-scale-z: 1;
--duration-DEFAULT: .25s;
--transition-duration-slow: .4s;
--tw-scroll-snap-strictness: proximity;
--screen-sm: 640px;
--tw-gradient-from-position: 0%;
--cl-modal-background: #fff;
--ease-in-out: cubic-bezier(.4,0,.2,1);
--ease-DEFAULT: cubic-bezier(.4,0,.2,1);
--screen-lg: 992px;
--animate-spin: spin 1s linear infinite;
--screen-md: 768px;
--screen-xl: 1200px;
--tw-scale-x: 1;
--cl-backdrop: rgba(21, 25, 34, .6);
```

### Semantic

```css
success: [object Object];
warning: [object Object];
error: [object Object];
info: [object Object];
```

## Breakpoints

| Name | Value | Type |
|------|-------|------|
| sm | 640px | min-width |
| md | 767px | max-width |
| md | 768px | min-width |
| 900px | 900px | max-width |
| lg | 990px | min-width |
| lg | 992px | min-width |
| 1200px | 1200px | min-width |

## Transitions & Animations

**Easing functions:** `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`

**Durations:** `0.25s`, `0.4s`, `0.3s`

### Common Transitions

```css
transition: all;
transition: box-shadow 0.25s ease-out;
transition: color 0.25s, opacity 0.25s ease-out;
transition: color 0.25s ease-out, background-color 0.25s ease-out, border-color 0.25s ease-out;
transition: top 0.4s cubic-bezier(0, 0, 0.2, 1);
transition: color 0.25s cubic-bezier(0, 0, 0.2, 1), background-color 0.25s cubic-bezier(0, 0, 0.2, 1), border-color 0.25s cubic-bezier(0, 0, 0.2, 1), outline-color 0.25s cubic-bezier(0, 0, 0.2, 1), text-decoration-color 0.25s cubic-bezier(0, 0, 0.2, 1), fill 0.25s cubic-bezier(0, 0, 0.2, 1), stroke 0.25s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-from 0.25s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-via 0.25s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-to 0.25s cubic-bezier(0, 0, 0.2, 1);
transition: color 0.3s cubic-bezier(0, 0, 0.2, 1), background-color 0.3s cubic-bezier(0, 0, 0.2, 1), border-color 0.3s cubic-bezier(0, 0, 0.2, 1), outline-color 0.3s cubic-bezier(0, 0, 0.2, 1), text-decoration-color 0.3s cubic-bezier(0, 0, 0.2, 1), fill 0.3s cubic-bezier(0, 0, 0.2, 1), stroke 0.3s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-from 0.3s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-via 0.3s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-to 0.3s cubic-bezier(0, 0, 0.2, 1);
transition: 0.25s cubic-bezier(0.4, 0, 1, 1);
transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), fill 0.25s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.25s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.25s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.25s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.25s cubic-bezier(0.4, 0, 0.2, 1);
```

### Keyframe Animations

**fadeIn**
```css
@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
```

**fadeOut**
```css
@keyframes fadeOut {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
```

**beamSpin**
```css
@keyframes beamSpin {
  0% { transform: translate(-50%, -50%) rotate(0deg); }
  100% { transform: translate(-50%, -50%) rotate(1turn); }
}
```

**fadeInUp**
```css
@keyframes fadeInUp {
  0% { opacity: 0; transform: translateY(6rem); }
  100% { opacity: 1; transform: translateY(0px); }
}
```

**safariFixBalance**
```css
@keyframes safariFixBalance {
  0% { text-wrap: unset; }
  100% { text-wrap: balance; }
}
```

**spin**
```css
@keyframes spin {
  100% { transform: rotate(360deg); }
}
```

**ping**
```css
@keyframes ping {
  75%, 100% { opacity: 0; transform: scale(2); }
}
```

**pulse**
```css
@keyframes pulse {
  50% { opacity: 0.5; }
}
```

**rotateAnimation**
```css
@keyframes rotateAnimation {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(-10deg); }
  20% { transform: rotate(10deg); }
  30% { transform: rotate(-8deg); }
  40% { transform: rotate(8deg); }
  50% { transform: rotate(-6deg); }
  60% { transform: rotate(6deg); }
  70% { transform: rotate(-4deg); }
  80% { transform: rotate(4deg); }
  90% { transform: rotate(-1deg); }
  100% { transform: rotate(1deg); }
}
```

**enter**
```css
@keyframes enter {
  0% { translate: 0px 40px; opacity: 0; }
  100% { translate: 0px; opacity: 1; }
}
```

## Component Patterns

Detected UI component patterns and their most common styles:

### Buttons (56 instances)

```css
.button {
  background-color: rgb(224, 47, 31);
  color: rgb(42, 42, 45);
  font-size: 16px;
  font-weight: 500;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 0px;
}
```

### Cards (9 instances)

```css
.card {
  background-color: rgb(255, 255, 255);
  border-radius: 12px;
  box-shadow: rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 60, 67, 0.07) 0px 0px 0px 1px, rgba(56, 60, 67, 0.15) 0px 3px 6px 0px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Inputs (5 instances)

```css
.input {
  background-color: rgb(255, 255, 255);
  color: rgb(247, 247, 248);
  border-color: rgb(247, 247, 248);
  border-radius: 0px;
  font-size: 14px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Links (177 instances)

```css
.link {
  color: rgb(42, 42, 45);
  font-size: 14px;
  font-weight: 500;
}
```

### Navigation (182 instances)

```css
.navigatio {
  background-color: rgb(255, 255, 255);
  color: rgb(42, 42, 45);
  padding-top: 0px;
  padding-bottom: 0px;
  padding-left: 0px;
  padding-right: 0px;
  position: static;
}
```

### Footer (1 instances)

```css
.foote {
  background-color: rgb(20, 20, 21);
  color: rgb(247, 247, 248);
  padding-top: 0px;
  padding-bottom: 0px;
  font-size: 16px;
}
```

### Modals (1 instances)

```css
.modal {
  background-color: rgb(255, 255, 255);
  border-radius: 20px;
  box-shadow: rgba(42, 43, 50, 0.07) 0px 0px 0px 1px, rgba(42, 43, 50, 0.12) 0px 15px 20px 1px;
  padding-top: 24px;
  padding-right: 24px;
}
```

### Dropdowns (16 instances)

```css
.dropdown {
  border-radius: 0px;
  border-color: rgb(42, 42, 45);
  padding-top: 0px;
}
```

### Tables (1 instances)

```css
.table {
  border-color: rgb(42, 42, 45);
  background-color: rgb(255, 255, 255);
  cell-style: [object Object];
}
```

### Tabs (2 instances)

```css
.tab {
  background-color: rgb(243, 247, 252);
  color: rgb(105, 106, 109);
  font-size: 14px;
  font-weight: 500;
  padding-top: 12px;
  padding-right: 12px;
  border-color: rgb(105, 106, 109);
  border-radius: 0px;
}
```

### Accordions (22 instances)

```css
.accordion {
  background-color: rgb(255, 255, 255);
  color: rgb(42, 42, 45);
  font-size: 16px;
  padding-top: 0px;
  padding-right: 0px;
  border-color: rgb(247, 247, 248);
}
```

### Switches (16 instances)

```css
.switche {
  border-radius: 0px;
  border-color: rgb(42, 42, 45);
}
```

## Component Clusters

Reusable component instances grouped by DOM structure and style similarity:

### Button — 4 instances, 2 variants

**Variant 1** (3 instances)

```css
  background: rgb(37, 99, 235);
  color: rgb(255, 255, 255);
  padding: 12px 28px 12px 28px;
  border-radius: 9999px;
  border: 0px none rgb(37, 99, 235);
  font-size: 16px;
  font-weight: 600;
```

**Variant 2** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(200, 201, 203);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(200, 201, 203);
  font-size: 14px;
  font-weight: 500;
```

### Button — 7 instances, 2 variants

**Variant 1** (5 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(42, 42, 45);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(42, 42, 45);
  font-size: 14px;
  font-weight: 500;
```

**Variant 2** (2 instances)

```css
  background: rgb(20, 20, 21);
  color: rgb(247, 247, 248);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px 1px 0px 0px solid rgb(178, 178, 179);
  font-size: 16px;
  font-weight: 400;
```

### Button — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(42, 42, 45);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(42, 42, 45);
  font-size: 14px;
  font-weight: 500;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(42, 42, 45);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(42, 42, 45);
  font-size: 14px;
  font-weight: 500;
```

### Button — 3 instances, 1 variant

**Variant 1** (3 instances)

```css
  background: rgb(224, 47, 31);
  color: rgb(255, 255, 255);
  padding: 7px 24px 7px 24px;
  border-radius: 9999px;
  border: 1px solid rgb(224, 47, 31);
  font-size: 12px;
  font-weight: 600;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(243, 247, 252);
  color: rgb(62, 95, 255);
  padding: 12px 12px 12px 12px;
  border-radius: 0px;
  border: 0px solid rgb(62, 95, 255);
  font-size: 14px;
  font-weight: 500;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(62, 95, 255);
  color: rgb(255, 255, 255);
  padding: 11px 28px 11px 28px;
  border-radius: 9999px;
  border: 1px solid rgb(62, 95, 255);
  font-size: 16px;
  font-weight: 600;
```

### Button — 3 instances, 1 variant

**Variant 1** (3 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(42, 42, 45);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(42, 42, 45);
  font-size: 16px;
  font-weight: 400;
```

### Card — 3 instances, 1 variant

**Variant 1** (3 instances)

```css
  background: rgb(255, 255, 255);
  color: rgb(42, 42, 45);
  padding: 24px 24px 24px 24px;
  border-radius: 12px;
  border: 1px solid rgb(226, 226, 228);
  font-size: 16px;
  font-weight: 400;
```

### Button — 6 instances, 1 variant

**Variant 1** (6 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(42, 42, 45);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px solid rgb(42, 42, 45);
  font-size: 16px;
  font-weight: 500;
```

## Layout System

**14 grid containers** and **356 flex containers** detected.

### Container Widths

| Max Width | Padding |
|-----------|---------|
| 1168px | 0px |
| 100% | 0px |

### Grid Column Patterns

| Columns | Usage Count |
|---------|-------------|
| 12-column | 7x |
| 3-column | 2x |
| 2-column | 2x |
| 1-column | 2x |
| 4-column | 1x |

### Grid Templates

```css
grid-template-columns: 1168px;
grid-template-columns: 68px 68px 68px 68px 68px 68px 68px 68px 68px 68px 68px 68px;
gap: 32px;
grid-template-columns: 568px 568px;
gap: 32px;
grid-template-columns: 568px 568px;
gap: 32px;
grid-template-columns: 268px 268px 268px 268px;
gap: 32px;
```

### Flex Patterns

| Direction/Wrap | Count |
|----------------|-------|
| row/wrap | 5x |
| row/nowrap | 232x |
| column/nowrap | 119x |

**Gap values:** `0px 32px`, `12px`, `12px 24px`, `16px`, `16px normal`, `24px`, `24px normal`, `32px`, `40px`, `40px normal`, `4px`, `4px normal`, `8px`, `8px normal`, `normal 16px`, `normal 32px`, `normal 8px`

## Accessibility (WCAG 2.1)

**Overall Score: 100%** — 11 passing, 0 failing color pairs

### Passing Color Pairs

| Foreground | Background | Ratio | Level |
|------------|------------|-------|-------|
| `#ffffff` | `#e02f1f` | 4.57:1 | AA |
| `#ffffff` | `#3e5fff` | 4.9:1 | AA |
| `#ffffff` | `#2563eb` | 5.17:1 | AA |
| `#2563eb` | `#ffffff` | 5.17:1 | AA |

## Design System Score

**Overall: 94/100 (Grade: A)**

| Category | Score |
|----------|-------|
| Color Discipline | 92/100 |
| Typography Consistency | 90/100 |
| Spacing System | 100/100 |
| Shadow Consistency | 100/100 |
| Border Radius Consistency | 100/100 |
| Accessibility | 100/100 |
| CSS Tokenization | 100/100 |

**Strengths:** Tight, disciplined color palette, Consistent typography system, Well-defined spacing scale, Clean elevation system, Consistent border radii, Strong accessibility compliance, Good CSS variable tokenization

**Issues:**
- 122 !important rules — prefer specificity over overrides
- 2021 duplicate CSS declarations

## Z-Index Map

**7 unique z-index values** across 3 layers.

| Layer | Range | Elements |
|-------|-------|----------|
| modal | 9998,10000 | div.o.p.a.c.i.t.y.-.5.0. .f.i.x.e.d. .w.-.f.u.l.l. .h.-.f.u.l.l. .t.o.p.-.0. .l.e.f.t.-.0. .b.g.-.i.n.v.e.r.s.e.-.p.r.i.m.a.r.y. .z.-.9.9.9.8. .h.i.d.d.e.n, div.b.g.-.s.e.c.o.n.d.a.r.y. .f.i.x.e.d. .t.o.p.-.0. .t.r.a.n.s.i.t.i.o.n.-.a.l.l. .e.a.s.e.-.i.n. .h.-.f.u.l.l. .w.-.[.3.2.0.p.x.]. .s.c.r.o.l.l.b.a.r.-.n.o.n.e. .z.-.9.9.9.9. .o.v.e.r.f.l.o.w.-.x.-.h.i.d.d.e.n. .o.v.e.r.f.l.o.w.-.y.-.s.c.r.o.l.l. .s.h.a.d.o.w.-.l.g. .t.r.a.n.s.i.t.i.o.n. .l.t.r.:.-.r.i.g.h.t.-.8.0. .r.t.l.:.-.l.e.f.t.-.8.0. .i.n.v.i.s.i.b.l.e, div.C.o.n.s.e.n.t.W.i.d.g.e.t._._.c.o.n.t.a.i.n.e.r |
| sticky | 10,50 | div.g.r.i.d. .s.m.:.g.a.p.-.x.-.8. .m.d.:.g.r.i.d.-.c.o.l.s.-.3. .g.r.i.d.-.c.o.l.s.-.1. .g.a.p.-.y.-.8. .r.e.l.a.t.i.v.e. .z.-.1.0, div.f.l.e.x. .f.l.e.x.-.c.o.l. .w.-.f.u.l.l. .i.t.e.m.s.-.s.t.a.r.t. .t.e.x.t.-.s.t.a.r.t. .g.a.p.-.4. .h.-.f.u.l.l. .z.-.1.0, div.f.l.e.x. .f.l.e.x.-.c.o.l. .w.-.f.u.l.l. .i.t.e.m.s.-.s.t.a.r.t. .t.e.x.t.-.s.t.a.r.t. .g.a.p.-.4. .h.-.f.u.l.l. .z.-.1.0 |
| base | -1,-1 | select.i.n.v.i.s.i.b.l.e. .a.b.s.o.l.u.t.e. .z.-.[.-.1.]. .f.o.n.t.-.m.e.d.i.u.m. .t.e.x.t.-.x.s. .m.d.:.t.e.x.t.-.s.m. .a.p.p.e.a.r.a.n.c.e.-.n.o.n.e. .w.-.a.u.t.o. .b.o.r.d.e.r.-.n.o.n.e. .b.a.c.k.g.r.o.u.n.d.-.n.o.n.e |

**Issues:**
- [object Object]

## SVG Icons

**29 unique SVG icons** detected. Dominant style: **filled**.

| Size Class | Count |
|------------|-------|
| sm | 5 |
| md | 16 |
| lg | 7 |
| xl | 1 |

**Icon colors:** `currentColor`

## Font Files

| Family | Source | Weights | Styles |
|--------|--------|---------|--------|
| Noto Sans KR | self-hosted | 400 | normal |

## Image Style Patterns

| Pattern | Count | Key Styles |
|---------|-------|------------|
| thumbnail | 54 | objectFit: fill, borderRadius: 0px, shape: square |
| gallery | 2 | objectFit: fill, borderRadius: 0px, shape: square |

**Aspect ratios:** 1:1 (52x), 3.36:1 (2x), 7.54:1 (1x), 8.88:1 (1x)

## Motion Language

**Feel:** responsive · **Scroll-linked:** yes

### Duration Tokens

| name | value | ms |
|---|---|---|
| `sm` | `250ms` | 250 |
| `md` | `300ms` | 300 |

### Easing Families

- **ease-in-out** (5 uses) — `ease`
- **ease-out** (185 uses) — `cubic-bezier(0, 0, 0.2, 1)`
- **ease-in** (6 uses) — `cubic-bezier(0.4, 0, 1, 1)`
- **custom** (41 uses) — `cubic-bezier(0.4, 0, 0.2, 1)`

## Component Anatomy

### button — 28 instances

**Slots:** label
**Variants:** outline · tertiary · primary
**Sizes:** md · medium · sm

| variant | count | sample label |
|---|---|---|
| outline | 20 | 사용자 정의 |
| default | 3 | 동의 |
| tertiary | 3 | 모든 플랫폼에서 작동 |
| primary | 2 |  |

### card — 3 instances

**Slots:** description
**Variants:** secondary
**Sizes:** md

## Brand Voice

**Tone:** neutral · **Pronoun:** third-person · **Headings:** all-lowercase (tight)

### Top CTA Verbs

- **nordvpn** (2)
- **pdf** (1)

### Button Copy Patterns

- "nordvpn 구매하기" (2×)
- "동의" (1×)
- "거부" (1×)
- "사용자 정의" (1×)
- "알아보기" (1×)
- "제품" (1×)
- "파일 검사기" (1×)
- "‌
파일 추가" (1×)
- "더 알아보기" (1×)
- "모든 플랫폼에서 작동" (1×)

### Sample Headings

> 이 파일은 안전한가요?
> 파일 검사기의 기능은 무엇인가요?
> NordVPN의 파일 검사기를 선택해야 하는 이유
> 모든 플랫폼에서 작동
> 전문가가 개발한 도구
> 이 파일은 안전한가요?
> 파일 검사기의 기능은 무엇인가요?
> NordVPN의 파일 검사기를 선택해야 하는 이유
> 모든 플랫폼에서 작동
> 전문가가 개발한 도구

## Page Intent

**Type:** `unknown` (confidence 0)
**Description:** 다운로드한 파일의 바이러스 감염 여부가 우려되시나요? NordVPN의 무료 온라인 파일 검사기 도구를 사용하여 알려진 멀웨어 서명이 있는지 검사하세요.

## Section Roles

Reading order (top→bottom): content → nav → content → nav → content → nav → content → nav → content → nav → content → nav → nav → content → nav → content → nav → content → nav → content → nav → content → nav → content → nav → content → nav → content → content → content → content → content → content → nav → content → nav → content → hero → sidebar → content → content → content → content → hero → content → footer

| # | Role | Heading | Confidence |
|---|------|---------|------------|
| 0 | nav | — | 0.4 |
| 1 | content | — | 0.3 |
| 2 | nav | — | 0.9 |
| 3 | content | — | 0.3 |
| 4 | nav | — | 0.4 |
| 5 | content | — | 0.3 |
| 6 | nav | — | 0.4 |
| 7 | content | — | 0.3 |
| 8 | nav | — | 0.4 |
| 9 | content | — | 0.3 |
| 10 | nav | — | 0.4 |
| 11 | content | — | 0.3 |
| 12 | nav | — | 0.4 |
| 13 | content | — | 0.3 |
| 14 | nav | — | 0.4 |
| 15 | nav | — | 0.9 |
| 16 | content | — | 0.3 |
| 17 | nav | — | 0.4 |
| 18 | content | — | 0.3 |
| 19 | nav | — | 0.4 |

## Material Language

**Label:** `flat` (confidence 0)

| Metric | Value |
|--------|-------|
| Avg saturation | 0.208 |
| Shadow profile | soft |
| Avg shadow blur | 0px |
| Max radius | 9999px |
| backdrop-filter in use | no |
| Gradients | 0 |

## Imagery Style

**Label:** `flat-illustration` (confidence 0.068)
**Counts:** total 56, svg 55, icon 50, screenshot-like 0, photo-like 0
**Dominant aspect:** square-ish
**Radius profile on images:** square

## Component Library

**Detected:** `tailwindcss` (confidence 0.443)

Evidence:
- tailwind-like class density 47%

## Quick Start

To recreate this design in a new project:

1. **Install fonts:** Add `Inter` from Google Fonts or your font provider
2. **Import CSS variables:** Copy `variables.css` into your project
3. **Tailwind users:** Use the generated `tailwind.config.js` to extend your theme
4. **Design tokens:** Import `design-tokens.json` for tooling integration
