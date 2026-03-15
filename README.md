# exai

CLI that turns natural language into Excalidraw diagrams. Point it at your codebase, describe what you want, get a `.excalidraw` file. Export to PNG/SVG. Share via excalidraw.com.

```bash
exai diagram "microservice architecture with auth, users, and database" --theme dark
```

## Install

```bash
npm i -g exai
```

Or from source:

```bash
git clone https://github.com/KailasMahavarkar/exai.git
cd exai
npm install && npm run build
```

## Setup

Store your API key securely (saved in `~/.exai/session.json`, never committed):

```bash
exai auth set openrouter sk-or-v1-...
exai auth set groq gsk_...            # add multiple providers
exai auth default openrouter          # set default
```

Or use environment variables:

```bash
export EXAI_OPENROUTER_APIKEY="sk-or-v1-..."
```

Or use a local provider (no API key needed):

```bash
exai diagram "auth flow" --provider ollama
```

Key priority: `--api-key` flag > env var > `~/.exai/session.json` > config file

## Commands

| Command | Description |
|---------|-------------|
| `exai diagram` | Generate diagram from AI prompt or JSON |
| `exai ai` | Generate flowchart from natural language + codebase context |
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

## Diagram Generation

Generate `.excalidraw` diagrams from natural language or structured JSON.

### AI Mode

```bash
exai diagram "e-commerce checkout: cart, payment, order service, inventory"
exai diagram "CI/CD pipeline" --direction LR --style clean --theme dark
exai diagram "auth flow" --provider ollama --model llama3.2
```

### Deterministic Mode (No AI)

```bash
exai diagram --json elements.json -o my-diagram.excalidraw
cat elements.json | exai diagram --stdin
```

**Simplified element format:**

```json
[
  { "type": "rectangle", "id": "api", "label": "API Gateway", "backgroundColor": "#a5d8ff" },
  { "type": "ellipse", "id": "user", "label": "User", "backgroundColor": "#e7f5ff" },
  { "type": "rectangle", "id": "auth", "label": "Auth Service", "backgroundColor": "#d0bfff" },
  { "type": "arrow", "from": "user", "to": "api" },
  { "type": "arrow", "from": "api", "to": "auth", "label": "JWT" }
]
```

No coordinates needed — the CLI auto-layouts using topological sort, expands labels into shape + bound text pairs, resolves arrow bindings, and applies style presets.

### Rich Labels

```json
{ "type": "rectangle", "id": "api", "label": { "text": "API Gateway", "fontSize": 24, "fontFamily": 2 } }
```

| fontFamily | Font |
|------------|------|
| 1 | Virgil (handwritten) |
| 2 | Helvetica (sans-serif) |
| 3 | Cascadia (monospace) |
| 5 | Excalifont |

### Pseudo-elements

Control pipeline behavior without appearing in output:

```json
{ "type": "cameraUpdate", "zoom": 0.8 }
{ "type": "delete", "targetId": "unused-node" }
{ "type": "restoreCheckpoint", "name": "v1" }
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output` | `diagram.excalidraw` | Output file path |
| `-d, --direction` | `TB` | `TB` (top-bottom) or `LR` (left-right) |
| `--style` | `hand-drawn` | `hand-drawn` or `clean` |
| `--theme` | `light` | `light` or `dark` |
| `--model` | provider default | LLM model |
| `--provider` | `openrouter` | LLM provider or custom URL |
| `--json` | — | JSON file (deterministic mode) |
| `--stdin` | — | Read JSON from stdin |
| `--checkpoint` | — | Save diagram state as named checkpoint |
| `--from-checkpoint` | — | Load checkpoint, merge new elements on top |
| `--no-cache` | — | Disable response cache |
| `--verbose` | — | Show per-step timing |

## Providers

Use `--provider` to switch between LLM providers. All use the OpenAI chat completions format.

```bash
exai providers                                    # list all providers

exai diagram "auth flow" --provider openrouter    # default
exai diagram "auth flow" --provider openai --model gpt-4o
exai diagram "auth flow" --provider groq
exai diagram "auth flow" --provider deepseek
exai diagram "auth flow" --provider ollama        # local, no API key
exai diagram "auth flow" --provider lmstudio      # local, no API key

# any OpenAI-compatible endpoint
exai diagram "auth flow" --provider http://my-server:8080/v1/chat/completions
```

| Provider | Default Model | API Key |
|----------|---------------|---------|
| `openrouter` | `moonshotai/kimi-k2.5` | Required |
| `openai` | `gpt-4o-mini` | Required |
| `groq` | `llama-3.3-70b-versatile` | Required |
| `deepseek` | `deepseek-chat` | Required |
| `together` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Required |
| `anthropic` | `claude-sonnet-4-6` | Required |
| `ollama` | `llama3.2` | Not needed |
| `lmstudio` | `local-model` | Not needed |

## Export

Convert `.excalidraw` files to PNG or SVG using Puppeteer + `@excalidraw/utils`.

```bash
exai export diagram.excalidraw --format png
exai export diagram.excalidraw --format svg -o output.svg
```

## Share

Upload to excalidraw.com with end-to-end encryption (AES-GCM).

```bash
exai share diagram.excalidraw
# => https://excalidraw.com/#json=abc123,base64key
```

## Checkpoints

Save and restore diagram states for iterative building.

```bash
exai diagram --json base.json --checkpoint my-project
exai diagram --json additions.json --from-checkpoint my-project -o full.excalidraw

exai checkpoint list
exai checkpoint show my-project
exai checkpoint remove my-project
```

## Reference

Built-in cheat sheet for colors, elements, sizing, and tips.

```bash
exai reference              # show all
exai reference colors       # color palettes
exai reference elements     # element format
exai reference --json       # JSON output (pipe to LLM context)
```

## AI with Codebase Context

The `ai` command gathers and compresses your codebase, then sends it to the LLM for context-aware diagram generation.

```bash
exai ai "system architecture diagram" -c ./src -c ./infra
exai ai "data flow" -c ./src --exclude "*.test.*" --provider groq
exai ai "architecture" -c ./src --redraw    # re-render from cache (no API call)
```

## DSL Syntax

Directive-style DSL for the `create` command:

```
@direction TB
@spacing 60

@node user user "End User"
@node api orchestrator "API Gateway" bg:#ffe3e3 stroke:#c92a2a
@node auth service "Auth Service" bg:#e5dbff stroke:#7048e8
@node db database "Users DB" bg:#d3f9d8 stroke:#2f9e44

@edge user api "calls"
@edge api auth "validates token" dashed
@edge auth db "reads/writes"
```

## Config

One file controls everything. Generate with `exai init`.

```json
{
  "model": "moonshotai/kimi-k2.5",
  "provider": "openrouter",
  "apiKey": "sk-or-v1-...",
  "temperature": 0,
  "format": "dsl",
  "output": "flowchart.excalidraw",
  "direction": "TB",
  "spacing": 50,
  "context": ["."],
  "exclude": ["dist", "coverage", "*.lock"],
  "compress": true,
  "compressMode": "balanced",
  "cache": true,
  "verbose": false,
  "timeoutSecs": 120,
  "excalidraw": {
    "strokeWidth": 2,
    "fillStyle": "hachure",
    "roughness": 1,
    "fontFamily": "hand",
    "fontSize": 20
  },
  "diagram": {
    "direction": "TB",
    "style": "hand-drawn",
    "theme": "light"
  }
}
```

All fields optional. Priority: **CLI flags > env/.env > config file > defaults**.

See [CHEATSHEET.md](CHEATSHEET.md) for the full reference.

## License

MIT
