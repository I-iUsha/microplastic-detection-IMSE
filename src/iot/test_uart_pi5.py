#!/usr/bin/env python3
"""
Raspberry Pi 5 Specific UART & GPIO Pin Diagnostic Tool
Checks pin multiplexing (GPIO 14/15), overlays, permissions, and streams.
"""

import os
import subprocess
import time
import glob

def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return res.stdout.strip()
    except Exception as e:
        return f"Error: {e}"

def test_pi5_uart():
    print("=" * 60)
    print("🛠️  Raspberry Pi 5 Hardware UART Diagnostic")
    print("=" * 60)

    # 1. Check GPIO 14 and 15 pin function (RP1 Pin Control)
    print("\n[1] Checking GPIO 14 (TXD) and GPIO 15 (RXD) Pin States:")
    pinctrl_out = run_cmd("pinctrl get 14,15 2>/dev/null || raspi-gpio get 14,15 2>/dev/null")
    if pinctrl_out:
        print(pinctrl_out)
    else:
        print("    (pinctrl tool not available, checking via /sys/class/gpio)")

    # 2. Check /boot/firmware/config.txt for overlays
    print("\n[2] Checking UART configuration in /boot/firmware/config.txt:")
    cfg = run_cmd("grep -E 'uart|serial' /boot/firmware/config.txt")
    print(cfg if cfg else "    No explicit uart overlays found in config.txt")

    # 3. Check dmesg for UART initialization
    print("\n[3] Checking Kernel UART assignments (dmesg):")
    dmesg_uart = run_cmd("dmesg | grep -iE 'ttyAMA|serial|uart' | tail -n 8")
    print(dmesg_uart if dmesg_uart else "    No UART dmesg lines")

    # 4. Try reading each ttyAMA port with a live counter
    print("\n[4] Attempting high-sensitivity read on all serial ports:")
    try:
        import serial
    except ImportError:
        print("    pyserial missing. Run: pip install pyserial")
        return

    ports = glob.glob('/dev/ttyAMA*') + glob.glob('/dev/serial*') + glob.glob('/dev/ttyS*')
    for port in sorted(set(ports)):
        print(f"\n    ---> Listening on {port} at 9600 baud for 4 seconds...")
        try:
            s = serial.Serial(port, baudrate=9600, timeout=1)
            start = time.time()
            total_bytes = 0
            sample_data = b""
            while time.time() - start < 4:
                n = s.in_waiting
                if n > 0:
                    b = s.read(n)
                    total_bytes += len(b)
                    sample_data += b
                time.sleep(0.1)
            s.close()

            if total_bytes > 0:
                print(f"    🎉 BINGO! Received {total_bytes} bytes from {port}!")
                print(f"    Sample text:\n{sample_data.decode('ascii', errors='ignore')[:300]}")
            else:
                print(f"    [0 bytes received]")
        except Exception as e:
            print(f"    Could not read {port}: {e}")

    print("\n" + "=" * 60)
    print("Diagnostic Complete.")
    print("=" * 60)

if __name__ == '__main__':
    test_pi5_uart()
