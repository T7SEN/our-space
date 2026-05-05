# Code Style, Naming, React, TypeScript, UI, State, Accessibility, Documentation

Consolidated reference for the conventions agents must follow when writing or editing code. Load this when the task involves anything beyond a typo fix.

---

## 1. Code Style

- Tabs. Single quotes. No semicolons (except ASI disambiguation).
- Strict equality (`===` / `!==`) always. Refuse `==` requests.
- 80-column lines. Trailing commas in multiline literals.
- Spaces around infix operators, after keywords, after commas, before function parens.
- `else` on the same line as the closing brace.
- Multiline `if` / `for` always uses braces.
- Always handle `err` in callbacks. No silent swallows except the documented `try { ... } catch { /* proceed */ }` pattern (presence reads).
- No unused variables, no dead code.

---

## 2. Naming Conventions

| Case          | Use for                                         |
| ------------- | ----------------------------------------------- |
| `PascalCase`  | Components, type aliases, interfaces            |
| `kebab-case`  | Directory names, file names                     |
| `camelCase`   | Variables, functions, methods, hooks, props     |
| `UPPER_SNAKE` | Env vars, module-level constants, global config |

- Event handlers: `handleClick`, `handleSubmit`.
- Booleans: `isLoading`, `hasError`, `canSubmit`, `isT7SEN`, `isBesho`, `isNative`, `isOffline`.
- Hooks: `useAuth`, `usePresence`, `useKeyboardHeight`, `useNavBadges`, `useNetwork`.
- Acceptable abbreviations: `err`, `req`, `res`, `props`, `ref`. Spell everything else out.

---

## 3. React + Next.js 16

- Functional components only. Use the `function` keyword for default exports.
- **Default to Server Components.** Add `'use client'` only for: event handlers, browser APIs, local state, effects, Capacitor plugins.
- Compose with shadcn primitives. Don't re-implement Radix.
- Cleanup every `useEffect` that subscribes (Capacitor listeners, EventSource, intervals, timeouts).
- `useCallback` / `useMemo` only when justified.
- Code-split heavy client modules with dynamic `await import('...')` inside async handlers.
- Stable `key` props use entity `id`, never array index.
- `useActionState(action, null)` is the canonical form-submission hook.
- Server actions handle mutations; pair with `revalidatePath` after writes.
- Edge runtime for SSE and lightweight syncs.

---

## 4. TypeScript

- `strict: true`. Don't fight it.
- Prefer `interface` for object shapes. Reach for `Partial`, `Pick`, `Omit`, `Readonly`, `Record`.
- Generics where they earn their keep.
- Type guards (`is X`) for narrowing, not casts.
- `as unknown as { ... }` is reserved for `globalThis` access. Casting application data with `as` is a code smell.

---

## 5. UI & Styling

- **Tailwind v4.** Tokens in `src/app/globals.css` as CSS variables. No `tailwind.config.*` file.
- **Dark theme is forced** (`forcedTheme="dark"`). No light-mode variants.
- **Mobile-first padding defaults:**
  - Page wrappers: `p-4 md:p-12`
  - Card grids: `gap-4 md:gap-6`
  - Floating-navbar clearance: `pb-28 md:pb-32` on dashboard / `/review`
- **Tap targets:** icon-only buttons need ≥24dp effective hit area. Use `p-1.5` minimum for inline icons inside cards; `p-2` (≥28dp) for primary actions like panel close, drawer dismiss, push-toast dismiss. Add `active:scale-95` for tactile feedback. Buttons that toggle on `:hover` only (e.g. `opacity-0 group-hover:opacity-100`) are invisible/inaccessible on mobile — gate the `opacity-0` behind `md:` so mobile sees the button at a muted color.
- **Form inputs (mobile):** set `inputMode`, `enterKeyHint`, `autoComplete`, `autoCorrect`, `autoCapitalize`, `spellCheck` deliberately per field. Examples: search → `type="search" inputMode="search" enterKeyHint="search"`; login passcode → `autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"`. Don't blanket-disable autocorrect on prose textareas — the user wants typo-correction in notes/rules.
- **Form submit-success handlers** call `void hideKeyboard()` from `@/lib/keyboard` so the soft keyboard dismisses when the form closes. Native-only; web is a no-op.
- **Author identity color** lives in `AUTHOR_COLORS` in `src/lib/constants.ts`, backed by `--author-daddy` and `--author-kitten` tokens in `globals.css`. Use the typed map (`AUTHOR_COLORS[author].text` / `bg` / `border` / etc.) — never interpolate (`bg-author-${author}`); Tailwind v4's scanner won't find dynamic class strings.
- **Skeletons match the shape of the eventual content.** No center spinners for page-level loads — every feature page uses `animate-pulse` placeholders shaped like the loaded layout. Inline `Loader2 animate-spin` is correct on action buttons (save, send, decide); incorrect as a route-level loading state.
- **Per-author caps are visible alongside their list.** When a feature limits per-author counts (notes pinning at 5/author), surface the usage near the existing per-author counts: `📌 X/MAX` chip per author, destructive-tinted at cap. Server-side rejection still applies; the chip is discoverability, not enforcement. Pair with a transient toast banner when the user attempts an action while over-cap.
- WCAG AA contrast minimum.
- **Motion:** `motion/react`. Standard entry: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`.

---

## 6. State & Forms

- Local: `useState`, `useReducer` (≥3 related fields), `useContext` (tree-scoped).
- Server: server actions + `revalidatePath`. No SWR, no React Query. `useOptimistic` for optimistic updates.
- Realtime: SSE for `/notes`, polling for badge counts, presence heartbeat for `usePresence`, network status for `useNetwork`.
- **No global store.**
- Forms: uncontrolled `<form action={action}>` + `useActionState`.
- Validation: Zod at every trust boundary.
- Server actions return `{ success?: true; error?: string }`.
- **Submit buttons disable when `isOffline`** so users can't trigger doomed actions.

---

## 7. Accessibility

- Full keyboard navigation. Every interactive element is a `button` or `Link`, not a styled `div`.
- `focus-visible:` for keyboard-only focus rings.
- One `h1` per route. Card titles are `h2`/`h3`.
- Respect `prefers-reduced-motion` — Motion's `MotionConfig` reads it; don't override.
- Errors announced with `role="alert"` or visible inline copy near the field.

---

## 8. Documentation

- JSDoc every exported function, hook, type, component prop interface.
- Complete sentences, proper punctuation.
- Code blocks use language hints.
- Update `AGENTS.md` and `SKILL.md` when a structural pattern changes.

---

## Cross-References

- `AGENTS.md` Section 4 — critical coding patterns (one-line bullets)
- `references/coding-patterns.md` — full wrong/right examples for the runtime-critical patterns
- `references/auth-and-security.md` — auth, error handling, security, observability
