# exai CLI Cheatsheet

> Generate Excalidraw diagrams from AI, DSL, JSON, or DOT — with auto-layout, theming, checkpoints, and sharing.

---

## Commands at a Glance

| Command | Description |
|---------|-------------|
| `exai diagram` | Generate diagram from AI prompt or JSON |
| `exai ai` | Generate flowchart from natural language |
| `exai create` | Create flowchart from DSL/JSON/DOT |
| `exai export` | Convert `.excalidraw` to PNG or SVG |
| `exai share` | Upload to excalidraw.com (e2e encrypted) |
| `exai checkpoint` | Manage saved diagram states |
| `exai reference` | Built-in element & color reference |
| `exai auth` | Manage API keys (`~/.exai/session.json`) |
| `exai providers` | List available LLM providers |
| `exai cache` | Manage LLM response cache |
| `exai init` | Create starter config file |
| `exai parse` | Parse and validate input |

---

## diagram

Generate `.excalidraw` files from AI or simplified JSON.

```bash
# AI mode (requires API key)
exai diagram "API gateway routes to auth and user service"

# Deterministic mode (no API needed)
exai diagram --json elements.json -o my-diagram.excalidraw

# With all options
exai diagram "microservice architecture" \
  -o arch.excalidraw \
  -d LR \
  --style clean \
  --theme dark \
  --model google/gemini-2.5-flash \
  --checkpoint v1 \
  --verbose
```

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <file>` | `diagram.excalidraw` | Output file path |
| `-d, --direction <dir>` | `TB` | Layout: `TB` (top-bottom) or `LR` (left-right) |
| `--style <style>` | `hand-drawn` | `hand-drawn` or `clean` |
| `--theme <theme>` | `light` | `light` or `dark` |
| `--json <file>` | — | JSON file (deterministic mode) |
| `--stdin` | — | Read JSON from stdin |
| `--model <model>` | config/default | LLM model (default depends on provider) |
| `--api-key <key>` | env/config | API key |
| `--provider <name>` | `openrouter` | Provider preset or custom URL |
| `--checkpoint <name>` | — | Save diagram state after generation |
| `--from-checkpoint <name>` | — | Load checkpoint, merge new elements on top |
| `--no-cache` | — | Disable response cache |
| `--verbose` | — | Show per-step timing |
| `--config-path <path>` | auto-detect | Path to config file |

---

## ai

Generate flowcharts from natural language with context awareness.

```bash
# Basic
exai ai "user login flow" -o login.excalidraw

# With codebase context
exai ai "architecture diagram" -c ./src -c ./infra --model moonshotai/kimi-k2.5

# Redraw from cache (no API call)
exai ai "architecture diagram" -c ./src --redraw

# Only gather context (inspect before generating)
exai ai "architecture" -c ./src --only-context
```

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <file>` | `flowchart.excalidraw` | Output path |
| `-f, --format <type>` | `dsl` | AI output format: `dsl` or `json` |
| `-d, --direction <dir>` | `TB` | `TB`, `BT`, `LR`, `RL` |
| `-s, --spacing <n>` | `50` | Node spacing (px) |
| `-c, --context <path>` | — | Context files/folders (repeatable) |
| `--model <model>` | `moonshotai/kimi-k2.5` | OpenRouter model |
| `--api-key <key>` | env/config | API key |
| `--temperature <n>` | `0` | 0-2 |
| `--exclude <pattern>` | — | Exclude patterns (repeatable) |
| `--allow-test-files` | `false` | Include test files |
| `--no-compress` | — | Disable context compression |
| `--compress-mode <mode>` | `balanced` | `balanced`, `aggressive`, `minimal` |
| `--no-cache` | — | Disable LLM cache |
| `--no-context-cache` | — | Disable context cache |
| `--redraw` | — | Render from cache only |
| `--only-context` | — | Show gathered context, don't generate |
| `--verbose` | — | Verbose output |

---

## export

Convert `.excalidraw` to PNG or SVG (uses Puppeteer + @excalidraw/utils).

```bash
exai export diagram.excalidraw --format png
exai export diagram.excalidraw --format svg -o custom-name.svg
```

| Flag | Default | Description |
|------|---------|-------------|
| `-f, --format <format>` | `png` | `png` or `svg` |
| `-o, --output <file>` | auto | Output path (defaults to input name + ext) |

---

## share

Upload to excalidraw.com with end-to-end encryption.

```bash
exai share diagram.excalidraw
exai share diagram.excalidraw --verbose
```

Returns a URL like: `https://excalidraw.com/#json=abc123,base64key`

---

## checkpoint

Save and restore diagram states for iterative building.

