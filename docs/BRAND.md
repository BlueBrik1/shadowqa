# ShadowQA brand

One product, one look, everywhere it appears: the CLI, the VS Code extension, the browser side
panel, the Live overlay and extension, the film and the slide deck.

## Palette

Two colours. Nothing else is decorative.

| Name | Hex | Use |
| --- | --- | --- |
| Charcoal | `#1C1C1C` | Ink on light surfaces; the background of dark surfaces. |
| Off-white | `#F4F1EA` | Ink on dark surfaces; the background of light surfaces. |

Tints are the same two colours mixed with each other, never a third hue:

| Name | Hex | Use |
| --- | --- | --- |
| Charcoal lift | `#242424` | Panels on charcoal. |
| Off-white deep | `#EAE6DD` | Panels on off-white. |
| Dim | `#A9A59D` | Secondary text. |
| Faint | `#6F6C66` | Labels, rules, chapter marks. |

Two exceptions, each with one meaning:

| Name | Hex | Meaning |
| --- | --- | --- |
| Bad | `#E5484D` | Wrong: a failing check, an exception, a rejected patch, a contradiction. |
| Good | `#3DD68C` | Right: a passing check, a verified fix, a confirmed source. |

Code blocks keep syntax highlighting (Prism tokens tuned for each background). No gradients, no
shadows that imply a third colour, no brand colours from partners — Slack, GitHub, Claude, OpenAI,
Gemini, OpenCode and Codex marks are drawn in the current ink colour at their official geometry.

The palette is defined once in code as `BRAND` in `src/cli/ui.ts`; the film reads it from there at
build time (`video/scripts/extract.mjs`) and the Live front end mirrors it in
`live/frontend/src/index.css`.

## Type

| Role | Face | Weights |
| --- | --- | --- |
| Sentences, titles, quotations | **Source Serif Pro** (Google Fonts serves it as *Source Serif 4*) | 400, 600 |
| Interface, labels, captions | **Work Sans** | 300–600 |
| Code, terminals | The platform monospace (Consolas / SF Mono / DejaVu Sans Mono) | 400 |

Labels are uppercase Work Sans with wide tracking (2–3 px at 12–16 px). Sentences are sentence-case
Source Serif with tight leading (1.12). There is no "techy" display face.

## Mark

The mark is a diamond with a filled centre: `◈` in text, and the SVG in `vscode-extension/media/shadow.svg`
and `video/src/film/ui.tsx` (`Mark`). It stands for a finding that has been looked into. Related
glyphs used in the CLI and film: `◇` a step or a check, `◉` a Live incident, `◌` waiting, `✓` good,
`✕` bad.

The wordmark is `SHADOWQA` in Work Sans 500, tracked at 0.3 em, with the mark at the left. The tagline
is `observe → plan → verify → repair`.

## Layout rules (film and slides)

- One sentence and one visual per beat; the sentence at the top, the visual centred below.
- Windows (terminal, browser, IDE, Slack, pull request) are drawn in the opposite tone to the frame so
  they read as objects, not decoration.
- Cuts are 12-frame crossfades; entrances are short rises (22 px, soft easing); nothing bounces.
- Chapter marks: `01 — THE PROBLEM`, `02 — FOR TEAMS`, `03 — FOR INDIVIDUALS`, `04 — LIVE`, `05 — BUILT IN`.
