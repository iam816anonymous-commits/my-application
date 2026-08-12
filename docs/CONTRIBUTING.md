# Contribution Guidelines — Automation OS

Thank you for your interest in contributing to Automation OS! This document outlines code quality requirements, pull request processes, and standard architectural guidelines.

## 1. Architectural Integrity

* **Respect Package Boundaries:** Never bypass package compile boundaries. Do not import adapter-specific modules inside the `workflow-engine`.
* **Adapters must remain adapters:** Do not implement business or application level orchestration logic inside adapters. Adapters only execute individual steps and return standard `ActionResult` packets.
* **Verify Everything:** When contributing new steps or actions, you must define how that state change can be checked and confirmed by the `Verification Engine`.

## 2. Code Quality and Style

* **Strict TypeScript:** Do not use `any` unless absolutely necessary and thoroughly documented. Check your work using `npm run build` or `tsc`.
* **Avoid Hardcoding:** Ensure values such as file locations, system addresses, and secret keys are resolved via environment configurations (`packages/config`).
* **Logs and Errors:** Use structured logging metadata. Never output unredacted raw variables inside general application logs.

## 3. Pull Request Process

1. Ensure the phase dependency graph in `docs/PHASES.md` is respected.
2. Write unit tests for new utility libraries, state nodes, or schema structures.
3. Verify that all automated tests pass successfully in headless mode:
   ```bash
   npm run test
   ```
4. Address linting and styling checks.
5. Submit your PR and await a maintainer review.