```bash
# Save during diagram generation
exai diagram --json base.json --checkpoint my-diagram

# Build on top of saved state
exai diagram --json additions.json --from-checkpoint my-diagram -o updated.excalidraw

# Manage checkpoints
exai checkpoint list
exai checkpoint show my-diagram
exai checkpoint remove my-diagram
```

Stored at `~/.exai/checkpoints/`.

---

## reference

Built-in cheat sheet for colors, elements, sizing, and tips.

```bash
exai reference              # Show everything
exai reference colors       # Color palettes only
exai reference elements     # Element format reference
exai reference sizing       # Layout sizing rules
exai reference tips         # Best practices
exai reference --json       # Output as JSON (pipe to LLM)
```

---

## cache

```bash
exai cache stats    # Show cache statistics
exai cache clear    # Clear all cached responses
```

---

## Simplified JSON Format

The `diagram` command accepts a JSON array of elements:

### Shapes

```json
{
  "type": "rectangle",
  "id": "api-gateway",
  "label": "API Gateway",
  "backgroundColor": "#a5d8ff"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `type` | yes | `rectangle`, `ellipse`, `diamond` |
| `id` | yes | Unique kebab-case string |
| `label` | yes | String or rich label object |
| `backgroundColor` | no | Hex color |
| `strokeColor` | no | Hex color |
| `width` / `height` | no | Pixels (auto-calculated) |
| `group` | no | Group label for visual grouping |

### Rich Labels

```json
{
  "label": {
    "text": "API Gateway",
    "fontSize": 24,
    "fontFamily": 2,
    "strokeColor": "#c92a2a"
  }
}
```

| fontFamily | Font |
|------------|------|
| 1 | Virgil (handwritten) |
| 2 | Helvetica (sans-serif) |
| 3 | Cascadia (monospace) |
| 5 | Excalifont |

### Arrows

```json
{ "type": "arrow", "from": "api-gateway", "to": "auth", "label": "auth" }
{ "type": "arrow", "from": "api-gateway", "to": "users", "strokeStyle": "dashed" }
```

| Field | Required | Values |
|-------|----------|--------|
| `type` | yes | `"arrow"` |
| `from` | yes | Source shape ID |
| `to` | yes | Target shape ID |
| `label` | no | Arrow label text |
| `strokeColor` | no | Hex color |
| `strokeStyle` | no | `solid`, `dashed`, `dotted` |

### Pseudo-elements

Control pipeline behavior without appearing in output:

```json
{ "type": "cameraUpdate", "zoom": 0.8 }
{ "type": "delete", "targetId": "unused-node" }
{ "type": "restoreCheckpoint", "name": "v1" }
```

---

## Color Palettes

### Primary Fills

| Color | Hex |
|-------|-----|
| Blue | `#a5d8ff` |
| Green | `#b2f2bb` |
| Red | `#ffc9c9` |
| Purple | `#d0bfff` |
| Yellow | `#ffec99` |
| Orange | `#ffd8a8` |
| Gray | `#e9ecef` |
| Cyan | `#99e9f2` |
| Pink | `#fcc2d7` |
| Teal | `#96f2d7` |

### Semantic (by component type)

| Component | Background | Stroke |
|-----------|------------|--------|
| Frontend | `#a5d8ff` | `#1971c2` |
| Backend / API | `#d0bfff` | `#7048e8` |
| Database | `#b2f2bb` | `#2f9e44` |
| Storage | `#ffec99` | `#f08c00` |
| AI / ML | `#e599f7` | `#9c36b5` |
| External APIs | `#ffc9c9` | `#e03131` |
| Orchestration | `#ffa8a8` | `#c92a2a` |
| Message Queue | `#fff3bf` | `#fab005` |
| Cache | `#ffe8cc` | `#fd7e14` |
| Users | `#e7f5ff` | `#1971c2` |

### Dark Mode

| Element | Colors |
|---------|--------|
| Background | `#121212` |
| Surface | `#1e1e1e` |
| Fills | `#2d3436`, `#34495e`, `#2c3e50`, `#1e272e` |
| Accents | `#74b9ff`, `#a29bfe`, `#81ecec`, `#fab1a0`, `#ffeaa7`, `#55efc4` |
| Borders | `#dfe6e9`, `#b2bec3` |

---

## Config File

Create with `exai init` or manually at `exai.config.json` (auto-detected).

```json
{
  "model": "moonshotai/kimi-k2.5",
  "provider": "openrouter",
  "temperature": 0,
  "format": "dsl",
  "output": "flowchart.excalidraw",
  "direction": "TB",
  "spacing": 50,
  "context": ["."],
  "exclude": ["dist", "coverage", "*.lock"],
  "allowTestFiles": false,
  "compress": true,
  "compressMode": "balanced",
  "cache": true,
  "contextCache": true,
  "cacheTtlDays": 7,
  "verbose": false,
  "timeoutSecs": 120,
  "excalidraw": {
    "strokeWidth": 2,
    "fillStyle": "hachure",
    "strokeStyle": "solid",
    "roughness": 1,
    "edges": "round",
    "arrowhead": "arrow",
    "fontFamily": "hand",
    "fontSize": 20,
    "textAlign": "center"
  },
  "diagram": {
    "direction": "TB",
    "style": "hand-drawn",
    "theme": "light"
  }
}
```

