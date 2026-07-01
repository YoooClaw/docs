---
layout: home

hero:
  name: yoooclaw
  text: The Agent-Native Standalone CLI
  tagline: The yoooclaw / yc command suite — ships its own local daemon, no host app required
  actions:
    - theme: brand
      text: Getting Started
      link: /en/guide/getting-started
    - theme: alt
      text: Learn about the CLI
      link: /en/cli/
    - theme: alt
      text: GitHub
      link: https://github.com/YoooClaw/cli

features:
  - title: Standalone yoooclaw CLI
    details: An Agent-Native command suite with its own local daemon — no host app required. Unified --format output and error contract.
    link: /en/cli/
    linkText: Learn about the CLI
  - title: CLI Architecture & Implementation
    details: Daemon startup flow, how StandaloneRuntime reuses the underlying code without modification, RelayDispatcher, profile / credential layering, and port fallback.
    link: /en/cli/architecture
    linkText: See the CLI implementation
  - title: Command System & Output
    details: Config / notification / recording / image / light-rule / tunnel / monitor commands, with a unified --format output and error contract.
    link: /en/cli/usage
    linkText: Command system
  - title: Command Reference
    details: A complete reference of every subcommand, flag, and example.
    link: /en/cli/commands
    linkText: Command reference
  - title: Multi API-Key Design
    details: Layering, selection, and fallback strategy for multiple api-keys.
    link: /en/cli/multi-api-key
    linkText: Learn about the design
  - title: Agent Skill
    details: Three built-in Skills (query notifications / create light rules / debug the tunnel) that symlink into Claude Code / Codex so an Agent can drive the CLI on its own.
    link: /en/cli/skills
    linkText: Learn about Skills
---

## Read this first: what this is, and isn't

A number of people have installed this CLI and then asked, "why can't I chat with Hermes in the app anymore?" Let's clear this up once and for all — **please make sure this matches what you're expecting before you install it**:

::: warning This is a standalone command-line tool for developers, not a chat app
`yoooclaw` / `yc` is a **standalone command-line (CLI)** tool. It ships its own local daemon and doesn't require the openclaw client app to be online. It abstracts notifications, recordings, images, light rules, tunnels, and monitoring into commands that **an Agent (Claude Code / Codex, etc.) or you yourself drive from the terminal** — it has no chat interface of its own.
:::

- **Recommended for people with a programming background.** You'll need to type commands in a terminal and understand concepts like daemons, config, and credentials, typically alongside an Agent. If you have no command-line experience at all, the learning curve will be steep.
- **Mutually exclusive with the app plugin — pick one.** The standalone CLI and the openclaw client plugin are two different runtime paths. **Don't enable both at once**, or they'll fight over the same connection. If you install the standalone CLI, go all-in on the CLI path.
- **Doesn't support chat / talking to Hermes.** This is the biggest difference from the app: the CLI **has no chat feature** and can't talk to Hermes inside the app. If what you actually want is "open the app and chat with Hermes", you need the **openclaw / Hermes plugin**, not this CLI.

Once that's clear, get started: [Getting Started](/en/guide/getting-started) · [Learn about the standalone CLI](/en/cli/)
