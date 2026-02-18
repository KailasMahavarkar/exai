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
# AI generation
exai ai "<prompt>" [options]

# Create from DSL/JSON/DOT
exai create [input] [options]

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

## License

MIT
