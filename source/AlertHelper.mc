import Toybox.Lang;
import Toybox.Attention;

//! Helper module for triggering vibration alerts on the watch.
module AlertHelper {

    //! Trigger a vibration pattern based on alert type.
    //! :water = 2 short pulses, :carb = 3 longer pulses
    function vibrate(type as Symbol) as Void {
        if (!(Toybox has :Attention) || !(Attention has :vibrate)) {
            return;
        }

        var vibeProfile;

        if (type == :water) {
            // 2 short pulses for water
            vibeProfile = [
                new Attention.VibeProfile(50, 200),
                new Attention.VibeProfile(0, 150),
                new Attention.VibeProfile(50, 200)
            ] as Array<Attention.VibeProfile>;
        } else {
            // 3 longer pulses for carbs
            vibeProfile = [
                new Attention.VibeProfile(75, 300),
                new Attention.VibeProfile(0, 150),
                new Attention.VibeProfile(75, 300),
                new Attention.VibeProfile(0, 150),
                new Attention.VibeProfile(75, 300)
            ] as Array<Attention.VibeProfile>;
        }

        Attention.vibrate(vibeProfile);

        // Also play a tone if available
        if (Attention has :playTone) {
            if (type == :water) {
                Attention.playTone(Attention.TONE_LAP);
            } else {
                Attention.playTone(Attention.TONE_ALERT_HI);
            }
        }
    }
}
