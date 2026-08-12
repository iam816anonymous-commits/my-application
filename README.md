# Automation OS

A robust, local-first automation platform capable of controlling diverse execution targets under a unified automation architecture.

## Overview

Automation OS is designed to bridge multiple execution technologies (such as Playwright, pywinauto, OculiX, and Robot Framework) under a single, highly-auditable, deterministic, and verifiable engine. It separates workflow execution from implementation adapters, ensuring that your automation logic remains independent of the underlying technology stack.

## Repository Layout

```
automation-os/
├── apps/
│   ├── web/                     # React / Vite Dashboard Console
│   └── gateway/                 # API Gateway (Express/Fastify)
│
├── services/
│   ├── auth-service/            # Authentication & Workspace Membership Service
│   ├── automation-service/      # Workflow Management & Scheduler
│   └── artifact-service/        # Screenshot & Download Storage
│
├── workers/
│   └── automation-worker/       # BullMQ Job Executor Worker
│
├── adapters/
│   ├── playwright-adapter/      # Browser Automation
│   ├── pywinauto-adapter/       # Windows Native UI Automation
│   ├── oculix-adapter/          # Visual Pixel-based/OCR Automation
│   └── robot-adapter/           # Robot Framework Wrapper
│
├── packages/
│   ├── shared-types/            # Unified Domain Interfaces
│   ├── shared-utils/            # Logging, Error handling, Redaction
│   ├── config/                  # Global Service Config Definitions
│   ├── workflow-engine/         # Core State Machine & Scheduler Logic
│   ├── adapter-sdk/             # Base Adapter Classes & Interface Contracts
│   ├── policy-engine/           # Operational Policy Guardrails
│   ├── verification-engine/     # State and Action Verifiers
│   ├── event-contracts/         # Microservice / Pub-Sub Message Types
│   └── testing/                 # Standard Testing Stubs (MockAdapter, etc.)
│
├── docs/                        # Specifications and Manuals
└── docker-compose.yml           # Local Service Stack Deployment
```

## Getting Started

Refer to our detailed documentation for more details:
- [Product Requirements Document (PRD)](docs/PRD.md)
- [System Architecture Specification](docs/ARCHITECTURE.md)
- [Execution Adapters Specification](docs/ADAPTER_ARCHITECTURE.md)
- [Verification & State Engine Specification](docs/TESTING.md)
- [Security & Isolation Policies](docs/SECURITY.md)
- [Phase-by-Phase Roadmap](docs/PHASES.md)

## Development Requirements

- **Node.js** v18+
- **Redis** (for BullMQ queues)
- **SQLite** (local database engine)
- **TypeScript** (Strict Mode)
