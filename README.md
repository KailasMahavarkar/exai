<div align="center">

# exai

**Turn plain English into architecture diagrams - instantly.**

Powered by [D2](https://d2lang.com) for automatic layout, native SVG/PNG export, and zero browser dependency.

[![npm](https://img.shields.io/npm/v/@orkait-dev/exai?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@orkait-dev/exai)
[![npm downloads](https://img.shields.io/npm/dm/@orkait-dev/exai?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@orkait-dev/exai)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![D2](https://img.shields.io/badge/powered%20by-D2-5c4ee5)](https://d2lang.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative&logoColor=white)](LICENSE)

```bash
exai diagram "microservice architecture with auth, users, and database" --sketch
```

</div>

## 📦 Install

```bash
npm i -g @orkait-dev/exai
```

Also requires the [D2](https://d2lang.com/tour/install) binary:

```bash
curl -fsSL https://d2lang.com/install.sh | sh
```

## 🔑 Setup

Store your API key and pick a default provider:

```bash
exai auth set openrouter sk-or-v1-...    # save key securely
exai auth set groq gsk_...               # multiple providers supported
exai auth default openrouter             # set default
```

Or via environment variable:

```bash
export EXAI_OPENROUTER_APIKEY="sk-or-v1-..."
```

Or skip API keys entirely with a local model:

```bash
exai diagram "auth flow" --provider ollama
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `exai diagram` | Generate a diagram from a prompt or JSON file |
| `exai themes` | List D2 themes and color presets |
| `exai checkpoint` | Save and restore diagram states |
| `exai reference` | Built-in element and color reference |
| `exai auth` | Manage API keys |
| `exai providers` | List available LLM providers |
| `exai cache` | Manage LLM response cache |
| `exai init` | Create a starter config file |

## 🎨 Diagram Generation

### 🤖 AI Mode

Describe what you want - the LLM outputs structured JSON, D2 renders it:

```bash
exai diagram "e-commerce checkout: cart, payment, order service, inventory"
exai diagram "CI/CD pipeline" --direction LR --theme terminal
exai diagram "auth flow" --sketch --provider groq
```

### 🔧 Deterministic Mode (no AI)

```bash
exai diagram --json elements.json -o architecture.svg
exai diagram --json elements.json -o architecture.png --sketch
cat elements.json | exai diagram --stdin -o diagram.svg
```

### 📄 JSON Element Format

<details>
<summary>Show full example</summary>

```json
[
  { "type": "text", "text": "System Architecture", "position": "above" },
  { "type": "zone", "id": "backend", "label": "Backend", "children": ["auth", "users"] },
  { "type": "circle", "id": "client", "text": "Client", "backgroundColor": "#e7f5ff" },
  { "type": "rectangle", "id": "gateway", "text": "API Gateway", "backgroundColor": "#a5d8ff" },
  { "type": "rectangle", "id": "auth", "text": "Auth Service", "backgroundColor": "#d0bfff" },
  { "type": "rectangle", "id": "users", "text": "User Service", "backgroundColor": "#d0bfff" },
  { "type": "cylinder", "id": "db", "text": "Database", "backgroundColor": "#b2f2bb" },
  { "type": "arrow", "from": "client", "to": "gateway" },
  { "type": "arrow", "from": "gateway", "to": "auth", "text": "JWT" },
  { "type": "arrow", "from": "gateway", "to": "users", "text": "REST" },
  { "type": "arrow", "from": "auth", "to": "db" },
  { "type": "arrow", "from": "users", "to": "db" }
]
```

No coordinates, no sizing - D2 handles layout automatically.

</details>

### 🔷 Shapes

<details>
<summary>Show all shape types</summary>

| Type | Use |
|------|-----|
| `rectangle` | Services, APIs, components (default) |
| `circle` | Users, actors, external entities |
| `diamond` | Decision points, conditions |
| `oval` | Start/end points, events |
| `hexagon` | Processes, workers |
| `cylinder` | Databases, data stores |
| `queue` | Message queues, buffers |
| `package` | Modules, libraries |
| `page` | Documents, configs |

</details>

### 🗂️ Zones

Group related shapes with dashed background containers:

```json
{ "type": "zone", "id": "backend", "label": "Backend Layer", "children": ["auth", "users", "db"] }
```

### ➡️ Arrows

```json
{ "type": "arrow", "from": "api", "to": "db", "text": "SQL", "strokeStyle": "dashed" }
```

| Property | Values |
|----------|--------|
| `text` | Label on the arrow |
| `strokeStyle` | `solid` (default), `dashed`, `dotted` |
| `strokeColor` | Hex color |
| `animated` | `true` for animated arrows |

## 🚩 Flags

<details>
<summary>Show all flags</summary>

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output` | `diagram.svg` | Output path (.svg, .png, .pdf, .d2) |
| `-d, --direction` | `TB` | `TB` (top-bottom) or `LR` (left-right) |
| `--theme` | - | D2 theme name or number |
| `--preset` | `default` | Color preset: `ocean`, `earth`, `neon`, `mono`, `candy` |
| `--sketch` | - | Hand-drawn sketch mode |
| `--layout` | `dagre` | Layout engine: `dagre` or `elk` |
| `--pad` | - | Padding in pixels |
| `--save-d2` | - | Also save the intermediate .d2 source |
| `--json` | - | JSON file (deterministic mode) |
| `--stdin` | - | Read JSON from stdin |
| `--model` | provider default | LLM model override |
| `--provider` | `openrouter` | LLM provider or custom URL |
| `--checkpoint` | - | Save diagram state |
| `--from-checkpoint` | - | Load checkpoint and merge new elements |
| `--no-cache` | - | Disable response cache |
| `--verbose` | - | Show D2 source and timing info |

</details>

## 🎭 Themes

14 built-in D2 themes + 7 color presets:

```bash
exai themes                                       # list everything

exai diagram "arch" --theme grape-soda            # light
exai diagram "arch" --theme terminal              # dark
exai diagram "arch" --theme origami               # special
exai diagram "arch" --sketch                      # hand-drawn

exai diagram "arch" --preset ocean                # blue/cyan
exai diagram "arch" --preset mono                 # grayscale
exai diagram "arch" --preset candy                # pink/purple
```

## 🤝 Providers

8 built-in LLM providers, all using the OpenAI chat completions format:

<details>
<summary>Show all providers</summary>

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

</details>

```bash
exai providers                                    # list all

exai diagram "auth flow" --provider openrouter    # default
exai diagram "auth flow" --provider openai --model gpt-4o
exai diagram "auth flow" --provider groq
exai diagram "auth flow" --provider ollama        # local, no API key
```

## 🔐 Auth

```bash
exai auth set openrouter sk-or-v1-...   # save key to ~/.exai/session.json
exai auth list                          # show stored keys
exai auth default groq                  # set default provider
exai auth remove openai                 # delete a key
```

Key priority: `--api-key` flag > env var > `~/.exai/session.json`

## 💾 Checkpoints

Save and restore diagram states for iterative building:

```bash
exai diagram --json base.json --checkpoint my-project
exai diagram --json additions.json --from-checkpoint my-project -o full.svg

exai checkpoint list
exai checkpoint show my-project
exai checkpoint remove my-project
```

## 📚 Reference

```bash
exai reference              # show everything
exai reference colors       # color palettes
exai reference elements     # D2 shapes and format
exai reference --json       # JSON output for LLM context
```

## ⚙️ Config

Generate a starter config with `exai init`. All fields are optional:

```json
{
  "model": "moonshotai/kimi-k2.5",
  "provider": "openrouter",
  "temperature": 0,
  "cache": true,
  "verbose": false,
  "timeoutSecs": 120,
  "diagram": {
    "direction": "TB",
    "theme": "grape-soda",
    "layout": "dagre",
    "sketch": false
  }
}
```

Priority: **CLI flags > env var > config file > defaults**

## ⚡ How It Works

```
Prompt -> LLM -> JSON elements -> D2 compiler -> d2 binary -> SVG/PNG
```

1. Describe the diagram (or provide JSON directly)
2. LLM outputs structured JSON (shapes, arrows, zones)
3. exai compiles JSON to D2 syntax
4. D2 binary renders to SVG/PNG with automatic layout

No browser, no Puppeteer, no coordinates needed.

## 📄 License

MIT
