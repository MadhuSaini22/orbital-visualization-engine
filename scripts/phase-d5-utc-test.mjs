import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const timezones = ["Asia/Kolkata", "UTC", "America/New_York"];
const expectedInput = "2026-05-08T00:00";
const expectedIso = "2026-05-08T00:00:00.000Z";

for (const timezone of timezones) {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const {
      dateTimeLocalUtcInputToIso,
      utcIsoToDateTimeLocalInput,
    } = require("./src/geometry/utcDateTime.js");
    const input = "${expectedInput}";
    const expectedIso = "${expectedIso}";
    const iso = dateTimeLocalUtcInputToIso(input);
    assert.equal(iso, expectedIso);
    assert.equal(utcIsoToDateTimeLocalInput(iso), input);
    assert.equal(utcIsoToDateTimeLocalInput(expectedIso), input);
  `], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: timezone },
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `UTC round trip failed in ${timezone}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  console.log(`${timezone}: ${expectedInput} -> ${expectedIso} -> ${expectedInput}`);
}
