/**
 * Comprehensive test suite for ReminderManager business logic.
 *
 * Tests the JS port (reminderLogic.js) which mirrors the exact algorithms
 * from source/ReminderManager.mc. Catches logic bugs: wrong thresholds,
 * off-by-one errors, missing state resets, priority ordering issues.
 */

const {
  ReminderManager,
  TIMER_STATE_OFF,
  TIMER_STATE_ON,
  TIMER_STATE_PAUSED,
  TIMER_STATE_STOPPED,
  COLOR_BLUE,
  COLOR_ORANGE,
  COLOR_RED,
  HR_ALERT_COOLDOWN,
} = require('./reminderLogic');

// Helper to create an Activity.Info-like object
function makeInfo(overrides = {}) {
  return {
    timerState: TIMER_STATE_ON,
    timerTime: 0,        // milliseconds
    calories: 0,
    currentHeartRate: null,
    ...overrides,
  };
}

// Helper: advance time and call check
function checkAt(mgr, timeSec, overrides = {}) {
  return mgr.check(makeInfo({ timerTime: timeSec * 1000, ...overrides }));
}

// ============================================================
// Timer State Guard
// ============================================================
describe('Timer State Guard', () => {
  let mgr;
  beforeEach(() => { mgr = new ReminderManager(); });

  test('returns null when timerState is OFF', () => {
    const result = mgr.check(makeInfo({ timerState: TIMER_STATE_OFF, timerTime: 2000000 }));
    expect(result).toBeNull();
  });

  test('returns null when timerState is PAUSED', () => {
    const result = mgr.check(makeInfo({ timerState: TIMER_STATE_PAUSED, timerTime: 2000000 }));
    expect(result).toBeNull();
  });

  test('returns null when timerState is STOPPED', () => {
    const result = mgr.check(makeInfo({ timerState: TIMER_STATE_STOPPED, timerTime: 2000000 }));
    expect(result).toBeNull();
  });

  test('processes alerts when timerState is ON', () => {
    // At 1200s with default 20min water interval, should fire
    const result = checkAt(mgr, 1200);
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
  });

  test('returns null when timerTime is null', () => {
    const result = mgr.check(makeInfo({ timerState: TIMER_STATE_ON, timerTime: null }));
    expect(result).toBeNull();
  });

  test('returns null when timerTime is undefined', () => {
    const result = mgr.check(makeInfo({ timerState: TIMER_STATE_ON, timerTime: undefined }));
    expect(result).toBeNull();
  });
});

