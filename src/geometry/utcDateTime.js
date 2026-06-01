function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function utcIsoToDateTimeLocalInput(iso, fallbackIso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return fallbackIso ? utcIsoToDateTimeLocalInput(fallbackIso) : "";
  }
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("-") + `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function dateTimeLocalUtcInputToIso(input) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
  if (!match) {
    throw new Error("UTC datetime must use YYYY-MM-DDTHH:mm format.");
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0,
  );
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)
  ) {
    throw new Error("UTC datetime is out of range.");
  }

  return date.toISOString();
}

function isValidUtcDateTimeLocalInput(input) {
  try {
    dateTimeLocalUtcInputToIso(input);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  dateTimeLocalUtcInputToIso,
  isValidUtcDateTimeLocalInput,
  utcIsoToDateTimeLocalInput,
};
