/**
 * JavaScript port of ReminderManager.mc business logic.
 *
 * This replicates the EXACT same algorithms, integer arithmetic, comparisons,
 * and state transitions from source/ReminderManager.mc so we can test the
 * logic in CI without the Connect IQ simulator.
 *
 * IMPORTANT: When changing ReminderManager.mc, update this file to match.
 */

// Mirror of Activity.TIMER_STATE_* constants
const TIMER_STATE_OFF = 0;
const TIMER_STATE_ON = 1;
const TIMER_STATE_PAUSED = 2;
const TIMER_STATE_STOPPED = 3;

// Mirror of Graphics.COLOR_* constants
const COLOR_BLUE = 0x0000FF;
const COLOR_ORANGE = 0xFF5500;
const COLOR_RED = 0xFF0000;

const HR_ALERT_COOLDOWN = 300;

class ReminderManager {
  constructor(settings = {}) {
    // Settings (mirrors ReminderManager.mc lines 12-20)
    this._enableTime = settings.enableTime !== undefined ? settings.enableTime : true;
    this._waterIntervalSec = (settings.waterIntervalMin !== undefined ? settings.waterIntervalMin : 20) * 60;
    this._carbIntervalSec = (settings.carbIntervalMin !== undefined ? settings.carbIntervalMin : 30) * 60;
    this._enableCalorie = settings.enableCalorie !== undefined ? settings.enableCalorie : true;
    this._calorieThreshold = settings.calorieThreshold !== undefined ? settings.calorieThreshold : 200;
    this._enableHr = settings.enableHr !== undefined ? settings.enableHr : true;
    this._hrZoneThreshold = settings.hrZoneThreshold !== undefined ? settings.hrZoneThreshold : 4;
    this._hrZoneDurationSec = (settings.hrZoneDurationMin !== undefined ? settings.hrZoneDurationMin : 5) * 60;
    this._maxHr = settings.maxHr !== undefined ? settings.maxHr : 185;

    // State tracking (mirrors ReminderManager.mc lines 23-29)
    this._lastWaterTimeSec = 0;
    this._lastCarbTimeSec = 0;
    this._lastCalorieAlertAt = 0;
    this._hrZoneEnterTimeSec = 0;
    this._inHighHrZone = false;
    this._lastHrAlertTimeSec = 0;
    this._elapsedSec = 0;

    this._nextTimeAlert = 'water'; // unused in current MC code but tracked
  }

  /**
   * Mirrors ReminderManager.check(info) — lines 56-88
   * @param {object} info - { timerState, timerTime (ms or null), calories (or null), currentHeartRate (or null) }
   * @returns {object|null} - { type, message, color } or null
   */
  check(info) {
    // Line 58: Only fire alerts when timer is actively running
    if (info.timerState !== TIMER_STATE_ON) {
      return null;
    }

    // Line 65-68: Null check on timerTime
    var elapsed = info.timerTime;
    if (elapsed === null || elapsed === undefined) {
      return null;
    }

    // Line 69: Integer division (Monkey C truncates)
    this._elapsedSec = Math.trunc(elapsed / 1000);

    // Line 71-87: Priority: HR zone > Calorie > Time
    var alert = this.checkHrZone(info);
    if (alert !== null) {
      return alert;
    }

    alert = this.checkCalorie(info);
    if (alert !== null) {
      return alert;
    }

    alert = this.checkTime();
    if (alert !== null) {
      return alert;
    }

    return null;
  }