// ============================================================
// Time-Based Reminders
// ============================================================
describe('Time-Based Reminders', () => {
  let mgr;
  beforeEach(() => { mgr = new ReminderManager(); });

  test('no alert at time 0', () => {
    expect(checkAt(mgr, 0)).toBeNull();
  });

  test('no alert 1 second before water interval', () => {
    expect(checkAt(mgr, 1199)).toBeNull();
  });

  test('water alert fires at exactly the 20min interval', () => {
    const result = checkAt(mgr, 1200);
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
    expect(result.message).toBe('DRINK WATER');
    expect(result.color).toBe(COLOR_BLUE);
  });

  test('no alert 1 second before carb interval', () => {
    // First consume the water alert at 1200
    checkAt(mgr, 1200);
    expect(checkAt(mgr, 1799)).toBeNull();
  });

  test('carb alert fires at exactly the 30min interval', () => {
    // Consume water alert first
    checkAt(mgr, 1200);
    const result = checkAt(mgr, 1800);
    expect(result).not.toBeNull();
    expect(result.type).toBe('carb');
    expect(result.message).toBe('EAT CARBS');
    expect(result.color).toBe(COLOR_ORANGE);
  });

  test('water fires before carbs when both are due (water interval < carb)', () => {
    // At 1800s: water was last at 1200, so sinceWater=600 < 1200 interval -> no water
    // But carb was last at 0, sinceCarb=1800 >= 1800 interval -> carb fires
    // Actually, let's think: at 1200 water fires. At 1800 carb fires.
    // At 2400: sinceWater = 2400-1200 = 1200 >= 1200 -> water fires (checked first)
    checkAt(mgr, 1200); // water
    checkAt(mgr, 1800); // carb
    const result = checkAt(mgr, 2400);
    expect(result.type).toBe('water');
  });

  test('second water alert fires at correct time after first', () => {
    checkAt(mgr, 1200); // first water at 1200
    checkAt(mgr, 1800); // carb at 1800
    const result = checkAt(mgr, 2400); // second water at 2400 (1200 + 1200)
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
  });

  test('returns null when time reminders are disabled', () => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, enableHr: false });
    expect(checkAt(mgr, 1200)).toBeNull();
    expect(checkAt(mgr, 1800)).toBeNull();
    expect(checkAt(mgr, 7200)).toBeNull();
  });

  test('custom intervals work (5min water, 10min carb)', () => {
    mgr = new ReminderManager({ waterIntervalMin: 5, carbIntervalMin: 10, enableCalorie: false, enableHr: false });
    expect(checkAt(mgr, 299)).toBeNull();
    const water = checkAt(mgr, 300);
    expect(water.type).toBe('water');

    expect(checkAt(mgr, 599)).toBeNull();
    const carb = checkAt(mgr, 600);
    expect(carb.type).toBe('water'); // second water at 600 (300+300)

    const carbAt = checkAt(mgr, 601);
    // carb interval was 600s from 0 -> fires at 600, but water took priority
    // sinceCarb = 601 - 0 = 601 >= 600 -> carb fires
    expect(carbAt.type).toBe('carb');
  });

  test('first alert fires at exactly the interval, not at time 0', () => {
    mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    for (let t = 0; t < 1200; t += 60) {
      expect(checkAt(mgr, t)).toBeNull();
    }
    expect(checkAt(mgr, 1200)).not.toBeNull();
  });

  test('water resets _lastWaterTimeSec to current elapsed', () => {
    mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    checkAt(mgr, 1200); // water fires, _lastWaterTimeSec = 1200
    checkAt(mgr, 1800); // carb fires, _lastCarbTimeSec = 1800
    // Next water at 1200+1200=2400
    expect(checkAt(mgr, 2399)).toBeNull();
    const result = checkAt(mgr, 2400);
    expect(result.type).toBe('water');
  });
});

