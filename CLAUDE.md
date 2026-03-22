# CLAUDE.md

## Project Overview

Garmin Connect IQ data field app (Monkey C) that reminds athletes to drink water and eat carbs during activities. Alerts are triggered by time intervals, calorie thresholds, and sustained high HR zones.

## Testing

Tests live in `tests/` and are written in **JavaScript (Jest)**, not Monkey C. This is because Connect IQ's `:test` runner requires the Garmin simulator (GUI), which can't run in CI.

The file `tests/reminderLogic.js` is a **manual JS port** of the business logic in `source/ReminderManager.mc`. It replicates the exact same algorithms, integer arithmetic, comparisons, and state transitions.

**When you change logic in `source/ReminderManager.mc`, you MUST update `tests/reminderLogic.js` to match.** The two files must stay in sync — the JS port is the system under test for the Jest suite.

There are also Monkey C `:test` annotated tests in `source/tests/TestReminderManager.mc` for local simulator testing, but these don't run in CI.

### Running tests

```
npm test
```

## Build

Requires the Garmin Connect IQ SDK. Example:

```
monkeyc -d fr265 -f monkey.jungle -o bin/CarbReminder.prg -y developer_key.der
```

## CI

GitHub Actions runs Jest tests on every PR to `main`/`master` (`.github/workflows/test.yml`).
