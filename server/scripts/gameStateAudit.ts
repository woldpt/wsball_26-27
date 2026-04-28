import type { ActiveGame } from "../types";

/**
 * Game State Audit — validates game state invariants during play.
 * Checks for budget inconsistencies, invalid squad compositions,
 * duplicate players, broken match phase transitions.
 *
 * Usage: npx tsx server/scripts/gameStateAudit.ts <roomCode>
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

interface AuditIssue {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  details?: Record<string, any>;
}

class GameStateAuditor {
  private issues: AuditIssue[] = [];
  private db: any;
  private roomCode: string;

  constructor(db: any, roomCode: string) {
    this.db = db;
    this.roomCode = roomCode;
  }

  private addIssue(
    severity: "error" | "warning" | "info",
    category: string,
    message: string,
    details?: Record<string, any>,
  ) {
    this.issues.push({ severity, category, message, details });
  }

  private async runQuery<T>(
    sql: string,
    params: any[] = [],
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  private async getTeams() {
    return this.runQuery<any>(
      "SELECT id, name, division, budget, coach_name FROM teams",
    );
  }

  private async getPlayers() {
    return this.runQuery<any>(
      "SELECT id, name, team_id, market_value, salary, contract_end_matchweek FROM players",
    );
  }

  private async getMatches() {
    return this.runQuery<any>(
      "SELECT id, home_team_id, away_team_id, status, matchweek FROM matches",
    );
  }

  async audit() {
    console.log(
      `\n📋 Auditing game state for room ${this.roomCode}...\n`,
    );

    try {
      await this.auditTeamBudgets();
      await this.auditSquadComposition();
      await this.auditDuplicatePlayers();
      await this.auditContractExpiry();
      await this.auditMatchPhases();
      await this.auditTransfersIntegrity();

      return this.reportIssues();
    } catch (err) {
      console.error("❌ Audit failed:", err);
      process.exit(1);
    }
  }

  private async auditTeamBudgets() {
    const teams = await this.getTeams();

    for (const team of teams) {
      const players = await this.runQuery<any>(
        "SELECT SUM(salary) as total_salary FROM players WHERE team_id = ?",
        [team.id],
      );

      const totalSalary = players[0]?.total_salary || 0;

      if (totalSalary > 0 && team.budget < 0 && Math.abs(team.budget) > totalSalary * 10) {
        this.addIssue(
          "error",
          "budget",
          `Team ${team.name} has massive negative budget (${team.budget}) vs salary obligations (${totalSalary})`,
          { teamId: team.id, budget: team.budget, totalSalary },
        );
      }

      if (totalSalary > 0 && team.budget < totalSalary * 0.5) {
        this.addIssue(
          "warning",
          "budget",
          `Team ${team.name} budget (${team.budget}) may be insufficient for salaries (${totalSalary})`,
          { teamId: team.id, budget: team.budget, totalSalary },
        );
      }
    }
  }

  private async auditSquadComposition() {
    const teams = await this.getTeams();

    for (const team of teams) {
      const players = await this.runQuery<any>(
        "SELECT position, COUNT(*) as count FROM players WHERE team_id = ? AND active = 1 GROUP BY position",
        [team.id],
      );

      const positions: Record<string, number> = {};
      for (const row of players) {
        positions[row.position] = row.count;
      }

      const expectedMin = { GR: 1, DEF: 3, MED: 3, ATA: 1 };
      for (const [pos, minCount] of Object.entries(expectedMin)) {
        if ((positions[pos] || 0) < minCount) {
          this.addIssue(
            "warning",
            "squad",
            `Team ${team.name} has insufficient ${pos} players (${positions[pos] || 0} < ${minCount})`,
            { teamId: team.id, position: pos, count: positions[pos] || 0 },
          );
        }
      }

      const totalPlayers = Object.values(positions).reduce((a, b) => a + b, 0);
      if (totalPlayers > 23) {
        this.addIssue(
          "error",
          "squad",
          `Team ${team.name} has too many players (${totalPlayers} > 23)`,
          { teamId: team.id, totalPlayers },
        );
      }
    }
  }

  private async auditDuplicatePlayers() {
    const duplicates = await this.runQuery<any>(
      "SELECT name, COUNT(*) as count FROM players WHERE active = 1 GROUP BY name HAVING count > 1",
    );

    for (const dup of duplicates) {
      this.addIssue(
        "error",
        "duplicates",
        `Player '${dup.name}' appears ${dup.count} times in active squads`,
        { playerName: dup.name, count: dup.count },
      );
    }
  }

  private async auditContractExpiry() {
    const expiredContracts = await this.runQuery<any>(
      "SELECT id, name, team_id, contract_end_matchweek FROM players WHERE contract_end_matchweek IS NOT NULL AND contract_end_matchweek < 1",
    );

    if (expiredContracts.length > 0) {
      this.addIssue(
        "warning",
        "contracts",
        `${expiredContracts.length} players have contracts expiring before matchweek 1`,
        { count: expiredContracts.length },
      );
    }
  }

  private async auditMatchPhases() {
    const invalidPhases = await this.runQuery<any>(
      "SELECT id, status FROM matches WHERE status NOT IN ('pending', 'first_half', 'halftime', 'second_half', 'extra_time', 'finished')",
    );

    for (const match of invalidPhases) {
      this.addIssue(
        "error",
        "match_phase",
        `Match ${match.id} has invalid status '${match.status}'`,
        { matchId: match.id, status: match.status },
      );
    }
  }

  private async auditTransfersIntegrity() {
    const orphanedTransfers = await this.runQuery<any>(
      "SELECT t.id, t.from_team_id FROM transfers t LEFT JOIN teams tm ON t.from_team_id = tm.id WHERE tm.id IS NULL",
    );

    if (orphanedTransfers.length > 0) {
      this.addIssue(
        "error",
        "transfers",
        `${orphanedTransfers.length} transfers reference deleted teams`,
        { count: orphanedTransfers.length },
      );
    }
  }

  private reportIssues() {
    const byCategory = this.issues.reduce(
      (acc, issue) => {
        if (!acc[issue.category]) acc[issue.category] = [];
        acc[issue.category].push(issue);
        return acc;
      },
      {} as Record<string, AuditIssue[]>,
    );

    const errors = this.issues.filter((i) => i.severity === "error");
    const warnings = this.issues.filter((i) => i.severity === "warning");
    const infos = this.issues.filter((i) => i.severity === "info");

    console.log("─".repeat(60));

    for (const [category, issues] of Object.entries(byCategory)) {
      console.log(`\n📁 ${category.toUpperCase()}`);
      for (const issue of issues) {
        const icon =
          issue.severity === "error"
            ? "❌"
            : issue.severity === "warning"
              ? "⚠️ "
              : "ℹ️ ";
        console.log(`  ${icon} ${issue.message}`);
        if (issue.details) {
          console.log(`     ${JSON.stringify(issue.details)}`);
        }
      }
    }

    console.log("\n─".repeat(60));
    console.log(
      `\n📊 Summary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos\n`,
    );

    return {
      success: errors.length === 0,
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      issues: this.issues,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const roomCode = process.argv[2];
  if (!roomCode) {
    console.error("Usage: npx tsx server/scripts/gameStateAudit.ts <roomCode>");
    process.exit(1);
  }

  const dbPath = path.join(__dirname, "..", "db", `game_${roomCode}.db`);
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(dbPath);
  const auditor = new GameStateAuditor(db, roomCode);

  const result = await auditor.audit();
  db.close();

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
