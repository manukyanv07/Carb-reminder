import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Main application class for CarbReminder data field.
//! Runs during activities and sends vibration alerts for hydration and fueling.
class CarbReminderApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    //! Return the initial view for the data field
    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [new CarbReminderView()];
    }

    //! Called when settings are changed via Garmin Connect Mobile
    function onSettingsChanged() as Void {
        WatchUi.requestUpdate();
    }
}