// ============================================================
// Calorie-Based Reminders
// ============================================================
describe('Calorie-Based Reminders', () => {
  let mgr;
  beforeEach(() => {
    mgr = new ReminderManager({ enableTime: false, enableHr: false });
  });

  test('alert fires when crossing threshold (0 -> 200)', () => {
    const result = checkAt(mgr, 100, { calories: 200 });
    expect(result).not.toBeNull();
    expect(result.type).toBe('carb');
    expect(result.message).toBe('200 CAL - EAT!');
    expect(result.color).toBe(COLOR_ORANGE);
  });

  test('alert fires when jumping past threshold (190 -> 210)', () => {
    checkAt(mgr, 50, { calories: 190 }); // no alert
    const result = checkAt(mgr, 100, { calories: 210 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('200 CAL - EAT!');
  });

  test('_lastCalorieAlertAt snaps to nearest threshold below current', () => {
    // Jump from 50 to 450: (450/200)*200 = 400
    const result = checkAt(mgr, 100, { calories: 450 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('400 CAL - EAT!');
  });

  test('fires only once when jumping past multiple thresholds', () => {
    const result = checkAt(mgr, 100, { calories: 450 });
    expect(result).not.toBeNull();
    // Next check at same calorie should not fire
    expect(checkAt(mgr, 101, { calories: 450 })).toBeNull();
  });

  test('no alert when calories is null', () => {
    expect(checkAt(mgr, 100, { calories: null })).toBeNull();
  });

  test('returns null when calorie reminders are disabled', () => {
    mgr = new ReminderManager({ enableTime: false, enableHr: false, enableCalorie: false });
    expect(checkAt(mgr, 100, { calories: 500 })).toBeNull();
  });

  test('calorie alert resets carb time timer', () => {
    mgr = new ReminderManager({ enableHr: false, enableTime: false });
    // Calorie alert at t=100, calories=200: _lastCarbTimeSec = 100
    const alert = checkAt(mgr, 100, { calories: 200 });
    expect(alert).not.toBeNull();
    expect(alert.type).toBe('carb');
    // Verify internal state: _lastCarbTimeSec was set to 100 (current elapsed)
    // If we re-enable time and check, carb timer should be relative to 100, not 0
    // Use a fresh manager with time enabled to test the interaction
    const mgr2 = new ReminderManager({ enableHr: false });
    // Calorie alert at 500s resets carb timer to 500
    checkAt(mgr2, 500, { calories: 200 });
    // Water fires at 1200 (unaffected by calorie reset)
    const water = checkAt(mgr2, 1200, { calories: 200 });
    expect(water.type).toBe('water');
    // Carb would normally fire at 1800, but timer was reset to 500 -> next carb at 2300
    // At 1800: sinceCarb = 1800-500 = 1300 < 1800 -> no carb
    expect(checkAt(mgr2, 1800, { calories: 200 })).toBeNull();
    // At 2300: sinceCarb = 2300-500 = 1800 >= 1800 -> carb fires
    const carb = checkAt(mgr2, 2300, { calories: 200 });
    expect(carb.type).toBe('carb');
    expect(carb.message).toBe('EAT CARBS'); // time-based carb, not calorie
  });

  test('second calorie alert fires at 400, not 200 again', () => {
    checkAt(mgr, 100, { calories: 200 }); // first alert
    expect(checkAt(mgr, 200, { calories: 300 })).toBeNull(); // under 400
    const result = checkAt(mgr, 300, { calories: 400 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('400 CAL - EAT!');
  });

  test('no alert at exactly 199 calories (just under threshold)', () => {
    expect(checkAt(mgr, 100, { calories: 199 })).toBeNull();
  });

  test('threshold of 50 with calories at 150', () => {
    mgr = new ReminderManager({ enableTime: false, enableHr: false, calorieThreshold: 50 });
    const result = checkAt(mgr, 100, { calories: 150 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('150 CAL - EAT!');
  });

  test('calories = 0 does not trigger alert', () => {
    expect(checkAt(mgr, 100, { calories: 0 })).toBeNull();
  });

  test('exact threshold value triggers alert', () => {
    const result = checkAt(mgr, 100, { calories: 200 });
    expect(result).not.toBeNull();
  });

  test('large calorie count after long activity', () => {
    // Simulate progressive calorie burn
    checkAt(mgr, 100, { calories: 200 }); // 200
    checkAt(mgr, 500, { calories: 400 }); // 400
    checkAt(mgr, 900, { calories: 600 }); // 600
    const result = checkAt(mgr, 1300, { calories: 800 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('800 CAL - EAT!');
  });
});

// ============================================================
// HR Zone Reminders
// ============================================================
describe('HR Zone Calculation', () => {
  // Use maxHr=200 for clean math
  let mgr;
  beforeEach(() => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 200 });
  });

  test('HR=99 (49%) -> Zone 1', () => {
    // hrPercent = (99*100)/200 = 49 -> zone 1
    // No alert even after long time in zone 1 (below threshold 4)
    checkAt(mgr, 0, { currentHeartRate: 99 });
    expect(checkAt(mgr, 600, { currentHeartRate: 99 })).toBeNull();
  });

  test('HR=100 (50%) -> Zone 1 (integer division)', () => {
    // hrPercent = (100*100)/200 = 50 -> 50 < 60 -> zone 1
    checkAt(mgr, 0, { currentHeartRate: 100 });
    expect(checkAt(mgr, 600, { currentHeartRate: 100 })).toBeNull();
  });

  test('HR=119 (59%) -> Zone 1', () => {
    // hrPercent = (119*100)/200 = 59 -> zone 1
    checkAt(mgr, 0, { currentHeartRate: 119 });
    expect(checkAt(mgr, 600, { currentHeartRate: 119 })).toBeNull();
  });

  test('HR=120 (60%) -> Zone 2', () => {
    // hrPercent = (120*100)/200 = 60 -> zone 2 (still below threshold 4)
    checkAt(mgr, 0, { currentHeartRate: 120 });
    expect(checkAt(mgr, 600, { currentHeartRate: 120 })).toBeNull();
  });

  test('HR=139 (69%) -> Zone 2', () => {
    checkAt(mgr, 0, { currentHeartRate: 139 });
    expect(checkAt(mgr, 600, { currentHeartRate: 139 })).toBeNull();
  });

  test('HR=140 (70%) -> Zone 3', () => {
    // With default threshold 4, zone 3 shouldn't trigger
    checkAt(mgr, 0, { currentHeartRate: 140 });
    expect(checkAt(mgr, 600, { currentHeartRate: 140 })).toBeNull();
  });

  test('HR=159 (79%) -> Zone 3', () => {
    checkAt(mgr, 0, { currentHeartRate: 159 });
    expect(checkAt(mgr, 600, { currentHeartRate: 159 })).toBeNull();
  });

  test('HR=160 (80%) -> Zone 4 — triggers alert after duration', () => {
    // Zone 4 meets threshold 4
    checkAt(mgr, 0, { currentHeartRate: 160 });
    const result = checkAt(mgr, 300, { currentHeartRate: 160 });
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
    expect(result.message).toBe('Z4 - HYDRATE!');
    expect(result.color).toBe(COLOR_RED);
  });

  test('HR=179 (89%) -> Zone 4', () => {
    checkAt(mgr, 0, { currentHeartRate: 179 });
    const result = checkAt(mgr, 300, { currentHeartRate: 179 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z4 - HYDRATE!');
  });

  test('HR=180 (90%) -> Zone 5', () => {
    checkAt(mgr, 0, { currentHeartRate: 180 });
    const result = checkAt(mgr, 300, { currentHeartRate: 180 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z5 - HYDRATE!');
  });
});

describe('HR Zone Alert Behavior', () => {
  let mgr;
  beforeEach(() => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 200 });
  });

  test('no alert when HR is null', () => {
    expect(checkAt(mgr, 600, { currentHeartRate: null })).toBeNull();
  });

  test('no alert when HR reminders disabled', () => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, enableHr: false, maxHr: 200 });
    checkAt(mgr, 0, { currentHeartRate: 180 });
    expect(checkAt(mgr, 600, { currentHeartRate: 180 })).toBeNull();
  });

  test('no alert at 299s in zone (1 second short of duration)', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    expect(checkAt(mgr, 299, { currentHeartRate: 160 })).toBeNull();
  });

  test('alert at exactly 300s in zone', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    const result = checkAt(mgr, 300, { currentHeartRate: 160 });
    expect(result).not.toBeNull();
  });

  test('zone exit resets tracking (_inHighHrZone = false)', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    // Exit zone at 200s
    checkAt(mgr, 200, { currentHeartRate: 100 });
    // Re-enter zone at 400s — duration should restart from 400
    checkAt(mgr, 400, { currentHeartRate: 160 });
    // At 699s: time in zone = 699-400 = 299 < 300
    expect(checkAt(mgr, 699, { currentHeartRate: 160 })).toBeNull();
    // At 700s: time in zone = 700-400 = 300 >= 300
    const result = checkAt(mgr, 700, { currentHeartRate: 160 });
    expect(result).not.toBeNull();
  });

  test('cooldown: no second alert within 300s of first', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    checkAt(mgr, 300, { currentHeartRate: 160 }); // first alert fires
    // hrZoneEnterTimeSec reset to 300. Next timeInZone >= 300 at 600.
    // But sinceLastHrAlert = 600 - 300 = 300 >= 300 (cooldown) -> fires
    // Actually at 599: timeInZone = 599-300 = 299 < 300 -> no alert
    expect(checkAt(mgr, 599, { currentHeartRate: 160 })).toBeNull();
  });

  test('cooldown: second alert fires at 600s (300s after first)', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    checkAt(mgr, 300, { currentHeartRate: 160 }); // first alert
    // _hrZoneEnterTimeSec = 300, _lastHrAlertTimeSec = 300
    // At 600: timeInZone = 600-300 = 300 >= 300, sinceLastHrAlert = 600-300 = 300 >= 300
    const result = checkAt(mgr, 600, { currentHeartRate: 160 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z4 - HYDRATE!');
  });

  test('HR alert resets water timer', () => {
    mgr = new ReminderManager({ enableCalorie: false, maxHr: 200 });
    // HR alert at 300s resets water timer
    checkAt(mgr, 0, { currentHeartRate: 160 });
    checkAt(mgr, 300, { currentHeartRate: 160 }); // HR alert, water timer reset to 300
    // Water normally due at 1200, but now due at 300+1200=1500
    // At 1200: sinceWater = 1200-300 = 900 < 1200 -> no water
    expect(checkAt(mgr, 1200, { currentHeartRate: 100 })).toBeNull();
    // At 1500: sinceWater = 1500-300 = 1200 >= 1200 -> water fires
    const result = checkAt(mgr, 1500, { currentHeartRate: 100 });
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
  });

  test('HR alert resets zone enter time', () => {
    checkAt(mgr, 0, { currentHeartRate: 160 });
    const alert = checkAt(mgr, 300, { currentHeartRate: 160 });
    expect(alert).not.toBeNull();
    // _hrZoneEnterTimeSec should now be 300
    // Next alert needs 300 more seconds: at 600
    expect(checkAt(mgr, 500, { currentHeartRate: 160 })).toBeNull();
    expect(checkAt(mgr, 600, { currentHeartRate: 160 })).not.toBeNull();
  });

  test('zone 3 threshold triggers at HR in zone 3', () => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 200, hrZoneThreshold: 3 });
    checkAt(mgr, 0, { currentHeartRate: 140 }); // zone 3
    const result = checkAt(mgr, 300, { currentHeartRate: 140 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z3 - HYDRATE!');
  });

  test('zone 5 threshold only triggers at HR in zone 5', () => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 200, hrZoneThreshold: 5 });
    checkAt(mgr, 0, { currentHeartRate: 160 }); // zone 4
    expect(checkAt(mgr, 300, { currentHeartRate: 160 })).toBeNull(); // zone 4, threshold is 5
    checkAt(mgr, 300, { currentHeartRate: 180 }); // enter zone 5
    const result = checkAt(mgr, 600, { currentHeartRate: 180 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z5 - HYDRATE!');
  });

  test('low maxHr (120): zone calculation still correct', () => {
    mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 120 });
    // Zone 4 at 80%: 120 * 0.80 = 96 bpm. hrPercent = (96*100)/120 = 80
    checkAt(mgr, 0, { currentHeartRate: 96 });
    const result = checkAt(mgr, 300, { currentHeartRate: 96 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z4 - HYDRATE!');
  });

  test('custom duration (1 min) triggers after duration AND cooldown met', () => {
    // Duration = 60s, but cooldown is always 300s.
    // _lastHrAlertTimeSec starts at 0, so sinceLastHrAlert = elapsed - 0 = elapsed.
    // At 60s: timeInZone=60>=60 AND sinceLastHrAlert=60<300 -> BLOCKED by cooldown!
    // At 300s: timeInZone=300>=60 AND sinceLastHrAlert=300>=300 -> fires
    mgr = new ReminderManager({
      enableTime: false, enableCalorie: false,
      maxHr: 200, hrZoneDurationMin: 1,
    });
    checkAt(mgr, 0, { currentHeartRate: 160 });
    // Cooldown blocks at 60s even though duration is met
    expect(checkAt(mgr, 60, { currentHeartRate: 160 })).toBeNull();
    expect(checkAt(mgr, 299, { currentHeartRate: 160 })).toBeNull();
    // At 300s: both conditions met
    const result = checkAt(mgr, 300, { currentHeartRate: 160 });
    expect(result).not.toBeNull();
  });
});

