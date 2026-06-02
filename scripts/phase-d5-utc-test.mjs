import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const timezones = ["UTC", "Asia/Kolkata", "America/New_York", "Europe/London"];
const expectedDateInput = "2026-05-22";
const expectedTimeInput = "01:55:00";
const expectedDateTimeInput = "2026-05-22T01:55";
const expectedIso = "2026-05-22T01:55:00.000Z";

for (const timezone of timezones) {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const {
      dateTimeLocalUtcInputToIso,
      utcDateAndTimeInputToIso,
      utcIsoToDateInput,
      utcIsoToDateTimeLocalInput,
      utcIsoToTimeInput,
    } = require("./src/geometry/utcDateTime.js");
    const dateInput = "${expectedDateInput}";
    const timeInput = "${expectedTimeInput}";
    const input = "${expectedDateTimeInput}";
    const expectedIso = "${expectedIso}";
    assert.equal(utcDateAndTimeInputToIso(dateInput, timeInput), expectedIso);
    const iso = dateTimeLocalUtcInputToIso(input);
    assert.equal(iso, expectedIso);
    assert.equal(utcIsoToDateTimeLocalInput(iso), input);
    assert.equal(utcIsoToDateTimeLocalInput(expectedIso), input);
    assert.equal(utcIsoToDateInput(expectedIso), dateInput);
    assert.equal(utcIsoToTimeInput(expectedIso), timeInput);
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
  console.log(`${timezone}: ${expectedDateInput} ${expectedTimeInput} -> ${expectedIso}`);
}
