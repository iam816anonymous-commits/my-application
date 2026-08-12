# Product Requirements Document (PRD) — Automation OS

## 1. Product Overview

### 1.1 Purpose & Value Proposition
Automation OS is a local-first, highly robust automation orchestration platform designed to unify diverse execution technologies under a single control plane. Businesses and developers often struggle to automate across multi-surface workflows—for example, opening a browser, logging into an internal app, downloading a file, transferring that file to a legacy Windows application (Win32/UIA), verifying visual elements, and executing test assertions.

Instead of creating fragmented automation scripts using separate frameworks, Automation OS provides a single, unified orchestrator that coordinates, schedules, validates, and audits workflows across any target application, with or without APIs, DOMs, or accessibility trees.

### 1.2 Target Audience
* **RPA (Robotic Process Automation) Developers:** Looking for an open, flexible alternative to legacy, expensive enterprise RPA suites.
* **QA & Automation Engineers:** Designing tests that span multiple layers (Web UI, local desktop apps, command line).
* **Systems Integrators:** Seeking a reliable, local-first engine to execute mission-critical background automation with strict security and auditing rules.

---

## 2. Key Scope & Core Capabilities

Automation OS must be capable of controlling:
1. **Web Applications:** via Playwright (DOM, shadow DOM, browser automation).
2. **Windows Desktop & Native GUI Applications:** via pywinauto (Win32, UIA, controls, menus, input manipulation).
3. **Canvas, WebGL, & Remote Desktops:** via OculiX (pixel-based template matching, OCR-driven target location, region-scoped visual search).
4. **Robot Framework Workflows:** via an optional adapter that orchestrates suite executions and logs events back to the Automation OS.
5. **No-API, No-DOM, No-Accessibility-Tree Interfaces:** via coordinate-relative visual falling-back (OculiX) safely bound by confidence thresholds.

The core platform itself owns orchestration, state management, security policies, verification engines, and execution scheduling, making the target automation engines completely pluggable adapters.

---

## 3. Detailed Functional Requirements

### 3.1 Workspaces and Applications
* **Multi-tenancy/Workspace Isolation:** Workflows, credentials, and artifacts are isolated by Workspaces. Users can only access objects within their assigned Workspace.
* **Application Registry:** Applications to be automated are registered inside the system with metadata (executable path, capabilities, preferred adapter, known selectors, and fallback visual targets).

### 3.2 Workflow Management (CRUD & Versioning)
* **Declarative Schema:** Workflows are defined as a series of steps with order, action type, target specifiers, adapter preferences, retries, preconditions, and post-execution verification checks.
* **Non-Destructive Versioning:** Once a workflow version is published, it becomes immutable. New edits create a `draft` version. Executions reference the exact `WorkflowVersion` ID to ensure total repeatability.

### 3.3 Asynchronous Execution Engine
* **Deterministic Pipeline:** The engine processes workflows through clear stages: `validate` -> `resolve dependencies` -> `create execution record` -> `execute step` -> `verify step` -> `record evidence` -> `transition state`.
* **State Machine:** Governs execution status (e.g., `draft`, `validated`, `queued`, `running`, `verifying`, `recovering`, `succeeded`, `failed`, `cancelled`, `timed_out`, `manual_intervention`).
* **Background Queue:** Long-running executions must run asynchronously inside workers (BullMQ/Redis) with concurrency boundaries, queue prioritization, and cancellation support.

### 3.4 Verification & Evidence System
* **Deterministic State Verification:** An action (e.g., click) is never considered successful just because the command execution returned `0`. Every step must verify that the environment achieved the desired state.
* **Verification Methods:** Supported checks include UI state, DOM state, text matching, OCR matching, screenshot matching, file existence/checksum, process existence, and network/API responses.
* **Evidence Gathering:** Captures screenshots, DOM snapshots, process logs, or files, storing them securely in an external artifact-service with hashes to prevent database bloating.

### 3.5 Security & Policy Engine
* **Policy Guardrails:** Enforces pre-execution and run-time policies (e.g., allowed executable directories, permitted URL/domain list, disallowed dangerous operations like system deletions without confirmation).
* **Credential Redaction:** Credentials must never be stored inside workflow definitions. They are referred to via `CredentialReference` IDs. The execution log must scrub all known sensitive strings (tokens, keys, passwords).

### 3.6 Human-in-the-Loop (Manual Intervention)
* If an execution encounters a low-confidence match (e.g., OculiX match similarity is below `0.90`) or a non-recoverable error, the execution enters `manual_intervention`.
* A human operator can resolve the failure from the dashboard (retry, skip, override, input required details) to allow the workflow to resume cleanly.

---

## 4. Non-Functional Requirements

### 4.1 Reliability & Recoverability
* **Idempotency:** Workflows should support retryability through unique `idempotencyKeys` and step-level checkpoints to prevent executing duplicate mutations (e.g., making duplicate purchases).
* **Automatic Recovery:** Supports exponential backoff, reconnects, application restarts, and alternate adapter/selector fallback rules.

### 4.2 Security & Compliance
* **Zero Trust Credentials:** Secrets are retrieved at the exact execution time from authorized credential providers and immediately redacted from telemetry.
* **Immutable Audit Trail:** All administrative and execution-level actions produce structured, signed audit logs that cannot be deleted or altered.

### 4.3 Performance & Scalability
* **Bounded Queue Concurrency:** Queue-backpressure manages resource exhaustion.
* **Resource Optimization:** Screenshot compression and data lifecycle rules prevent storage blowup.
* **Database Efficiency:** Indexes on workspace, execution, workflow, and timestamp fields to ensure quick querying even with thousands of steps.

### 4.4 Local-First Operation
* The core product must be fully functional locally without requiring cloud-based APIs, remote servers, or external AI models.
* Testing should be doable completely headlessly (via `MockAutomationAdapter`) in regular CI pipelines (e.g., Linux containers).
