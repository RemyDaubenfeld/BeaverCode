# BeaverCode

![status](https://img.shields.io/badge/status-work--in--progress-yellow)

BeaverCode is a local-first AI stack built around [Ollama](https://ollama.com): a single Nuxt WebUI for managing local models and benchmarking them, with a coding agent harness (forked from OpenFox) planned as the next major piece.

## Features

**Model management** (WebUI, done)
- Browse the Ollama library and pull models with live progress
- Import a GGUF model from a URL, a local file, or one already on disk
- Create custom models from reusable modelfile templates (parameters + system prompt)
- Delete installed models
- Filter the model list by capability (vision, tools, thinking, embedding...)

**Benchmark tool** (in progress)
- Run prompt-based tests against local models and score results

**Coding agent harness** (planned)
- Forked from OpenFox, will provide chat + MCP tool calling from the same WebUI

## Stack

- Frontend/backend: Nuxt 3 (Vue) + Nitro, talking directly to the Ollama API
- MCP servers: custom tools in `mcp/`

## Status

Early and actively evolving.
