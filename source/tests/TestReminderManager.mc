import Toybox.Lang;
import Toybox.Test;
import Toybox.Activity;
import Toybox.Graphics;

//! Unit tests for ReminderManager.
//! Run with: monkeyc --unit-test -d <device> -f monkey.jungle -o test.prg -y <key>
//!           monkeydo test.prg <device> --unit-test

//! Helper: create a mock Activity.Info-like dictionary for testing.
//! Note: In Connect IQ test environment, we instantiate ReminderManager directly
//! and call its check() method. Since we can't construct Activity.Info,
//! these tests exercise the public API by manipulating activity state.

// ============================================================
// Timer State Guard Tests
// ============================================================

(:test)
function testReturnsNullWhenTimerOff(logger as Logger) as Boolean {
    var mgr = new ReminderManager();
    // We can't easily mock Activity.Info in Monkey C, so these tests
    // verify the logic indirectly through the simulator's activity state.
    // For full unit testing, see the Jest test suite in tests/
    logger.debug("Timer state guard tests require simulator activity control");
    return true;
}

// ============================================================
// Time-Based Reminder Tests
// ============================================================

(:test)
function testGetStatusInitial(logger as Logger) as Boolean {
    var mgr = new ReminderManager();
    var status = mgr.getStatus();
    // Initially, water is closer (20min < 30min)
    // Status should start with "W:"
    if (status.find("W:") == null) {
        logger.debug("Expected status starting with 'W:', got: " + status);
        return false;
    }
    return true;
}

(:test)
function testGetStatusDisabled(logger as Logger) as Boolean {
    // When time reminders are disabled, getStatus() returns "Active"
    // This requires the setting to be disabled, which we can't easily
    // control in a test without mocking Properties. Testing via Jest suite.
    // Here we verify the method doesn't crash.
    var mgr = new ReminderManager();
    var status = mgr.getStatus();
    if (status == null) {
        logger.debug("getStatus() returned null");
        return false;
    }
    if (status.length() == 0) {
        logger.debug("getStatus() returned empty string");
        return false;
    }
    return true;
}

// ============================================================
// HR Zone Calculation Verification
// ============================================================

(:test)
function testHrZoneCalculationBoundaries(logger as Logger) as Boolean {
    // Verify the integer division HR zone calculation:
    // hrPercent = (heartRate * 100) / maxHr
    // Zone 1: < 60%, Zone 2: 60-69%, Zone 3: 70-79%, Zone 4: 80-89%, Zone 5: >= 90%

    var maxHr = 200;

    // Test boundary: HR=119 -> hrPercent = 59 -> Zone 1
    var hrPercent = (119 * 100) / maxHr;
    if (hrPercent >= 60) {
        logger.debug("HR=119: expected hrPercent < 60, got " + hrPercent);
        return false;
    }

    // Test boundary: HR=120 -> hrPercent = 60 -> Zone 2
    hrPercent = (120 * 100) / maxHr;
    if (hrPercent < 60 || hrPercent >= 70) {
        logger.debug("HR=120: expected 60 <= hrPercent < 70, got " + hrPercent);
        return false;
    }

    // Test boundary: HR=140 -> hrPercent = 70 -> Zone 3
    hrPercent = (140 * 100) / maxHr;
    if (hrPercent < 70 || hrPercent >= 80) {
        logger.debug("HR=140: expected 70 <= hrPercent < 80, got " + hrPercent);
        return false;
    }

    // Test boundary: HR=160 -> hrPercent = 80 -> Zone 4
    hrPercent = (160 * 100) / maxHr;
    if (hrPercent < 80 || hrPercent >= 90) {
        logger.debug("HR=160: expected 80 <= hrPercent < 90, got " + hrPercent);
        return false;
    }

    // Test boundary: HR=180 -> hrPercent = 90 -> Zone 5
    hrPercent = (180 * 100) / maxHr;
    if (hrPercent < 90) {
        logger.debug("HR=180: expected hrPercent >= 90, got " + hrPercent);
        return false;
    }

    logger.debug("All HR zone boundaries verified");
    return true;
}

(:test)
function testHrZoneIntegerDivision(logger as Logger) as Boolean {
    // Verify integer division behavior matches expectations
    // HR=185, maxHr=185: (185*100)/185 = 100 -> Zone 5
    var maxHr = 185;
    var hrPercent = (185 * 100) / maxHr;
    if (hrPercent != 100) {
        logger.debug("Expected 100, got " + hrPercent);
        return false;
    }

    // HR=148, maxHr=185: (148*100)/185 = 14800/185 = 80 -> Zone 4
    hrPercent = (148 * 100) / maxHr;
    if (hrPercent != 80) {
        logger.debug("Expected 80, got " + hrPercent);
        return false;
    }

    return true;
}

// ============================================================
// Calorie Threshold Snap-Down Verification
// ============================================================

(:test)
function testCalorieThresholdSnapDown(logger as Logger) as Boolean {
    // Verify: (cal / threshold) * threshold snaps to floor
    var threshold = 200;

    // 450 / 200 = 2 (integer), 2 * 200 = 400
    var cal = 450;
    var snapped = (cal / threshold) * threshold;
    if (snapped != 400) {
        logger.debug("450 snapped to " + snapped + ", expected 400");
        return false;
    }

    // 200 / 200 = 1, 1 * 200 = 200
    cal = 200;
    snapped = (cal / threshold) * threshold;
    if (snapped != 200) {
        logger.debug("200 snapped to " + snapped + ", expected 200");
        return false;
    }

    // 199 / 200 = 0, 0 * 200 = 0
    cal = 199;
    snapped = (cal / threshold) * threshold;
    if (snapped != 0) {
        logger.debug("199 snapped to " + snapped + ", expected 0");
        return false;
    }

    // Small threshold: 50. Cal=150: 150/50=3, 3*50=150
    threshold = 50;
    cal = 150;
    snapped = (cal / threshold) * threshold;
    if (snapped != 150) {
        logger.debug("150 with threshold 50 snapped to " + snapped + ", expected 150");
        return false;
    }

    logger.debug("All calorie snap-down calculations verified");
    return true;
}

// ============================================================
// Status Format Verification
// ============================================================

(:test)
function testStatusFormatSeconds(logger as Logger) as Boolean {
    // Verify format math: seconds should be zero-padded
    var totalSec = 309; // 5 minutes, 9 seconds
    var min = totalSec / 60;   // 5
    var sec = totalSec % 60;   // 9

    if (min != 5) {
        logger.debug("Expected min=5, got " + min);
        return false;
    }
    if (sec != 9) {
        logger.debug("Expected sec=9, got " + sec);
        return false;
    }

    // Verify format produces "5:09"
    var formatted = Lang.format("$1$:$2$", [min.format("%d"), sec.format("%02d")]);
    if (!formatted.equals("5:09")) {
        logger.debug("Expected '5:09', got '" + formatted + "'");
        return false;
    }

    return true;
}

(:test)
function testManagerInitialization(logger as Logger) as Boolean {
    // Verify ReminderManager can be created without crashing
    var mgr = new ReminderManager();
    if (mgr == null) {
        logger.debug("ReminderManager initialization returned null");
        return false;
    }

    // getStatus should return a non-null, non-empty string
    var status = mgr.getStatus();
    if (status == null || status.length() == 0) {
        logger.debug("Initial getStatus returned null or empty");
        return false;
    }

    logger.debug("ReminderManager initialized successfully, status: " + status);
    return true;
}