Priority: **CLI flags > env/.env > config file > defaults**

---

## Providers

Use `--provider` to switch between LLM providers. All use the OpenAI chat completions format.

```bash
# List all providers
exai providers

# Use different providers
exai diagram "auth flow" --provider openai --model gpt-4o --api-key sk-...
exai diagram "auth flow" --provider groq --model llama-3.3-70b-versatile
exai diagram "auth flow" --provider deepseek --model deepseek-chat
exai diagram "auth flow" --provider together

# Local models (no API key needed)
exai diagram "auth flow" --provider ollama --model llama3.2
exai diagram "auth flow" --provider lmstudio

# Custom OpenAI-compatible endpoint
exai diagram "auth flow" --provider http://my-server:8080/v1/chat/completions

# Set in config file
# "provider": "groq"
```

| Provider | Default Model | API Key |
|----------|---------------|---------|
| `openrouter` (default) | `moonshotai/kimi-k2.5` | Required |
| `openai` | `gpt-4o-mini` | Required |
| `groq` | `llama-3.3-70b-versatile` | Required |
| `deepseek` | `deepseek-chat` | Required |
| `together` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Required |
| `anthropic` | `claude-sonnet-4-6` | Required |
| `ollama` | `llama3.2` | Not needed |
| `lmstudio` | `local-model` | Not needed |

---

## Auth

Manage API keys securely in `~/.exai/session.json` (never committed to git).

```bash
exai auth set openrouter sk-or-v1-...   # save key
exai auth set openai sk-...              # multiple providers
exai auth set groq gsk_...
exai auth list                           # show stored keys (masked)
exai auth remove openai                  # remove a key
exai auth default groq                   # set default provider
exai auth path                           # show session file path
```

Key resolution priority:
1. `--api-key` CLI flag
2. `EXAI_OPENROUTER_APIKEY` environment variable
3. `~/.exai/session.json` (per provider)

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXAI_OPENROUTER_APIKEY` | API key (preferred) |
| `OPENROUTER_API_KEY` | Legacy fallback |

Also reads from `.env` file in project root.

---

## Examples

### Quick diagram from JSON

```bash
cat <<'EOF' > elements.json
[
  { "type": "ellipse", "id": "user", "label": "User", "backgroundColor": "#e7f5ff" },
  { "type": "rectangle", "id": "api", "label": "API", "backgroundColor": "#a5d8ff" },
  { "type": "rectangle", "id": "db", "label": "Database", "backgroundColor": "#b2f2bb" },
  { "type": "arrow", "from": "user", "to": "api" },
  { "type": "arrow", "from": "api", "to": "db", "label": "query" }
]
EOF

exai diagram --json elements.json -o simple.excalidraw
exai export simple.excalidraw --format png
```

### Dark mode diagram

```bash
exai diagram --json elements.json -o dark.excalidraw --theme dark --style clean
```

### Iterative building with checkpoints

```bash
# Step 1: Create base diagram
exai diagram --json base.json --checkpoint my-project

# Step 2: Add more elements on top
exai diagram --json additions.json --from-checkpoint my-project -o full.excalidraw --checkpoint my-project

# Step 3: Share
exai share full.excalidraw
```

### AI with codebase context

```bash
exai ai "system architecture diagram" \
  -c ./src -c ./infrastructure \
  --exclude "*.test.*" \
  --model google/gemini-2.5-flash \
  -o architecture.excalidraw

exai export architecture.excalidraw --format svg
```

### Pipe JSON from another tool

```bash
echo '[{"type":"rectangle","id":"a","label":"Hello"},{"type":"rectangle","id":"b","label":"World"},{"type":"arrow","from":"a","to":"b"}]' | exai diagram --stdin -o hello.excalidraw
```

---

## Tips

1. Use **kebab-case** IDs: `api-gateway`, `auth-service`
2. Keep labels **1-3 words** for readability
3. Use arrows for **data flow direction**, not just connections
4. Group related shapes with the `group` field
5. Use `strokeStyle: "dashed"` for optional/async connections
6. Pick colors by **component type** (see semantic palette)
7. For dark mode: muted fills + bright accent borders
8. Use **rich labels** `{text, fontSize}` to emphasize key components
9. Use `cameraUpdate` pseudo-element to **zoom out** for large diagrams
10. Use `--from-checkpoint` for **iterative building** across sessions
