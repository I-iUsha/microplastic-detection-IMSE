#!/usr/bin/env python3
"""
Inspect available Pi 5 device tree overlays and configure the correct RP1 UART overlay.
"""

import os
import subprocess
import glob

def check_and_fix_pi5_uart():
    print("=" * 60)
    print("🔍 Raspberry Pi 5 Device Tree Overlay Checker")
    print("=" * 60)

    # List all uart overlays in /boot/firmware/overlays/
    overlays = glob.glob('/boot/firmware/overlays/*uart*') + glob.glob('/boot/overlays/*uart*')
    print(f"\n[1] Available UART overlays in firmware ({len(overlays)} found):")
    for o in sorted(overlays):
        print(f"    - {os.path.basename(o)}")

    # Check current /boot/firmware/config.txt
    print("\n[2] Current /boot/firmware/config.txt UART entries:")
    with open('/boot/firmware/config.txt', 'r') as f:
        for line in f:
            if 'uart' in line or 'serial' in line:
                print(f"    {line.strip()}")

    # Check what UART devices are registered under /sys/class/tty/
    print("\n[3] Registered TTY devices in /sys/class/tty/:")
    ttys = glob.glob('/sys/class/tty/ttyAMA*') + glob.glob('/sys/class/tty/ttyS*')
    for t in ttys:
        dev_name = os.path.basename(t)
        driver = "unknown"
        driver_link = os.path.join(t, 'device', 'driver')
        if os.path.exists(driver_link):
            driver = os.path.basename(os.readlink(driver_link))
        print(f"    - {dev_name} (Driver: {driver})")

    print("\n" + "=" * 60)

if __name__ == '__main__':
    check_and_fix_pi5_uart()
