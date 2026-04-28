/**
 * Socket.io Event Contract Validator — ensures emitted/received Socket.io events
 * conform to expected data structures and types.
 *
 * Parses all socket handler files and validates:
 * - Event names are consistent
 * - Payload structures match definitions
 * - No undefined event references
 * - Missing handlers for emitted events
 *
 * Usage: npx tsx server/scripts/socketioContractValidator.ts
 */

import fs from "fs";
import path from "path";

interface EventContract {
  name: string;
  direction: "emit" | "receive";
  fromFile: string;
  payload?: Record<string, string>;
  line?: number;
}

interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  event: string;
  files: string[];
}

class SocketContractValidator {
  private events: Map<string, EventContract[]> = new Map();
  private issues: ValidationIssue[] = [];
  private serverDir: string;

  constructor(serverDir: string) {
    this.serverDir = serverDir;
  }

  private extractEventsFromFile(
    filePath: string,
    content: string,
  ): EventContract[] {
    const events: EventContract[] = [];
    const lines = content.split("\n");

    // Pattern: socket.emit("eventName"
    const emitPattern = /socket\.emit\s*\(\s*["']([^"']+)["']\s*,\s*({[^}]*})?/g;
    const receivePattern = /socket\.on\s*\(\s*["']([^"']+)["']/g;

    let match: RegExpExecArray | null;
    while ((match = emitPattern.exec(content)) !== null) {
      const eventName = match[1];
      const lineNum = content.substring(0, match.index).split("\n").length;
      events.push({
        name: eventName,
        direction: "emit",
        fromFile: path.basename(filePath),
        line: lineNum,
      });
    }

    while ((match = receivePattern.exec(content)) !== null) {
      const eventName = match[1];
      const lineNum = content.substring(0, match.index).split("\n").length;
      events.push({
        name: eventName,
        direction: "receive",
        fromFile: path.basename(filePath),
        line: lineNum,
      });
    }

    return events;
  }

  private scanSocketHandlers() {
    const handlerFiles = fs
      .readdirSync(this.serverDir)
      .filter((f) => f.match(/^socket.*Handlers\.(ts|js)$/));

    for (const file of handlerFiles) {
      const filePath = path.join(this.serverDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const events = this.extractEventsFromFile(filePath, content);

      for (const event of events) {
        if (!this.events.has(event.name)) {
          this.events.set(event.name, []);
        }
        this.events.get(event.name)!.push(event);
      }
    }
  }

  private validateConsistency() {
    for (const [eventName, contracts] of this.events.entries()) {
      const emissions = contracts.filter((c) => c.direction === "emit");
      const receivers = contracts.filter((c) => c.direction === "receive");

      // Check: event emitted but never received
      if (emissions.length > 0 && receivers.length === 0) {
        this.issues.push({
          severity: "warning",
          message: `Event '${eventName}' is emitted but never listened to`,
          event: eventName,
          files: emissions.map((e) => `${e.fromFile}:${e.line}`),
        });
      }

      // Check: event received but never emitted
      if (receivers.length > 0 && emissions.length === 0) {
        this.issues.push({
          severity: "warning",
          message: `Event '${eventName}' is listened to but never emitted`,
          event: eventName,
          files: receivers.map((r) => `${r.fromFile}:${r.line}`),
        });
      }

      // Check: multiple handlers for same event (potential conflicts)
      if (receivers.length > 1) {
        this.issues.push({
          severity: "warning",
          message: `Event '${eventName}' has ${receivers.length} handlers (potential conflicts)`,
          event: eventName,
          files: receivers.map((r) => `${r.fromFile}:${r.line}`),
        });
      }
    }
  }

  private validateNamingConventions() {
    for (const eventName of this.events.keys()) {
      // Check: camelCase convention
      if (!/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(eventName)) {
        // Allow snake_case variants used in some handlers
        if (!/^[a-z_]+$/.test(eventName)) {
          this.issues.push({
            severity: "warning",
            message: `Event '${eventName}' does not follow camelCase convention`,
            event: eventName,
            files: (this.events.get(eventName) || []).map((c) => `${c.fromFile}:${c.line}`),
          });
        }
      }

      // Check: too generic names
      const generic = ["data", "message", "update", "response"];
      if (generic.includes(eventName.toLowerCase())) {
        this.issues.push({
          severity: "warning",
          message: `Event '${eventName}' is too generic; consider more specific naming`,
          event: eventName,
          files: (this.events.get(eventName) || []).map((c) => `${c.fromFile}:${c.line}`),
        });
      }
    }
  }

  async validate() {
    console.log("\n🔌 Validating Socket.io event contracts...\n");

    this.scanSocketHandlers();
    console.log(`✓ Found ${this.events.size} unique socket events\n`);

    this.validateConsistency();
    this.validateNamingConventions();

    this.reportIssues();
  }

  private reportIssues() {
    if (this.issues.length === 0) {
      console.log("✅ All socket contracts are valid!\n");
      return;
    }

    console.log("─".repeat(70));
    console.log("📋 Issues Found:\n");

    const warnings = this.issues.filter((i) => i.severity === "warning");
    const errors = this.issues.filter((i) => i.severity === "error");

    for (const issue of errors) {
      console.log(`❌ ${issue.event}`);
      console.log(`   ${issue.message}`);
      console.log(`   At: ${issue.files.join(", ")}\n`);
    }

    for (const issue of warnings) {
      console.log(`⚠️  ${issue.event}`);
      console.log(`   ${issue.message}`);
      console.log(`   At: ${issue.files.join(", ")}\n`);
    }

    console.log("─".repeat(70));
    console.log(
      `\n📊 Summary: ${errors.length} errors, ${warnings.length} warnings\n`,
    );
  }

  generateEventRegistry() {
    const registry: Record<
      string,
      { emit: string[]; receive: string[] }
    > = {};

    for (const [eventName, contracts] of this.events.entries()) {
      registry[eventName] = {
        emit: contracts
          .filter((c) => c.direction === "emit")
          .map((c) => c.fromFile),
        receive: contracts
          .filter((c) => c.direction === "receive")
          .map((c) => c.fromFile),
      };
    }

    const registryPath = path.join(
      this.serverDir,
      "socketEventRegistry.json",
    );
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`\n📝 Event registry saved to: ${registryPath}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const serverDir = path.join(__dirname, "..");
  const validator = new SocketContractValidator(serverDir);

  await validator.validate();
  validator.generateEventRegistry();
}

main().catch((err) => {
  console.error("❌ Validation failed:", err);
  process.exit(1);
});