// ============================================================
// Priority Ordering
// ============================================================
describe('Priority Ordering', () => {
  test('HR alert takes priority over calorie alert', () => {
    const mgr = new ReminderManager({ enableTime: false, maxHr: 200 });
    // Set up: both HR and calorie ready to fire
    checkAt(mgr, 0, { currentHeartRate: 160, calories: 50 });
    const result = checkAt(mgr, 300, { currentHeartRate: 160, calories: 250 });
    expect(result.type).toBe('water'); // HR alert (type: water)
    expect(result.color).toBe(COLOR_RED); // HR = red, not calorie orange
  });

  test('HR alert takes priority over time alert', () => {
    const mgr = new ReminderManager({ enableCalorie: false, maxHr: 200 });
    checkAt(mgr, 0, { currentHeartRate: 160 });
    // At 1200s: both HR and time water due
    const result = checkAt(mgr, 1200, { currentHeartRate: 160 });
    expect(result.color).toBe(COLOR_RED); // HR alert, not water blue
  });

  test('calorie alert takes priority over time alert', () => {
    const mgr = new ReminderManager({ enableHr: false });
    // At 1200s: water due. Also calories hit 200.
    const result = checkAt(mgr, 1200, { calories: 200 });
    expect(result.type).toBe('carb'); // calorie alert
    expect(result.message).toBe('200 CAL - EAT!');
  });

  test('when HR fires, calorie and time alerts wait for next cycle', () => {
    const mgr = new ReminderManager({ maxHr: 200 });
    checkAt(mgr, 0, { currentHeartRate: 160, calories: 50 });
    // At 1200: HR + calorie + water all due
    const first = checkAt(mgr, 1200, { currentHeartRate: 160, calories: 250 });
    expect(first.color).toBe(COLOR_RED); // HR

    // Next cycle: calorie should fire (HR resets zone, so no HR)
    const second = checkAt(mgr, 1201, { currentHeartRate: 160, calories: 250 });
    expect(second.type).toBe('carb');
    expect(second.message).toBe('200 CAL - EAT!');
  });
});

