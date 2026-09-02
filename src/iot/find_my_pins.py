#!/usr/bin/env python3
"""
Pin Locator Tool: Scans all 40 GPIO pins to detect where the jumper wire is plugged in!
"""

import subprocess
import time

def run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()

def find_connected_pins():
    print("=" * 65)
    print("🔍 Automated Pin Locator: Finding where your wire is plugged...")
    print("=" * 65)

    # Valid GPIO numbers on Pi 5 (RP1)
    all_gpios = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
    
    # Map GPIO to Physical Pin number
    gpio_to_pin = {
        0: 27, 1: 28, 2: 3, 3: 5, 4: 7, 5: 29, 6: 31, 7: 26, 8: 24, 9: 21,
        10: 19, 11: 23, 12: 32, 13: 33, 14: 8, 15: 10, 16: 36, 17: 11, 18: 12,
        19: 35, 20: 38, 21: 40, 22: 15, 23: 16, 24: 18, 25: 22, 26: 37, 27: 13
    }

    # Set all GPIOs as input with pull-up
    for g in all_gpios:
        run(f"pinctrl set {g} ip pu")
    time.sleep(0.1)

    found_pair = None

    # Test each GPIO by driving it LOW and seeing which other pin goes LOW
    for g_out in all_gpios:
        run(f"pinctrl set {g_out} op dl")
        time.sleep(0.02)
        
        for g_in in all_gpios:
            if g_in != g_out:
                val = run(f"pinctrl get {g_in}")
                if "lo" in val:
                    p1 = gpio_to_pin.get(g_out, f"GPIO{g_out}")
                    p2 = gpio_to_pin.get(g_in, f"GPIO{g_in}")
                    found_pair = (p1, p2, g_out, g_in)
                    break
        
        # Reset back to input
        run(f"pinctrl set {g_out} ip pu")
        if found_pair:
            break

    print("\n" + "=" * 65)
    if found_pair:
        p1, p2, g1, g2 = found_pair
        print(f"🎉 WIRE DETECTED! Your jumper wire is currently plugged into:")
        print(f"   👉 Pin {p1} (GPIO {g1})  <--->  Pin {p2} (GPIO {g2})")
        print("=" * 65)
        if (p1 == 8 and p2 == 10) or (p1 == 10 and p2 == 8):
            print("✅ Exactly on Pin 8 and Pin 10!")
        else:
            print(f"ℹ️  To fix: Move the wire from Pin {p1} & Pin {p2} to Pin 8 & Pin 10.")
    else:
        print("❌ No connection detected between any GPIO pins.")
        print("Reasons:")
        print("1. One or both ends are plugged into Ground / Power pins (Pins 1, 2, 4, 6, 9, 14, 20, 25, 30, 34, 39).")
        print("2. The jumper wire itself has an internal break (try a different jumper wire).")
    print("=" * 65)

if __name__ == '__main__':
    find_connected_pins()
