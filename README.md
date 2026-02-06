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
export OPENROUTER_API_KEY="sk-or-v1-..."
```

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

  "context": ["./src"],
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

```
(Start) -> [Process] -> {Decision?}
{Decision?} -> "yes" -> [[Save to DB]] -> (End)
{Decision?} -> "no" -> [Retry] -> (Start)
```

`[rect]` `{diamond}` `(ellipse)` `[[database]]` `->` `-->` `-> "label" ->`

## License

MIT
