const test = require("node:test");
const assert = require("node:assert/strict");
const { planMigration } = require("../src/migration-planner");

test("enrichit le plan avec les notes et risques MCreator", () => {
  const inspection = {
    detection: {
      loader: "Forge",
      modLoader: "Forge",
      gameVersion: "1.12.2",
      java: "Java 8",
      isMcreator: true,
      generator: "MCreator"
    }
  };

  const plan = planMigration(inspection, {
    loader: "Forge",
    gameVersion: "1.20.1",
    java: "Java 17"
  });

  assert.equal(plan.strategy, "Migration en escalier sur le même loader");
  assert.ok(plan.knowledge.generatorNotes.length > 0);
  assert.ok(plan.knowledge.versionNotes.length > 0);
  assert.ok(plan.risks.some((risk) => risk.includes("MCreator")));
  assert.ok(plan.manualTasks.some((task) => task.includes("MCreator")));
});