// ============================================================
// Cross-Feature Interactions
// ============================================================
describe('Cross-Feature Interactions', () => {
  test('HR alert delays next water alert', () => {
    const mgr = new ReminderManager({ enableCalorie: false, maxHr: 200 });
    checkAt(mgr, 0, { currentHeartRate: 160 });
    checkAt(mgr, 300, { currentHeartRate: 160 }); // HR fires, water timer reset to 300
    // Water would normally fire at 1200, now fires at 1500
    expect(checkAt(mgr, 1200, { currentHeartRate: 100 })).toBeNull();
    const result = checkAt(mgr, 1500, { currentHeartRate: 100 });
    expect(result.type).toBe('water');
    expect(result.message).toBe('DRINK WATER');
  });

  test('calorie alert delays next carb time alert', () => {
    const mgr = new ReminderManager({ enableHr: false });
    // Calorie alert at t=500, resets carb timer to 500
    checkAt(mgr, 500, { calories: 200 });
    // Water fires at 1200 (unaffected)
    const water = checkAt(mgr, 1200, { calories: 200 });
    expect(water.type).toBe('water');
    // Carb normally at 1800, now at 500+1800=2300
    // At 1800: sinceCarb = 1800-500 = 1300 < 1800 -> no carb
    expect(checkAt(mgr, 1800, { calories: 200 })).toBeNull();
    // At 2300: carb fires
    const carb = checkAt(mgr, 2300, { calories: 200 });
    expect(carb.type).toBe('carb');
  });

  test('long activity: multiple alerts in correct sequence', () => {
    const mgr = new ReminderManager({ enableHr: false, enableCalorie: false });
    const alerts = [];

    // Simulate activity for 1 hour, checking every 60 seconds
    for (let t = 0; t <= 3600; t += 60) {
      const result = checkAt(mgr, t);
      if (result) {
        alerts.push({ time: t, type: result.type, message: result.message });
      }
    }

    // Water: 1200, 2400, 3600
    // Carb: 1800
    expect(alerts.length).toBe(4);
    expect(alerts[0]).toMatchObject({ time: 1200, type: 'water' });
    expect(alerts[1]).toMatchObject({ time: 1800, type: 'carb' });
    expect(alerts[2]).toMatchObject({ time: 2400, type: 'water' });
    expect(alerts[3]).toMatchObject({ time: 3600, type: 'water' }); // water at 3600 (2400+1200)
  });
});

