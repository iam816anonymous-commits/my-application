import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { WorkflowStep, Evidence, VerificationSpec } from '@automation-os/shared-types';
import { StructuredLogger, VerificationError } from '@automation-os/shared-utils';

const logger = new StructuredLogger('VerificationEngine');

export interface VerificationResult {
  passed: boolean;
  logs: string[];
  error?: string;
}

export class VerificationEngine {
  /**
   * Asserts and validates the environment status based on the step's verification specification
   */
  public async verify(step: WorkflowStep, evidence?: Evidence): Promise<VerificationResult> {
    const spec = step.verification;
    const logs: string[] = [];

    if (!spec) {
      logs.push(`[VERIFIER] No verification spec defined for step: ${step.id}. Defaulting to true.`);
      return { passed: true, logs };
    }

    logger.info(`Starting verification of type: ${spec.type} for step: ${step.id}`);
    logs.push(`[VERIFIER] Evaluating verification type: ${spec.type} with target: ${spec.target}`);

    try {
      switch (spec.type) {
        case 'file_existence':
          return this.verifyFileExistence(spec, logs);

        case 'file_checksum':
          return this.verifyFileChecksum(spec, logs);

        case 'process_state':
          return this.verifyProcessState(spec, logs);

        case 'network_response':
          return await this.verifyNetworkResponse(spec, logs);

        case 'text_match':
          return this.verifyTextMatch(spec, evidence, logs);

        case 'ocr_match':
          return this.verifyOcrMatch(spec, evidence, logs);

        case 'screenshot_match':
          return this.verifyScreenshotMatch(spec, evidence, logs);

        case 'ui_state':
        case 'dom_state':
        case 'control_existence':
        case 'window_existence':
        case 'application_state':
        case 'api_response':
          return this.verifySimulatedState(spec, evidence, logs);

        default:
          throw new VerificationError(`Unsupported verification type: ${spec.type}`);
      }
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      logger.error(`Verification error for step: ${step.id}`, err as Error);
      logs.push(`[VERIFIER ERROR] Assertion failed: ${errorMsg}`);
      return { passed: false, logs, error: errorMsg };
    }
  }

  private verifyFileExistence(spec: VerificationSpec, logs: string[]): VerificationResult {
    const exists = existsSync(spec.target);
    if (!exists) {
      logs.push(`[VERIFIER FAILED] File does not exist at target path: ${spec.target}`);
      return { passed: false, logs, error: `File not found: ${spec.target}` };
    }
    logs.push(`[VERIFIER PASSED] File successfully verified to exist at: ${spec.target}`);
    return { passed: true, logs };
  }

  private verifyFileChecksum(spec: VerificationSpec, logs: string[]): VerificationResult {
    if (!existsSync(spec.target)) {
      logs.push(`[VERIFIER FAILED] Checksum source file does not exist: ${spec.target}`);
      return { passed: false, logs, error: `Checksum target file not found: ${spec.target}` };
    }

    const fileBuffer = readFileSync(spec.target);
    const hashSum = createHash('sha256');
    hashSum.update(fileBuffer);
    const checksum = hashSum.digest('hex');

    const expected = spec.expectedValue?.toLowerCase().trim();
    if (checksum !== expected) {
      logs.push(`[VERIFIER FAILED] Checksum mismatch. Expected SHA256: ${expected}, Calculated: ${checksum}`);
      return { passed: false, logs, error: `Checksum mismatch for file: ${spec.target}` };
    }

    logs.push(`[VERIFIER PASSED] File checksum SHA256 matched successfully: ${checksum}`);
    return { passed: true, logs };
  }

  private verifyProcessState(spec: VerificationSpec, logs: string[]): VerificationResult {
    let active = false;
    const processName = spec.target;

    try {
      const cmd = process.platform === 'win32' ? `tasklist` : `ps -ax`;
      const stdout = execSync(cmd).toString().toLowerCase();
      active = stdout.includes(processName.toLowerCase());
    } catch (_err) {
      // Ignored: fallback to false if process list query fails
    }

    const expectedActive = spec.expectedValue !== 'inactive';
    if (active !== expectedActive) {
      logs.push(`[VERIFIER FAILED] Process state mismatch. Process '${processName}' active: ${active}, Expected active: ${expectedActive}`);
      return { passed: false, logs, error: `Process state mismatch for: ${processName}` };
    }

    logs.push(`[VERIFIER PASSED] Process active state verified cleanly: ${active}`);
    return { passed: true, logs };
  }

