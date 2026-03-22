import Toybox.WatchUi;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Activity;
import Toybox.Application;
import Toybox.Time;

//! Data field view that displays reminder status and triggers alerts.
class CarbReminderView extends WatchUi.DataField {

    private var _reminderManager as ReminderManager;
    private var _lastMessage as String = "FUEL UP";
    private var _messageColor as Number = Graphics.COLOR_WHITE;
    private var _showAlert as Boolean = false;
    private var _alertCountdown as Number = 0;

    // Alert display duration in compute cycles (~1 second each)
    private const ALERT_DISPLAY_CYCLES = 5;

    function initialize() {
        DataField.initialize();
        _reminderManager = new ReminderManager();
    }

    //! Called when the data field layout is set
    function onLayout(dc as Dc) as Void {
    }

    //! Called once per second during an activity. This is where we check triggers.
    function compute(info as Activity.Info) as Void {
        var alert = _reminderManager.check(info);

        if (alert != null) {
            _lastMessage = alert[:message] as String;
            _messageColor = alert[:color] as Number;
            _showAlert = true;
            _alertCountdown = ALERT_DISPLAY_CYCLES;

            // Trigger vibration
            AlertHelper.vibrate(alert[:type] as Symbol);
        }

        // Count down the alert display
        if (_alertCountdown > 0) {
            _alertCountdown--;
            if (_alertCountdown == 0) {
                _showAlert = false;
            }
        }
    }

    //! Render the data field
    function onUpdate(dc as Dc) as Void {
        var bgColor = getBackgroundColor();
        var fgColor = (bgColor == Graphics.COLOR_BLACK) ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;

        dc.setColor(bgColor, bgColor);
        dc.clear();

        var width = dc.getWidth();
        var height = dc.getHeight();
        var centerX = width / 2;
        var centerY = height / 2;

        if (_showAlert) {
            // Alert mode: show big colored message
            dc.setColor(_messageColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY - 12, Graphics.FONT_MEDIUM, _lastMessage, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            // Normal mode: show next reminder info
            var status = _reminderManager.getStatus();

            // Label
            dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY - 20, Graphics.FONT_XTINY, "FUEL UP", Graphics.TEXT_JUSTIFY_CENTER);

            // Time until next reminder
            dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 4, Graphics.FONT_SMALL, status, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}