// ============================================================
// getStatus() Display
// ============================================================
describe('getStatus()', () => {
  test('shows "W: 20:00" initially (water closer than carbs)', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    checkAt(mgr, 0); // set _elapsedSec
    expect(mgr.getStatus()).toBe('W: 20:00');
  });

  test('shows countdown decreasing over time', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    checkAt(mgr, 600); // 10 minutes in
    expect(mgr.getStatus()).toBe('W: 10:00');
  });

  test('shows "C" when carbs are closer', () => {
    const mgr = new ReminderManager({
      enableCalorie: false, enableHr: false,
      waterIntervalMin: 30, carbIntervalMin: 20,
    });
    checkAt(mgr, 0);
    expect(mgr.getStatus()).toBe('C: 20:00');
  });

  test('shows "Active" when time reminders disabled', () => {
    const mgr = new ReminderManager({ enableTime: false });
    expect(mgr.getStatus()).toBe('Active');
  });

  test('negative countdown clamps to 0', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    // Set elapsed past the interval without triggering (e.g., by manipulating directly)
    mgr._elapsedSec = 1300; // past 1200 water interval
    const status = mgr.getStatus();
    expect(status).toBe('W: 0:00');
  });

  test('format: minutes not zero-padded, seconds zero-padded', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    checkAt(mgr, 891); // 1200 - 891 = 309 sec = 5:09
    expect(mgr.getStatus()).toBe('W: 5:09');
  });

  test('shows carb countdown after water fires', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    checkAt(mgr, 1200); // water fires, _lastWaterTimeSec = 1200
    // nextWater = 1200 + 1200 - 1200 = 1200
    // nextCarb = 0 + 1800 - 1200 = 600
    // carb is closer (600 < 1200)
    expect(mgr.getStatus()).toBe('C: 10:00');
  });
});

