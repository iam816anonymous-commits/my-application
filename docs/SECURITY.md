# Security and Isolation Specification — Automation OS

Security is a primary concern for Automation OS. Because automation tools manipulate browsers, databases, local file systems, and desktop applications, the system must enforce strict guardrails.

## 1. Authentication and Authorization

### 1.1 Secure Credentials
* **Password Storage:** Plaintext passwords must never be stored. Passwords must be hashed using a modern adaptive hashing algorithm (e.g., `bcrypt` or `argon2`) with appropriate work factors.
* **Token Issuance:** Access is granted via cryptographically signed JSON Web Tokens (JWT) containing token expiry (TTL) and workspace memberships.
* **Workspace Isolation:** All API routes must enforce workspace isolation. A user authenticated in `Workspace A` must be prevented from reading workflows, schedules, or execution logs in `Workspace B`.

---

## 2. Ephemeral Credential Redaction

Workflows must **never** store raw passwords or tokens in their step configurations.

```
Incorrect:  Step(Click Login) -> Type(Password: "MySecret123!")
Correct:    Step(Click Login) -> Type(CredentialReference: "cred-user-pass-001")
```

### 2.1 Credential Injection Pipeline
1. The workflow engine encounters a step requiring a credential reference.
2. The engine requests the secret from `CredentialProvider` at runtime.
3. The provider decrypts the secret in-memory, transfers it securely to the worker, and injects it into the step execution scope.
4. **Redaction Filter:** All stdout/stderr, step results, and logs must be passed through a redaction filter that masks known injected credentials with `[REDACTED]`.

---

## 3. Policy Guardrails (The Policy Engine)

Before any step is executed, the `Policy Engine` evaluates the action against active policies.

```
Workflow Step Request
        │
        ▼
┌─────────────────────────────────┐
│     Policy Engine Evaluation    │
│                                 │
│  - Is directory allowed?        │
│  - Is application permitted?    │ ──► Violates Policy? ──► Abort Step (Failed Policy)
│  - Is network target in list?   │
└─────────────────────────────────┘
        │
        ▼ Cleared
Execute Step Action
```

### 3.1 Policy Directives
* **Allowed Directories:** Limits file upload, download, and execution steps to specific local folders (e.g., `/tmp/automation/` or `%USERPROFILE%\Downloads`).
* **Permitted Target Domains:** Restricts browser navigation to an explicit list of URLs or internal domains.
* **Command Restraints:** Exclude arbitrary shell execution by default. If a custom shell command is required, it must be explicitly white-listed in a policy and require manual supervisor confirmation.

---

## 4. Dangerous Operations requiring Policy Approval

Certain operations can have destructive side effects on local systems. These are classified as **Dangerous Operations**:
* Deleting files or formatting directories.
* Submitting high-value monetary transactions.
* Sending customer-facing broadcast emails or messages.
* Installing or launching unregistered binaries.

### 4.1 Consent Workflow
When a dangerous step is encountered, the execution state machine enters `manual_intervention` and pauses, raising an alert. The operator must explicitly authorize the step through the Web Console before the worker proceeds.
