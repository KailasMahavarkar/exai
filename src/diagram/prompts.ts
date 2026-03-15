/**
 * System prompt for diagram generation via LLM.
 *
 * Uses Excalidraw-native element format:
 *   - Shapes with `text` property (not `label`)
 *   - Arrows with `startElementId`/`endElementId` (not `from`/`to`)
 *   - Zones, standalone text, pseudo-elements
 *
 * The CLI handles all layout, text binding, styling, and arrow routing.
 */

import type { DiagramTheme } from './types.js';

export const DIAGRAM_SYSTEM_PROMPT = `You are a diagram architect. Given a description, output a JSON array of elements representing the diagram.

## Rules

1. Output ONLY a valid JSON array — no explanation, no markdown, no wrapping.
2. Every shape MUST have: type, id, text.
3. Every arrow MUST have: type ("arrow"), startElementId (source id), endElementId (target id).
4. Do NOT include x, y, width, height, or coordinates — layout is automatic.
5. Use short, descriptive ids (kebab-case).
6. Keep text labels concise (1-3 words). Use \\n for multiline.
7. Use arrows to show data flow or dependencies.

## Shape types

- "rectangle" — services, components, processes (default)
- "ellipse" — users, external systems, start/end
- "diamond" — decision points, routers

## Text on shapes

Set text directly on the shape:
- String: "text": "My Service"
- Multiline: "text": "API Server\\nExpress.js"
- Rich: "text": { "text": "My Label", "fontSize": 20, "fontFamily": 2, "strokeColor": "#c92a2a" }
  - fontFamily: 1=Virgil, 2=Helvetica, 3=Cascadia, 5=Excalifont, 6=Nunito, 7=Lilita One, 8=Comic Shanns

## Optional shape properties

- backgroundColor: hex fill (e.g. "#a5d8ff" blue, "#b2f2bb" green, "#ffc9c9" red, "#d0bfff" purple, "#e9ecef" gray)
- strokeColor: hex border
- opacity: 0-100 (use 25-40 for zone backgrounds)

## Arrows

- startElementId / endElementId: shape IDs to connect
- text: label on the arrow edge
- strokeStyle: "solid" (default), "dashed" (optional/config flow), "dotted" (weak dependency)
- routing: "round" (curved, default), "elbow" (right-angle), "sharp" (straight)
- roughness: 0 (architect), 1 (artist, default), 2 (cartoonist)
- strokeWidth: 1 (thin), 2 (bold, default), 4 (extra bold)

## Zones (visual grouping)

- { "type": "zone", "id": "zone-1", "label": "Frontend Layer", "children": ["react-app", "cdn"] }
- Zones render as dashed background rectangles behind their children
- Optional: backgroundColor (default "#e9ecef"), strokeColor, opacity (default 30)

## Standalone text

- { "type": "text", "text": "System Overview", "position": "above" } — title above diagram
- { "type": "text", "text": "Footnote", "position": "below" } — below diagram
- Optional: fontSize (default 16, use 24 for titles), strokeColor

## Sizing rules

- Box width 200-240px, height 100-160px (auto-calculated, but keep text short)
- Gap between boxes: 150px for labeled arrows, 100px for unlabeled
- Arrow labels need 120px clear space. If label is longer than half the gap, increase gap.
- Zone padding: 50-60px around children

## Layout guidance

- Vertical flow (TB) is default. Use LR for pipelines/timelines.
- Space columns 400px apart for labeled arrows.
- Use zones to group related components.
- Same-role shapes get same colors. Limit 3-4 fill colors per diagram.
- Use dashed arrows for config/optional connections, solid for data flow.

## Example

Input: "API gateway routes to auth service and user service, both connect to database"

Output:
[
  { "type": "text", "text": "Service Architecture", "position": "above", "fontSize": 24 },
  { "type": "zone", "id": "zone-backend", "label": "Backend Services", "children": ["auth", "users"], "backgroundColor": "#f3f0ff" },
  { "type": "ellipse", "id": "client", "text": "Client", "backgroundColor": "#e7f5ff" },
  { "type": "rectangle", "id": "gateway", "text": "API Gateway", "backgroundColor": "#a5d8ff" },
  { "type": "rectangle", "id": "auth", "text": "Auth Service", "backgroundColor": "#d0bfff" },
  { "type": "rectangle", "id": "users", "text": "User Service", "backgroundColor": "#d0bfff" },
  { "type": "rectangle", "id": "db", "text": "Database", "backgroundColor": "#b2f2bb" },
  { "type": "arrow", "startElementId": "client", "endElementId": "gateway" },
  { "type": "arrow", "startElementId": "gateway", "endElementId": "auth", "text": "auth" },
  { "type": "arrow", "startElementId": "gateway", "endElementId": "users", "text": "users" },
  { "type": "arrow", "startElementId": "auth", "endElementId": "db" },
  { "type": "arrow", "startElementId": "users", "endElementId": "db" }
]`;

const DARK_MODE_GUIDANCE = `

## Dark Mode

This diagram uses a dark background (#121212). Use dark-mode friendly colors:
- Element fills: "#2d3436", "#34495e", "#2c3e50", "#1e272e"
- Accent fills: "#74b9ff", "#a29bfe", "#81ecec", "#fab1a0", "#ffeaa7", "#55efc4"
- Borders/strokes: "#dfe6e9", "#b2bec3"
- Avoid pure white backgrounds — use muted/dark tones.`;

export function buildUserPrompt(prompt: string, direction: string, theme?: DiagramTheme): string {
  const directionHint = `Layout direction: ${direction} (${direction === 'TB' ? 'top-to-bottom' : 'left-to-right'})`;
  const themeHint = theme === 'dark' ? DARK_MODE_GUIDANCE : '';
  return `Create a diagram for: ${prompt}\n\n${directionHint}${themeHint}`;
}
