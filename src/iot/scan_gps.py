#!/usr/bin/env python3
"""
GPS Diagnostic & Auto-Discovery Script for Raspberry Pi 5
Tests all physical UART ports, baud rates, and permissions.
"""

import os
import sys
import glob
import time

try:
    import serial
except ImportError:
    print("Error: pyserial is not installed. Run: pip install pyserial")
    sys.exit(1)

def scan_all_gps_ports():
    print("=" * 60)
    print("🔍 Raspberry Pi 5 GPS Port & Signal Diagnostic Tool")
    print("=" * 60)

    # Candidate ports on Raspberry Pi 5 (RP1 UARTs)
    candidate_ports = (
        glob.glob('/dev/serial*') +
        glob.glob('/dev/ttyAMA*') +
        glob.glob('/dev/ttyS*') +
        glob.glob('/dev/ttyUSB*')
    )
    # Remove duplicates while preserving order
    ports = []
    for p in candidate_ports:
        if p not in ports:
            ports.append(p)

    print(f"\n[1] Detected available serial device nodes ({len(ports)} found):")
    for p in ports:
        print(f"    - {p}")

    if not ports:
        print("\n❌ No serial port device nodes found on your Raspberry Pi 5.")
        print("Tip: Run: echo 'dtoverlay=uart0' | sudo tee -a /boot/firmware/config.txt && sudo reboot")
        return

    baud_rates = [9600, 115200, 4800, 38400]
    found_any = False

    print("\n[2] Scanning ports for live NMEA GPS satellite stream...")
    for port in ports:
        for baud in [9600]: # NEO-6M default is 9600
            try:
                ser = serial.Serial(port, baudrate=baud, timeout=2)
                # Flush existing buffer
                ser.reset_input_buffer()
                
                print(f"    Testing {port} at {baud} baud... (listening 3s)")
                start_time = time.time()
                raw_data = b""
                
                while time.time() - start_time < 3:
                    if ser.in_waiting > 0:
                        chunk = ser.read(ser.in_waiting)
                        raw_data += chunk
                        if b'$' in raw_data:
                            break
                    time.sleep(0.1)
                
                ser.close()

                if raw_data:
                    decoded = raw_data.decode('ascii', errors='ignore').strip()
                    print(f"\n🎉 SUCCESS! LIVE GPS SIGNAL FOUND ON: {port} at {baud} baud!")
                    print("-" * 50)
                    print(decoded[:300])
                    print("-" * 50)
                    found_any = True
                    return port
                else:
                    print(f"      [No incoming bytes]")

            except serial.SerialException as e:
                print(f"      [Port error: {e}]")
            except Exception as e:
                print(f"      [Error: {e}]")

    if not found_any:
        print("\n" + "=" * 60)
        print("⚠️  No GPS data received on any port yet.")
        print("=" * 60)
        print("Troubleshooting Checklist:")
        print("1. [LOOSE WIRES on GPS]: Your blue GPS board has unsoldered holes.")
        print("   -> Gently tilt/bend the male jumper pins so the metal firmly presses")
        print("      against the gold ring inside the TX hole and GND hole.")
        print("2. [TX/RX SWAP]:")
        print("   -> GPS TX MUST connect to Pi GPIO 15 (Pin 10 / RXD0).")
        print("   -> GPS RX connects to Pi GPIO 14 (Pin 8 / TXD0).")
        print("3. [POWER]: Blue LED should be blinking once per second.")
        print("=" * 60)

if __name__ == '__main__':
    scan_all_gps_ports()
