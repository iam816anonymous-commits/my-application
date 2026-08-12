# Testing and State Verification Specification — Automation OS

Testing is the backbone of reliability for Automation OS. This document outlines our testing strategies, state verification methodology, and the architecture of the mock-driven CI pipeline.

## 1. Testing Strategy

We separate testing into three main levels to allow rapid execution in headless environments (like standard Linux CI pipelines) while still ensuring adapter fidelity:

```
+-----------------------------------------------------------------------------------+
|                            UNIT & STATE MACHINE TESTS                             |
|                                                                                   |
|  - Validates: Workflow state transitions, policy evaluations, and schema checks.  |
|  - Dependency: None (100% mocked DB & Network). Run time: < 5 seconds.            |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                            INTEGRATION & QUEUE TESTS                              |
|                                                                                   |
|  - Validates: API gateway, authentication, database storage, and queue workers.   |
|  - Dependency: SQLite, Redis (running locally). Run time: < 30 seconds.           |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                         CI RUNNER (MOCK ADAPTER LOOPS)                            |
|                                                                                   |
|  - Validates: End-to-end workflow execution, verification checks, and evidence.   |
|  - Dependency: Uses MockAutomationAdapter. Requires NO GUI / NO Windows desktop.  |
+-----------------------------------------------------------------------------------+
```

---

## 2. MockAutomationAdapter

To ensure that the CI runner can test the system without a real desktop or browser, we introduce `MockAutomationAdapter`.

### 2.1 Simulation Parameters
The mock adapter reads instruction instructions from step parameters to simulate real-world outcomes:
* **MockSuccess:** Automatically returns success and generates dummy screenshot evidence.
* **MockFailure:** Simulates an element-not-found error, triggering the engine's retry/recovery paths.
* **MockTimeout:** Blocks for a specified period and then times out to test queue limits and job cancellation.
* **MockLowConfidence:** Returns a visual match score of `0.85` (below the required `0.90` threshold) to test the transition into `manual_intervention` state.

---

## 3. The Verification Engine

One of the core rules of Automation OS is: **Never assume an action succeeded merely because the command returned successfully.**

```
          Action Completed (e.g. Click Export)
                           │
                           ▼
          +─────────────────────────────────+
          │   Verification Engine Checks    │
          │                                 │
          │  Evaluate State Conditions:     │
          │  - Does target file exist?      │
          │  - Does window show new state?  │
          │  - Does UI text contain value?  │
          +─────────────────────────────────+
                           │
             ┌─────────────┴─────────────┐
             ▼ Passed                    ▼ Failed
      [ STEP SUCCESS ]            [ STEP FAILURE / RETRY ]
```

### 3.1 Verification Methods
* **UI State Verification:** Evaluates visible controls or browser elements to check for visibility, text value, or focus.
* **DOM State Verification:** Performs assertion tests on the DOM tree (e.g., matching input field contents or node properties).
* **Text & OCR Match:** Uses text extraction (via DOM or visual OCR) to match against standard regular expressions.
* **File Existence & Checksum:** Useful for upload/download steps. Confirms that a file exists at the specified path and matches the expected MD5/SHA256 hash.
* **API/Network Response:** Queries an internal or external endpoint to verify backend database updates or external state updates.
