# exai

CLI that turns natural language into Excalidraw flowcharts. Point it at your codebase, describe what you want, get a `.excalidraw` file.

```bash
exai ai "visualize the auth flow" -c ./src -o auth.excalidraw
```

## Install

```bash
npm i -g exai
```

Or from source:

```bash
git clone https://github.com/KailasMahavarkar/exai.git
cd exai
npm install && npm run bundle
```

## Setup

Get an API key from [openrouter.ai/keys](https://openrouter.ai/keys), then either:

```bash
export EXAI_OPENROUTER_APIKEY="sk-or-v1-..."
```

`OPENROUTER_API_KEY` is also accepted for backward compatibility.

Or use a config file:

```bash
exai init                    # creates exai.config.json
# add your apiKey, then:
exai ai "prompt" --config-path ./exai.config.json
```

## Config

One file controls everything. Generate it with `exai init`.

```json
{
  "model": "moonshotai/kimi-k2.5",
  "filterModel": "moonshotai/kimi-k2.5",
  "apiKey": "sk-or-v1-...",
  "temperature": 0,

  "format": "dsl",
  "output": "flowchart.excalidraw",
  "direction": "TB",
  "spacing": 50,

  "context": ["."],
  "exclude": ["dist", "coverage", "*.lock"],
  "allowTestFiles": false,
  "maxFileSize": 65536,
  "maxDepth": 6,
  "maxTreeItems": 1000,

  "compress": true,
  "compressMode": "balanced",
  "compressOptions": {
    "removeComments": true,
    "minifyWhitespace": true,
    "extractSignaturesOnly": false,
    "maxFileLines": 100,
    "preserveImports": true,
    "preserveExports": true,
    "preserveTypes": true,
    "preserveFunctionSignatures": true
  },

  "cache": true,
  "cacheTtlDays": 7,
  "cacheMaxEntries": 100,

  "verbose": false
}
```

All fields optional. CLI flags override config values.

## Commands

```bash
# AI generation (flowchart from codebase)
exai ai "<prompt>" [options]

# Create from DSL/JSON/DOT
exai create [input] [options]

# Generate diagram (AI mode)
exai diagram "pipeline flow with scanner, processor, output"

# Generate diagram from JSON (deterministic, no AI)
exai diagram --json elements.json -o my-diagram.excalidraw

# Export .excalidraw to PNG or SVG
exai export diagram.excalidraw --format png
exai export diagram.excalidraw --format svg -o output.svg

# Parse without generating
exai parse <input>

# Cache management
exai cache stats
exai cache clear

# Generate starter config
exai init [path]
```

## DSL Syntax

Directive-style DSL:

```
@direction TB
@spacing 60

@node user user "End User"
@node api orchestrator "API Gateway" bg:#ffe3e3 stroke:#c92a2a size:18 font:2
@node auth service "Auth Service" bg:#e5dbff stroke:#7048e8
@node db database "Users DB" bg:#d3f9d8 stroke:#2f9e44

@edge user api "calls"
@edge api auth "validates token" color:#495057 width:2
@edge auth db "reads/writes" dashed color:#2f9e44 arrow:triangle

@group core "Core Services" nodes:api,auth,db stroke:#868e96 dashed padding:24
```

`@node <id> <type-or-kind> "<label>"`  
`@edge <fromId> <toId> ["label"] [dashed] [style...]`  
`@group <id> "<label>" nodes:<id,id,...> [style...]`

Common kinds: `user`, `frontend`, `backend`, `service`, `api`, `worker`, `database`, `storage`, `queue`, `cache`, `external`, `orchestrator`, `decision`.

Common style tokens:
- Node: `bg:#hex`, `stroke:#hex`, `size:18`, `font:2|virgil|helvetica|cascadia|excalifont`, `text:#hex`
- Edge: `color:#hex`, `width:3`, `arrow:arrow|bar|dot|triangle|null`, `start:...`, `dashed|dotted|solid`
- Group: `stroke:#hex`, `bg:#hex`, `padding:24`, `dashed|solid|dotted`

## Diagram Generation

Generate `.excalidraw` diagrams from natural language or structured JSON.

### AI Mode

Describe your diagram and the LLM outputs simplified element JSON. The CLI handles layout, styling, arrow bindings, and file assembly.

```bash
exai diagram "ComfyUI pipeline with Gap Scanner, Prompt Generator, KSampler, VAE Decode, Save As"
exai diagram "microservice architecture" --direction LR --style clean
```

### Deterministic Mode (No AI)

Pass a JSON file with simplified elements. Same processing pipeline, no LLM needed.

```bash
exai diagram --json elements.json -o my-diagram.excalidraw
cat elements.json | exai diagram --stdin
```

**Simplified element format:**

```json
[
  { "type": "rectangle", "id": "api", "label": "API Gateway", "backgroundColor": "#a5d8ff" },
  { "type": "rectangle", "id": "auth", "label": "Auth Service", "backgroundColor": "#d0bfff" },
  { "type": "arrow", "from": "api", "to": "auth", "label": "JWT" }
]
```

No coordinates, no text elements, no roughness — the CLI expands labels into shape + bound text pairs, applies style presets, resolves arrow bindings, and auto-layouts using topological sort.

**Flags:**

| Flag | Default | Description |
|---|---|---|
| `-o, --output` | `diagram.excalidraw` | Output file path |
| `-d, --direction` | `TB` | Layout direction: `TB` (top-bottom) or `LR` (left-right) |
| `--style` | `hand-drawn` | Visual style: `hand-drawn` or `clean` |
| `--json` | — | Path to JSON file with simplified elements |
| `--stdin` | — | Read element JSON from stdin |
| `--model` | config default | LLM model for AI mode |
| `--no-cache` | — | Disable response cache |
| `--verbose` | — | Show per-step timing |

## Export

Convert `.excalidraw` files to PNG or SVG using Puppeteer and `@excalidraw/utils`.

```bash
exai export diagram.excalidraw --format png
exai export diagram.excalidraw --format svg -o output.svg
```

| Flag | Default | Description |
|---|---|---|
| `-f, --format` | `png` | Output format: `png` or `svg` |
| `-o, --output` | — | Output path (defaults to input name with new extension) |

## License

MIT