  /**
   * Mirrors ReminderManager.getStatus() — lines 91-114
   */
  getStatus() {
    if (!this._enableTime) {
      return 'Active';
    }

    var nextWater = this._lastWaterTimeSec + this._waterIntervalSec - this._elapsedSec;
    var nextCarb = this._lastCarbTimeSec + this._carbIntervalSec - this._elapsedSec;

    var nextSec = nextWater;
    var label = 'W';
    if (nextCarb < nextWater) {
      nextSec = nextCarb;
      label = 'C';
    }

    if (nextSec < 0) {
      nextSec = 0;
    }

    // Monkey C integer division
    var min = Math.trunc(nextSec / 60);
    var sec = nextSec % 60;
    return `${label}: ${min}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Mirrors ReminderManager.checkTime() — lines 117-145
   */
  checkTime() {
    if (!this._enableTime) {
      return null;
    }

    // Water check
    var sinceLastWater = this._elapsedSec - this._lastWaterTimeSec;
    if (sinceLastWater >= this._waterIntervalSec) {
      this._lastWaterTimeSec = this._elapsedSec;
      return {
        type: 'water',
        message: 'DRINK WATER',
        color: COLOR_BLUE,
      };
    }

    // Carb check
    var sinceLastCarb = this._elapsedSec - this._lastCarbTimeSec;
    if (sinceLastCarb >= this._carbIntervalSec) {
      this._lastCarbTimeSec = this._elapsedSec;
      return {
        type: 'carb',
        message: 'EAT CARBS',
        color: COLOR_ORANGE,
      };
    }

    return null;
  }

  /**
   * Mirrors ReminderManager.checkCalorie(info) — lines 148-173
   */
  checkCalorie(info) {
    if (!this._enableCalorie) {
      return null;
    }

    var calories = info.calories;
    if (calories === null || calories === undefined) {
      return null;
    }
    var cal = calories;

    // Line 160-162: threshold crossing with snap-down
    var nextThreshold = this._lastCalorieAlertAt + this._calorieThreshold;
    if (cal >= nextThreshold) {
      // Monkey C integer division: (cal / threshold) * threshold
      this._lastCalorieAlertAt = Math.trunc(cal / this._calorieThreshold) * this._calorieThreshold;
      // Line 164: Also reset time-based carb timer
      this._lastCarbTimeSec = this._elapsedSec;
      return {
        type: 'carb',
        message: `${this._lastCalorieAlertAt} CAL - EAT!`,
        color: COLOR_ORANGE,
      };
    }

    return null;
  }

  /**
   * Mirrors ReminderManager.checkHrZone(info) — lines 176-226
   */
  checkHrZone(info) {
    if (!this._enableHr) {
      return null;
    }

    var hr = info.currentHeartRate;
    if (hr === null || hr === undefined) {
      return null;
    }
    var heartRate = hr;

    // Line 188: HR zone calculation (5-zone model) — INTEGER division
    var hrPercent = Math.trunc((heartRate * 100) / this._maxHr);
    var currentZone = 1;
    if (hrPercent >= 90) {
      currentZone = 5;
    } else if (hrPercent >= 80) {
      currentZone = 4;
    } else if (hrPercent >= 70) {
      currentZone = 3;
    } else if (hrPercent >= 60) {
      currentZone = 2;
    }

    if (currentZone >= this._hrZoneThreshold) {
      if (!this._inHighHrZone) {
        this._inHighHrZone = true;
        this._hrZoneEnterTimeSec = this._elapsedSec;
      }

      // Line 207-210
      var timeInZone = this._elapsedSec - this._hrZoneEnterTimeSec;
      var sinceLastHrAlert = this._elapsedSec - this._lastHrAlertTimeSec;

      if (timeInZone >= this._hrZoneDurationSec && sinceLastHrAlert >= HR_ALERT_COOLDOWN) {
        this._lastHrAlertTimeSec = this._elapsedSec;
        this._hrZoneEnterTimeSec = this._elapsedSec; // Reset
        // Line 214: Also reset water timer
        this._lastWaterTimeSec = this._elapsedSec;
        return {
          type: 'water',
          message: `Z${currentZone} - HYDRATE!`,
          color: COLOR_RED,
        };
      }
    } else {
      this._inHighHrZone = false;
    }

    return null;
  }
}

module.exports = {
  ReminderManager,
  TIMER_STATE_OFF,
  TIMER_STATE_ON,
  TIMER_STATE_PAUSED,
  TIMER_STATE_STOPPED,
  COLOR_BLUE,
  COLOR_ORANGE,
  COLOR_RED,
  HR_ALERT_COOLDOWN,
};