// ============================================================
// Edge Cases
// ============================================================
describe('Edge Cases', () => {
  test('first compute call at elapsed=0 fires no alerts', () => {
    const mgr = new ReminderManager();
    expect(checkAt(mgr, 0)).toBeNull();
  });

  test('very large elapsed time (10 hours)', () => {
    const mgr = new ReminderManager({ enableHr: false, enableCalorie: false });
    // At 36000s, multiple intervals have passed. Water fires.
    const result = checkAt(mgr, 36000);
    expect(result).not.toBeNull();
  });

  test('integer division behavior matches Monkey C', () => {
    // Monkey C: (heartRate * 100) / _maxHr is integer division
    // HR=185, maxHr=185: (185*100)/185 = 100 -> zone 5
    const mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 185 });
    checkAt(mgr, 0, { currentHeartRate: 185 });
    const result = checkAt(mgr, 300, { currentHeartRate: 185 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z5 - HYDRATE!');
  });

  test('HR at exactly maxHr boundary', () => {
    const mgr = new ReminderManager({ enableTime: false, enableCalorie: false, maxHr: 200 });
    // hrPercent = (200*100)/200 = 100 >= 90 -> zone 5
    checkAt(mgr, 0, { currentHeartRate: 200 });
    const result = checkAt(mgr, 300, { currentHeartRate: 200 });
    expect(result).not.toBeNull();
    expect(result.message).toBe('Z5 - HYDRATE!');
  });

  test('all features disabled returns null always', () => {
    const mgr = new ReminderManager({
      enableTime: false, enableCalorie: false, enableHr: false,
    });
    expect(checkAt(mgr, 0, { calories: 500, currentHeartRate: 200 })).toBeNull();
    expect(checkAt(mgr, 36000, { calories: 5000, currentHeartRate: 200 })).toBeNull();
  });

  test('timerTime with sub-second precision truncates correctly', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    // 1200999ms -> 1200s elapsed (truncated), should trigger water
    const result = mgr.check(makeInfo({ timerTime: 1200999 }));
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
  });

  test('timerTime exactly at millisecond boundary', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    // 1200000ms -> exactly 1200s
    const result = mgr.check(makeInfo({ timerTime: 1200000 }));
    expect(result).not.toBeNull();
    expect(result.type).toBe('water');
  });

  test('rapid successive calls at same time produce one alert', () => {
    const mgr = new ReminderManager({ enableCalorie: false, enableHr: false });
    const first = checkAt(mgr, 1200);
    expect(first).not.toBeNull();
    // Same time again — water timer already reset to 1200
    const second = checkAt(mgr, 1200);
    expect(second).toBeNull();
  });

  test('calorie threshold integer division: 199/200 = 0', () => {
    const mgr = new ReminderManager({ enableTime: false, enableHr: false });
    // At 199 calories: nextThreshold = 0 + 200 = 200, 199 < 200 -> no alert
    expect(checkAt(mgr, 100, { calories: 199 })).toBeNull();
  });

  test('calorie jump across many thresholds snaps correctly', () => {
    const mgr = new ReminderManager({ enableTime: false, enableHr: false, calorieThreshold: 100 });
    // Jump from 0 to 550: (550/100)*100 = 500
    const result = checkAt(mgr, 100, { calories: 550 });
    expect(result.message).toBe('500 CAL - EAT!');
    // Next threshold is 600
    expect(checkAt(mgr, 200, { calories: 599 })).toBeNull();
    expect(checkAt(mgr, 300, { calories: 600 })).not.toBeNull();
  });
});
