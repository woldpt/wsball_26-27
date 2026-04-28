#!/usr/bin/env node

/**
 * Frontend JSDoc Type Checker — validates JSDoc type annotations
 * in React components and modules.
 *
 * Checks for:
 * - Undeclared function parameters
 * - Inconsistent @param/@returns types
 * - Missing prop type documentation
 * - Type conflicts with actual assignments
 *
 * Usage: node client/scripts/jsDocTypeChecker.js
 */

const fs = require("fs");
const path = require("path");

class JSDocTypeChecker {
  constructor(srcDir) {
    this.srcDir = srcDir;
    this.issues = [];
  }

  extractJSDocBlock(content, lineNumber) {
    const lines = content.split("\n");
    let blockStart = lineNumber;

    // Scan backwards to find /** start
    while (blockStart >= 0 && !lines[blockStart].includes("/**")) {
      blockStart--;
    }

    if (blockStart < 0) return null;

    let blockEnd = blockStart;
    while (blockEnd < lines.length && !lines[blockEnd].includes("*/")) {
      blockEnd++;
    }

    const block = lines.slice(blockStart, blockEnd + 1).join("\n");
    return block;
  }

  parseFunctionDeclaration(line) {
    // function foo(a, b, c) or const foo = (a, b, c) =>
    const match = line.match(/(?:function\s+\w+|const\s+\w+\s*=)?\s*\(([^)]*)\)/);
    if (!match) return [];
    return match[1]
      .split(",")
      .map((p) => p.trim().split(/[=:]/, 1)[0])
      .filter(Boolean);
  }

  parseJSDocParams(jsDocBlock) {
    if (!jsDocBlock) return [];
    const paramPattern = /@param\s+(?:\{([^}]+)\})?\s+(\w+)/g;
    const params = [];
    let match;
    while ((match = paramPattern.exec(jsDocBlock)) !== null) {
      params.push({
        name: match[2],
        type: match[1] || "unknown",
      });
    }
    return params;
  }

  validateFunctionSignature(filePath, content) {
    const lines = content.split("\n");

    // Match: function declarations, arrow functions
    const functionPattern = /(?:function\s+\w+|const\s+\w+\s*=)\s*\(([^)]*)\)/g;
    let match;

    while ((match = functionPattern.exec(content)) !== null) {
      const lineNum =
        content.substring(0, match.index).split("\n").length - 1;
      const declaredParams = this.parseFunctionDeclaration(lines[lineNum]);
      const jsDocBlock = this.extractJSDocBlock(content, lineNum);
      const documentedParams = this.parseJSDocParams(jsDocBlock);

      const documentedNames = documentedParams.map((p) => p.name);
      const undocumented = declaredParams.filter(
        (p) => !documentedNames.includes(p),
      );

      if (undocumented.length > 0) {
        this.addIssue(
          "warning",
          filePath,
          lineNum + 1,
          `Undocumented parameter(s): ${undocumented.join(", ")}`,
        );
      }

      const documented = documentedNames.filter(
        (n) => !declaredParams.includes(n),
      );
      if (documented.length > 0) {
        this.addIssue(
          "warning",
          filePath,
          lineNum + 1,
          `Parameter(s) documented but not in signature: ${documented.join(", ")}`,
        );
      }
    }
  }

  validateReactComponent(filePath, content) {
    // Look for React functional components
    const compPattern = /(?:function|const)\s+(\w+)\s*\(\s*\{([^}]*)\}\s*\)/g;
    let match;

    while ((match = compPattern.exec(content)) !== null) {
      const componentName = match[1];
      const destructuredProps = match[2]
        .split(",")
        .map((p) => p.trim().split(/[=:]/, 1)[0])
        .filter(Boolean);

      const lineNum = content.substring(0, match.index).split("\n").length - 1;
      const jsDocBlock = this.extractJSDocBlock(content, lineNum);

      // Check if component has @param documentation for props
      if (destructuredProps.length > 0 && !jsDocBlock?.includes("@param")) {
        this.addIssue(
          "info",
          filePath,
          lineNum + 1,
          `Component '${componentName}' destructures props but has no @param documentation`,
        );
      }
    }
  }

  validateTypeConsistency(filePath, content) {
    // Look for @type annotations and check consistency
    const typePattern = /@type\s*\{([^}]+)\}\s*(\w+)/g;
    let match;

    while ((match = typePattern.exec(content)) !== null) {
      const declaredType = match[1];
      const varName = match[2];
      const lineNum = content.substring(0, match.index).split("\n").length - 1;

      // Check if variable is reassigned with different type
      const varPattern = new RegExp(`${varName}\\s*=\\s*`, "g");
      let varMatch;

      while ((varMatch = varPattern.exec(content)) !== null) {
        const assignLineNum =
          content.substring(0, varMatch.index).split("\n").length - 1;
        if (assignLineNum > lineNum) {
          // This is a reassignment; check value type
          const assignLine = content.split("\n")[assignLineNum];
          if (
            declaredType.includes("string") &&
            !assignLine.includes('"') &&
            !assignLine.includes("'")
          ) {
            this.addIssue(
              "warning",
              filePath,
              assignLineNum + 1,
              `Variable '${varName}' declared as ${declaredType} but assigned non-string value`,
            );
          }
        }
      }
    }
  }

  addIssue(severity, filePath, line, message) {
    this.issues.push({
      severity,
      file: path.relative(this.srcDir, filePath),
      line,
      message,
    });
  }

  async scanDirectory() {
    const files = this.walkDir(this.srcDir);
    console.log(`\n📋 Checking ${files.length} JavaScript files...\n`);

    for (const file of files) {
      if (!file.endsWith(".js") && !file.endsWith(".jsx")) continue;

      const content = fs.readFileSync(file, "utf-8");

      this.validateFunctionSignature(file, content);
      this.validateReactComponent(file, content);
      this.validateTypeConsistency(file, content);
    }
  }

  walkDir(dir) {
    let files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        files = files.concat(this.walkDir(path.join(dir, entry.name)));
      } else {
        files.push(path.join(dir, entry.name));
      }
    }

    return files;
  }

  report() {
    const errors = this.issues.filter((i) => i.severity === "error");
    const warnings = this.issues.filter((i) => i.severity === "warning");
    const infos = this.issues.filter((i) => i.severity === "info");

    console.log("─".repeat(70));

    if (errors.length > 0) {
      console.log("\n❌ ERRORS:\n");
      for (const issue of errors) {
        console.log(`   ${issue.file}:${issue.line}`);
        console.log(`   ${issue.message}\n`);
      }
    }

    if (warnings.length > 0) {
      console.log("\n⚠️  WARNINGS:\n");
      for (const issue of warnings) {
        console.log(`   ${issue.file}:${issue.line}`);
        console.log(`   ${issue.message}\n`);
      }
    }

    if (infos.length > 0) {
      console.log("\nℹ️  SUGGESTIONS:\n");
      for (const issue of infos) {
        console.log(`   ${issue.file}:${issue.line}`);
        console.log(`   ${issue.message}\n`);
      }
    }

    console.log("─".repeat(70));
    console.log(
      `\n📊 Summary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} suggestions\n`,
    );

    return errors.length === 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const srcDir = path.join(__dirname, "..", "src");

  if (!fs.existsSync(srcDir)) {
    console.error(`❌ Source directory not found: ${srcDir}`);
    process.exit(1);
  }

  const checker = new JSDocTypeChecker(srcDir);
  await checker.scanDirectory();
  const success = checker.report();

  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Type checking failed:", err);
  process.exit(1);
});
