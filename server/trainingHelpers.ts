type Db = any;

const FOCUS_ATTR_MAP: Record<string, string[]> = {
  FORMA: ["form"],
  RESISTENCIA: ["resistencia"],
  GR: ["gk"],
  DEFESA: ["defesa"],
  ATAQUE: ["finalizacao"],
  PASSE: ["passe"],
};

function clampSkill(value: number) {
  return Math.max(1, Math.min(50, Math.round(value)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function applyWeeklyTraining(
  db: Db,
  season: number,
  matchweek: number,
): Promise<void> {
  const plans = await new Promise<any[]>((resolve) => {
    db.all(
      "SELECT team_id, focus, intensity FROM team_training_plan WHERE season = ? AND matchweek = ?",
      [season, matchweek],
      (_: any, rows: any[]) => resolve(rows || []),
    );
  });

  await Promise.all(
    plans.map(
      (plan) =>
        new Promise<void>((resolve) => {
          db.all(
            "SELECT id, position, gk, defesa, passe, finalizacao, form, resistencia FROM players WHERE team_id = ?",
            [plan.team_id],
            (_: any, players: any[]) => {
              const attrs =
                FOCUS_ATTR_MAP[String(plan.focus || "").toUpperCase()] || [];
              const intensity = Math.max(
                1,
                Math.min(100, Number(plan.intensity) || 50),
              );
              const attrBoostChance = 0.15 + intensity / 200;
              const formBoost = Math.round(intensity / 20);
              const resBoost = Math.round(intensity / 25);
              const stm = db.prepare(
                "UPDATE players SET gk = ?, defesa = ?, passe = ?, finalizacao = ?, form = ?, resistencia = ? WHERE id = ?",
              );
              (players || []).forEach((p) => {
                let gk = p.gk || 1;
                let defesa = p.defesa || 1;
                let passe = p.passe || 1;
                let finalizacao = p.finalizacao || 1;
                let form = p.form || 25;
                let resistencia = p.resistencia || 25;

                if (attrs.includes("form")) form = clampSkill(form + formBoost);
                if (attrs.includes("resistencia"))
                  resistencia = clampSkill(resistencia + resBoost);
                if (
                  attrs.includes("gk") &&
                  p.position === "GR" &&
                  Math.random() < attrBoostChance
                )
                  gk = clampSkill(gk + 1);
                if (
                  attrs.includes("defesa") &&
                  p.position === "DEF" &&
                  Math.random() < attrBoostChance
                )
                  defesa = clampSkill(defesa + 1);
                if (
                  attrs.includes("passe") &&
                  p.position === "MED" &&
                  Math.random() < attrBoostChance
                )
                  passe = clampSkill(passe + 1);
                if (
                  attrs.includes("finalizacao") &&
                  p.position === "ATA" &&
                  Math.random() < attrBoostChance
                )
                  finalizacao = clampSkill(finalizacao + 1);

                stm.run(
                  gk,
                  defesa,
                  passe,
                  finalizacao,
                  form,
                  resistencia,
                  p.id,
                );
              });
              stm.finalize(() => resolve());
            },
          );
        }),
    ),
  );
}
