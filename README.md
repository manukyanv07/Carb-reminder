# CarbReminder - Garmin Connect IQ Data Field

A Garmin Connect IQ data field that reminds you to drink water and eat carbs during activities. It monitors your activity in real-time and sends vibration alerts to your wrist.

## Features

### Reminder Triggers
- **Time-based**: Configurable intervals for water (default: 20 min) and carb (default: 30 min) reminders
- **Calorie-based**: Alerts every N calories burned (default: 200 cal)
- **HR Zone-based**: Alerts when sustained in a high heart rate zone (default: Zone 4+ for 5 min)

### Vibration Patterns
- **Water**: 2 short pulses + lap tone
- **Carbs**: 3 longer pulses + high alert tone

### Display
- Shows countdown to next reminder during normal activity
- Full-screen colored alerts when triggered:
  - Blue: Water reminders
  - Orange: Carb reminders
  - Red: HR zone hydration alerts

## Settings (via Garmin Connect Mobile)

| Setting | Default | Range |
|---------|---------|-------|
| Time-Based Reminders | On | On/Off |
| Water Interval | 20 min | 5-120 min |
| Carb Interval | 30 min | 10-120 min |
| Calorie-Based Reminders | On | On/Off |
| Calorie Threshold | 200 cal | 50-1000 cal |
| HR Zone Reminders | On | On/Off |
| HR Zone Threshold | Zone 4 | Zone 3/4/5 |
| HR Zone Duration | 5 min | 1-30 min |
| Max Heart Rate | 185 bpm | 120-220 bpm |

## Supported Devices

- Forerunner: 245, 255, 265, 745, 955, 965
- Fenix: 7, 7S, 7X, 8
- Enduro, Enduro 2
- Venu: 2, 2S, 3, 3S, SQ2
- Edge: 540, 840, 1040
- Epix: 2, Pro (42/47/51mm)

## How to Use

1. Install the data field on your Garmin device via Connect IQ Store (or sideload)
2. Add "CarbReminder" as a data field to your activity profile
3. Configure settings in Garmin Connect Mobile app
4. Start an activity - reminders will fire automatically

## Building

### Prerequisites
- [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/) (4.x+)
- VS Code with [Monkey C Extension](https://marketplace.visualstudio.com/items?itemName=garmin.monkey-c)

### Build
```bash
# Using the Connect IQ SDK CLI
monkeyc -d fr265 -f monkey.jungle -o CarbReminder.prg -y developer_key.der
```

### Simulator
```bash
connectiq &
monkeydo CarbReminder.prg fr265
```

## Project Structure

```
source/
  CarbReminderApp.mc    # App entry point
  CarbReminderView.mc   # Data field view (display + compute)
  ReminderManager.mc    # All reminder trigger logic
  AlertHelper.mc        # Vibration and tone alerts
resources/
  settings/             # User-configurable properties
  strings/              # Localized strings
  drawables/            # Launcher icon
manifest.xml            # App manifest (devices, permissions)
monkey.jungle           # Build configuration
```

## License

MIT