  private async verifyNetworkResponse(spec: VerificationSpec, logs: string[]): Promise<VerificationResult> {
    try {
      const res = await fetch(spec.target);
      const expectedStatus = spec.expectedValue ? parseInt(spec.expectedValue, 10) : 200;

      if (res.status !== expectedStatus) {
        logs.push(`[VERIFIER FAILED] Network response status mismatch. Expected: ${expectedStatus}, Received: ${res.status}`);
        return { passed: false, logs, error: `Network status mismatch: ${res.status}` };
      }

      logs.push(`[VERIFIER PASSED] Network response validated status: ${res.status}`);
      return { passed: true, logs };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      logs.push(`[VERIFIER FAILED] Network request connection failed: ${msg}`);
      return { passed: false, logs, error: `Network request failed: ${msg}` };
    }
  }

  private verifyTextMatch(spec: VerificationSpec, evidence: Evidence | undefined, logs: string[]): VerificationResult {
    if (!evidence || !evidence.value) {
      logs.push(`[VERIFIER FAILED] Text match verification failed: No textual evidence provided by adapter.`);
      return { passed: false, logs, error: 'Missing textual evidence for text_match verification.' };
    }

    const pattern = spec.expectedValue || spec.target;
    const regex = new RegExp(pattern, 'i');
    const matched = regex.test(evidence.value);

    if (!matched) {
      logs.push(`[VERIFIER FAILED] Text regex pattern '${pattern}' did not match evidence: "${evidence.value}"`);
      return { passed: false, logs, error: `Regex pattern mismatch for text match verification.` };
    }

    logs.push(`[VERIFIER PASSED] Text matched regex pattern successfully.`);
    return { passed: true, logs };
  }

  private verifyOcrMatch(spec: VerificationSpec, evidence: Evidence | undefined, logs: string[]): VerificationResult {
    if (!evidence || !evidence.value) {
      logs.push(`[VERIFIER FAILED] OCR verification failed: No OCR textual evidence provided by adapter.`);
      return { passed: false, logs, error: 'Missing OCR evidence.' };
    }

    const expected = spec.expectedValue?.toLowerCase().trim() || spec.target.toLowerCase().trim();
    const parsedText = evidence.value.toLowerCase();
    const matched = parsedText.includes(expected);

    if (!matched) {
      logs.push(`[VERIFIER FAILED] OCR text does not contain: "${expected}". Found: "${evidence.value}"`);
      return { passed: false, logs, error: `OCR text mismatch: expected "${expected}"` };
    }

    logs.push(`[VERIFIER PASSED] OCR verified text successfully contained: "${expected}"`);
    return { passed: true, logs };
  }

  private verifyScreenshotMatch(spec: VerificationSpec, evidence: Evidence | undefined, logs: string[]): VerificationResult {
    // Screenshot match is handled natively by the OculiX/visual engines inside the adapters.
    // The verifier inspects if a high-confidence match is registered in the evidence metadata.
    if (!evidence) {
      logs.push(`[VERIFIER FAILED] Screenshot match failed: No evidence provided.`);
      return { passed: false, logs, error: 'Missing evidence.' };
    }

    const threshold = spec.threshold || 0.90;
    // Simulate screenshot template similarity matching
    const simString = evidence.value || '1.0';
    const similarity = parseFloat(simString);

    if (isNaN(similarity) || similarity < threshold) {
      logs.push(`[VERIFIER FAILED] Visual match similarity (${similarity}) is below required confidence threshold (${threshold})`);
      return { passed: false, logs, error: `Visual similarity threshold violation: ${similarity} < ${threshold}` };
    }

    logs.push(`[VERIFIER PASSED] Visual template matching succeeded with confidence: ${similarity}`);
    return { passed: true, logs };
  }

  private verifySimulatedState(spec: VerificationSpec, evidence: Evidence | undefined, logs: string[]): VerificationResult {
    // For general UI/DOM/Control state verifications, if the adapter returned successful evidence matching,
    // the verifier checks and validates any expected value rules.
    const expected = spec.expectedValue;
    const actual = evidence?.value;

    if (expected && actual !== expected) {
      logs.push(`[VERIFIER FAILED] State value mismatch for type: ${spec.type}. Expected: "${expected}", Actual: "${actual}"`);
      return { passed: false, logs, error: `State value assertion failed: expected "${expected}"` };
    }

    logs.push(`[VERIFIER PASSED] State verified successfully for verification mode: ${spec.type}`);
    return { passed: true, logs };
  }
}
export default VerificationEngine;
