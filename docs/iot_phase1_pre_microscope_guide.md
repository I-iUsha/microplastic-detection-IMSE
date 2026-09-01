# 🔌 IoT Integration Guide (Phase 1: Pre-Microscope Setup)
## Raspberry Pi 5 + NEO-6M GPS + AI Models Verification

> **Goal**: Complete 100% of the software setup, model transfers, GPS wiring, and pipeline testing right now on your laptop and Raspberry Pi 5. When your microscope is delivered, all you do is plug it into the USB port.

---

## 📋 Progress Status

| Item | Status |
| :--- | :---: |
| **SanDisk 64 GB microSD Flashed (Pi OS 64-bit)** | ✅ Complete |
| **Headless SSH Connected (`ssh pi@192.168.1.24`)** | ✅ Complete |
| **GitHub Repo Cloned (`microplastic-detection-IMSE`)** | ✅ Complete |
| **Automated Setup Script (`pi_setup.sh`)** | ✅ Complete |
| **Model Weights (`.pth` files) Transferred** | 🔄 Next (Step 1) |
| **NEO-6M GPS Module Wired** | 🔄 Next (Step 2) |
| **GPS Satellite Data Verified** | 🔄 Next (Step 3) |
| **Diagnostic Self-Test & Mock Pipeline** | 🔄 Next (Step 4) |

---

## STEP 1: Transfer Model Weights from Laptop to Pi (via WiFi)

GitHub excludes heavy `.pth` segmentation model checkpoints. Transfer them from your laptop to the Pi with one command:

1. Open a **NEW PowerShell window on your Laptop** (keep your Pi SSH terminal open in the other window).
2. Run this command:
   ```powershell
   scp c:\Users\ADMIN\Desktop\major\outputs\models\*.pth pi@192.168.1.24:~/microplastic-detection-IMSE/outputs/models/
   ```
3. Type your Pi password when prompted.
4. **Verify on the Pi**: In your Pi SSH terminal, run:
   ```bash
   ls -lh ~/microplastic-detection-IMSE/outputs/models/
   ```
   You should see:
   * `UNet_best.pth` (~93 MB)
   * `DeepLabV3Plus_best.pth` (~86 MB)
   * `LinkNet_best.pth` (~83 MB)

---

## STEP 2: Wire the NEO-6M GPS Module to Pi 5

> ⚠️ **Safety First**: Turn off power to the Pi by running `sudo shutdown now` in the terminal, wait for the green LED to turn off, and unplug the Lenovo USB-C charger before touching GPIO pins.

Connect the 4 jumper wires between the NEO-6M GPS and the Raspberry Pi 5 40-pin header:

```
 NEO-6M GPS Module                      Raspberry Pi 5 GPIO Header
┌─────────────────┐                    ┌────────────────────────────┐
│      [VCC]──────┼──(Red Wire)───────►│ Pin 2  (5V Power)          │
│      [GND]──────┼──(Black Wire)─────►│ Pin 6  (Ground)            │
│      [TX]───────┼──(Green Wire)─────►│ Pin 10 (GPIO 15 / RXD0)    │
│      [RX]───────┼──(Yellow Wire)────►│ Pin 8  (GPIO 14 / TXD0)    │
└─────────────────┘                    └────────────────────────────┘
```

### Physical Pin Locator (Outer Row of Pi Pins):
```
[Corner near USB-C]
Pin 2  (5V)    ◄── Red Wire (VCC)
Pin 4  (5V)
Pin 6  (GND)   ◄── Black Wire (GND)
Pin 8  (TXD0)  ◄── Yellow Wire (RX)
Pin 10 (RXD0)  ◄── Green Wire (TX)
... rest of pins ...
```

---

## STEP 3: Boot Up & Test the GPS Module

1. Plug the Lenovo USB-C power charger back in.
2. Wait 60 seconds, then reconnect via SSH from your laptop:
   ```powershell
   ssh pi@192.168.1.24
   ```
3. **Check raw GPS serial stream**:
   ```bash
   cat /dev/serial0
   ```
   * You will see raw GPS satellite sentences streaming on your screen (`$GPRMC`, `$GPGGA`).
   * Press `Ctrl + C` to stop.
   * *(Note: If testing near an open window, the tiny LED on the GPS board will blink once a 3D satellite lock is acquired).*

4. **Test the Python GPS Parser**:
   ```bash
   cd ~/microplastic-detection-IMSE
   source venv/bin/activate
   python src/iot/gps_reader.py
   ```
   * It will output your exact latitude, longitude, and satellite count!

---

## STEP 4: Run Diagnostic Self-Test

Run the complete diagnostic tool to verify that all PyTorch models, LightGBM IMSE, RAM, and GPS are functioning:

```bash
cd ~/microplastic-detection-IMSE
source venv/bin/activate
python src/iot/hardware_test.py
```

### Expected Diagnostic Output:
* ✅ System RAM & CPU: Healthy (4 GB Raspberry Pi 5 detected)
* ✅ PyTorch & LightGBM: Initialized
* ✅ Models: UNet, DeepLabV3+, LinkNet weights verified
* ✅ GPS Port: `/dev/serial0` Active & Streaming

---

## STEP 5: Run Mock End-to-End Pipeline Simulation

You can test the entire pipeline (GPS tagging ➔ Model Selection ➔ Segmentation ➔ Report Generation ➔ Dashboard Update) right now using a sample image:

```bash
cd ~/microplastic-detection-IMSE
source venv/bin/activate
python src/iot/edge_pipeline.py
```

### What Happens:
1. Simulates an image capture using a built-in test sample.
2. Reads your real NEO-6M GPS coordinates.
3. IMSE LightGBM automatically selects the best segmentation model.
4. Segments the microplastic particles.
5. Saves an assessment report to `outputs/reports/` and a summary JSON to `outputs/field_results/`.
6. Live updates your dashboard map!

---

## 🔬 When Your Microscope Arrives Later (2-Step Final Plug-in):
1. Plug the microscope's USB-A cable into any blue USB port on the Pi 5.
2. Run `python src/iot/edge_pipeline.py` without mock mode — it will capture directly from the microscope lens and analyze in real time!
