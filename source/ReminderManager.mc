import Toybox.Lang;
import Toybox.Activity;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Time;

//! Manages all reminder triggers: time-based, calorie-based, and HR zone-based.
//! Returns alert info when a reminder should fire.
class ReminderManager {

    // Settings
    private var _enableTime as Boolean = true;
    private var _waterIntervalSec as Number = 1200;   // 20 min
    private var _carbIntervalSec as Number = 1800;     // 30 min
    private var _enableCalorie as Boolean = true;
    private var _calorieThreshold as Number = 200;
    private var _enableHr as Boolean = true;
    private var _hrZoneThreshold as Number = 4;
    private var _hrZoneDurationSec as Number = 300;    // 5 min
    private var _maxHr as Number = 185;

    // State tracking
    private var _lastWaterTimeSec as Number = 0;
    private var _lastCarbTimeSec as Number = 0;
    private var _lastCalorieAlertAt as Number = 0;
    private var _hrZoneEnterTimeSec as Number = 0;
    private var _inHighHrZone as Boolean = false;
    private var _lastHrAlertTimeSec as Number = 0;
    private var _elapsedSec as Number = 0;

    // Alternate between water and carb for time-based
    private var _nextTimeAlert as Symbol = :water;

    // Minimum gap between HR alerts (seconds)
    private const HR_ALERT_COOLDOWN = 300;

    function initialize() {
        loadSettings();
    }

    //! Load user settings from properties
    function loadSettings() as Void {
        var props = Application.Properties;

        _enableTime = getBoolProp(props, "enableTimeReminders", true);
        _waterIntervalSec = getNumProp(props, "waterIntervalMin", 20) * 60;
        _carbIntervalSec = getNumProp(props, "carbIntervalMin", 30) * 60;
        _enableCalorie = getBoolProp(props, "enableCalorieReminders", true);
        _calorieThreshold = getNumProp(props, "calorieThreshold", 200);
        _enableHr = getBoolProp(props, "enableHrReminders", true);
        _hrZoneThreshold = getNumProp(props, "hrZoneThreshold", 4);
        _hrZoneDurationSec = getNumProp(props, "hrZoneDurationMin", 5) * 60;
        _maxHr = getNumProp(props, "maxHr", 185);
    }

    //! Check all triggers. Returns alert dictionary or null.
    //! Alert format: { :type => :water/:carb, :message => String, :color => Number }
    function check(info as Activity.Info) as Dictionary? {
        // Reload settings periodically (in case changed mid-activity)
        loadSettings();

        var elapsed = info.elapsedTime;
        if (elapsed == null) {
            return null;
        }
        _elapsedSec = (elapsed as Number) / 1000;

        // Priority: HR zone > Calorie > Time
        var alert = checkHrZone(info);
        if (alert != null) {
            return alert;
        }

        alert = checkCalorie(info);
        if (alert != null) {
            return alert;
        }

        alert = checkTime();
        if (alert != null) {
            return alert;
        }

        return null;
    }

    //! Get status string for display when no alert is active
    function getStatus() as String {
        if (!_enableTime) {
            return "Active";
        }

        // Show time until next water or carb reminder
        var nextWater = _lastWaterTimeSec + _waterIntervalSec - _elapsedSec;
        var nextCarb = _lastCarbTimeSec + _carbIntervalSec - _elapsedSec;

        var nextSec = nextWater;
        var label = "W";
        if (nextCarb < nextWater) {
            nextSec = nextCarb;
            label = "C";
        }

        if (nextSec < 0) {
            nextSec = 0;
        }

        var min = nextSec / 60;
        var sec = nextSec % 60;
        return Lang.format("$1$: $2$:$3$", [label, min.format("%d"), sec.format("%02d")]);
    }

    //! Check time-based water/carb reminders
    private function checkTime() as Dictionary? {
        if (!_enableTime) {
            return null;
        }

        // Water check
        var sinceLastWater = _elapsedSec - _lastWaterTimeSec;
        if (sinceLastWater >= _waterIntervalSec) {
            _lastWaterTimeSec = _elapsedSec;
            return {
                :type => :water,
                :message => "DRINK WATER",
                :color => Graphics.COLOR_BLUE
            };
        }

        // Carb check
        var sinceLastCarb = _elapsedSec - _lastCarbTimeSec;
        if (sinceLastCarb >= _carbIntervalSec) {
            _lastCarbTimeSec = _elapsedSec;
            return {
                :type => :carb,
                :message => "EAT CARBS",
                :color => Graphics.COLOR_ORANGE
            };
        }

        return null;
    }

    //! Check calorie-based carb reminders
    private function checkCalorie(info as Activity.Info) as Dictionary? {
        if (!_enableCalorie) {
            return null;
        }

        var calories = info.calories;
        if (calories == null) {
            return null;
        }
        var cal = calories as Number;

        // Fire every _calorieThreshold calories burned
        var nextThreshold = _lastCalorieAlertAt + _calorieThreshold;
        if (cal >= nextThreshold) {
            _lastCalorieAlertAt = (cal / _calorieThreshold) * _calorieThreshold;
            // Also reset time-based carb timer to avoid double alerts
            _lastCarbTimeSec = _elapsedSec;
            return {
                :type => :carb,
                :message => Lang.format("$1$ CAL - EAT!", [_lastCalorieAlertAt]),
                :color => Graphics.COLOR_ORANGE
            };
        }

        return null;
    }

    //! Check HR zone-based reminders (sustained high HR = need fuel + water)
    private function checkHrZone(info as Activity.Info) as Dictionary? {
        if (!_enableHr) {
            return null;
        }

        var hr = info.currentHeartRate;
        if (hr == null) {
            return null;
        }
        var heartRate = hr as Number;

        // Calculate HR zone (5-zone model)
        var hrPercent = (heartRate * 100) / _maxHr;
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

        if (currentZone >= _hrZoneThreshold) {
            if (!_inHighHrZone) {
                _inHighHrZone = true;
                _hrZoneEnterTimeSec = _elapsedSec;
            }

            // Check if sustained long enough
            var timeInZone = _elapsedSec - _hrZoneEnterTimeSec;
            var sinceLastHrAlert = _elapsedSec - _lastHrAlertTimeSec;

            if (timeInZone >= _hrZoneDurationSec && sinceLastHrAlert >= HR_ALERT_COOLDOWN) {
                _lastHrAlertTimeSec = _elapsedSec;
                _hrZoneEnterTimeSec = _elapsedSec; // Reset
                // Also reset water timer
                _lastWaterTimeSec = _elapsedSec;
                return {
                    :type => :water,
                    :message => Lang.format("Z$1$ - HYDRATE!", [currentZone]),
                    :color => Graphics.COLOR_RED
                };
            }
        } else {
            _inHighHrZone = false;
        }

        return null;
    }

    //! Safe boolean property getter
    private function getBoolProp(props as Application.Properties, key as String, fallback as Boolean) as Boolean {
        try {
            var val = props.getValue(key);
            if (val instanceof Boolean) {
                return val as Boolean;
            }
        } catch (e) {
        }
        return fallback;
    }

    //! Safe numeric property getter
    private function getNumProp(props as Application.Properties, key as String, fallback as Number) as Number {
        try {
            var val = props.getValue(key);
            if (val instanceof Number) {
                return val as Number;
            }
        } catch (e) {
        }
        return fallback;
    }
}
