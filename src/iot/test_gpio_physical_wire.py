#!/usr/bin/env python3
"""
Physical Pin & Wire Continuity Test for Raspberry Pi 5 GPIO 14 (Pin 8) & GPIO 15 (Pin 10).
Tests whether the jumper wire is physically connected to the right pins.
"""

import os
import subprocess
import time

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()

def test_physical_wire():
    print("=" * 60)
    print("🔌 Raspberry Pi 5 Physical Pin & Wire Continuity Test")
    print("=" * 60)
    print("Testing if Pin 8 (GPIO 14) and Pin 10 (GPIO 15) have physical continuity...")

    # Step 1: Set GPIO 14 as OUTPUT, GPIO 15 as INPUT with pull-up
    run_cmd("pinctrl set 14 op")
    run_cmd("pinctrl set 15 ip pu")
    time.sleep(0.1)

    passed = True
    
    # Test 1: Drive GPIO 14 LOW (0V) -> GPIO 15 should read 0 (LOW)
    run_cmd("pinctrl set 14 dl")
    time.sleep(0.1)
    val_low = run_cmd("pinctrl get 15")
    print(f"\n[Test 1] Driven GPIO 14 LOW (0V):")
    print(f"         GPIO 15 reading -> {val_low}")
    if "lo" in val_low or "0" in val_low:
        print("         ✅ Low voltage detected!")
    else:
        print("         ❌ Failed: GPIO 15 did not detect LOW.")
        passed = False

    # Test 2: Drive GPIO 14 HIGH (3.3V) -> GPIO 15 should read 1 (HIGH)
    run_cmd("pinctrl set 14 dh")
    time.sleep(0.1)
    val_high = run_cmd("pinctrl get 15")
    print(f"\n[Test 2] Driven GPIO 14 HIGH (3.3V):")
    print(f"         GPIO 15 reading -> {val_high}")
    if "hi" in val_high or "1" in val_high:
        print("         ✅ High voltage detected!")
    else:
        print("         ❌ Failed: GPIO 15 did not detect HIGH.")
        passed = False

    # Restore pins to UART mode (a4)
    run_cmd("pinctrl set 14 a4")
    run_cmd("pinctrl set 15 a4 pu")

    print("\n" + "=" * 60)
    if passed:
        print("🎉 PHYSICAL WIRE TEST PASSED! The jumper wire is firmly connecting Pin 8 to Pin 10.")
    else:
        print("⚠️  PHYSICAL CONTINUITY FAILED:")
        print("    The jumper wire is not connecting Pin 8 and Pin 10, or the wire is plugged into the wrong pins.")
        print("    Double-check: Looking at outer row near USB-C:")
        print("    Pin 2 (5V), Pin 4 (5V), Pin 6 (GND), Pin 8 (4th pin), Pin 10 (5th pin).")
    print("=" * 60)

if __name__ == '__main__':
    test_physical_wire()
