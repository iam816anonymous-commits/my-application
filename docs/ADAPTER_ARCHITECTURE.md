# Adapter Architecture Specification — Automation OS

Execution adapters are standard interfaces that encapsulate the actual technology-dependent implementation details. They protect the core engine from vendor lock-in and implementation detail leakage.

## 1. The Core Adapter Interface

All adapters must implement the standard contract defined in the `adapter-sdk`. The core orchestrator only ever speaks to this interface.

```typescript
export interface IAutomationAdapter {
  /** Unique identifier of the adapter (e.g., "playwright", "pywinauto", "oculix", "robot") */
  readonly id: string;

  /** List of capabilities supported by this adapter (e.g., ["dom", "browser", "windows_ui", "ocr", "visual"]) */
  readonly capabilities: string[];

  /**
   * Initializes the adapter session.
   * Allocates system resources (such as opening a browser context or starting a GUI automation session).
   */
  initialize(context: ExecutionContext): Promise<void>;

  /**
   * Executes a single step.
   * Must always return a standardized outcome containing status, logs, and generated evidence.
   */
  executeStep(step: ExecutionStepSpec, context: ExecutionContext): Promise<ActionResult>;

  /**
   * Cleans up and releases all resources, closing any browsers or processes started by the adapter.
   */
  terminate(): Promise<void>;
}
```

---

## 2. Standardized Action Schema

To avoid proprietary API leakage, actions must be specified in a generalized schema:

```typescript
export interface ExecutionStepSpec {
  id: string;
  order: number;
  action: 'launch' | 'connect' | 'find' | 'click' | 'doubleClick' | 'type' | 'press' | 'scroll' | 'drag' | 'wait' | 'readText' | 'screenshot' | 'upload' | 'download' | 'verify' | 'close';
  target: string;                // CSS Selector, Control ID, Image template path, or coordinates
  parameters: Record<string, any>; // Step-specific key-value pairs (e.g., text to type)
  timeout: number;               // Milliseconds
  retries: number;
  verification?: VerificationSpec;
}
```

---

## 3. Specific Adapter Implementations

### 3.1 Playwright Adapter (`playwright-adapter`)
* **Role:** Primary adapter for modern web applications.
* **Under the Hood:** Invokes Playwright's Node.js API.
* **Isolation:** Launches an isolated `BrowserContext` for each execution to ensure no cookies, sessions, or localStorage carry over between runs.
* **Capabilities:** `["browser", "dom", "network_wait", "cookie_isolation"]`

### 3.2 pywinauto Adapter (`pywinauto-adapter`)
* **Role:** Interacts with native Windows applications containing Win32 or UIA controls.
* **Under the Hood:** Uses a lightweight Python service wrapper that translates step specs to python execution.
* **Safety:** Does not directly run shell strings. It communicates via structured payloads (e.g. `{"action": "click", "control_id": "txtUsername"}`).
* **Capabilities:** `["windows_ui", "win32", "uia", "process_attachment"]`

### 3.3 OculiX Adapter (`oculix-adapter`)
* **Role:** Visual, pixel-based automation fallback when there is no DOM or accessibility tree.
* **Under the Hood:** Implements template matching and OCR boundaries based on the modern OculiX visual package.
* **Confidence Scoring Rules:**
  * Must calculate a similarity confidence score `[0.0 - 1.0]` for every template match.
  * If confidence is lower than a pre-defined threshold (default: `0.90`), the action MUST immediately trigger fallback or raise a `LowConfidence` recovery error.
  * Clicking below confidence is strictly prohibited to prevent dangerous mis-clicks in desktop spaces.
* **Capabilities:** `["visual", "ocr", "region_matching", "dpi_aware"]`

### 3.4 Robot Framework Adapter (`robot-adapter`)
* **Role:** Workflow integration wrapper.
* **Under the Hood:** Runs Robot Framework suites and maps their output files (`output.xml`, logs) into Automation OS standard `ExecutionStep` outputs.
* **Capabilities:** `["rpa_suite", "robot_framework"]`

---

## 4. Adapter Isolation and Agent Topology

Because Windows native applications (pywinauto) and visual automation engines (OculiX) require a real graphical user session, they cannot run inside standard Linux containers.

```
       [ CONTROL PLANE (Linux Cloud/VM) ]
                       │
                       │ Jobs (REST or Redis Queue)
                       ▼
       [ EXECUTION AGENT (Windows Desktop OS) ]
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    (Playwright)  (pywinauto)    (OculiX)
```

1. **Local Isolation:** Real adapters run in designated execution environments.
2. **Execution Agent:** A lightweight local daemon runs on the target Windows system, receives job steps, executes them via the appropriate adapter, and returns the step result and evidence.
