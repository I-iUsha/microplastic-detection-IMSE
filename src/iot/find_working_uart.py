#!/usr/bin/env python3
"""
Comprehensive Pi 5 Loopback Scanner across all physical & virtual UARTs.
"""

import os
import glob
import time
import serial

def test_all_loopback():
    print("=" * 65)
    print("🔄 Raspberry Pi 5 Comprehensive UART Loopback Tester")
    print("=" * 65)
    print("Connecting Pin 8 (TX) directly to Pin 10 (RX)...")

    # Ensure GPIO 14 and 15 are set to UART function (a4) on RP1
    os.system("pinctrl set 14,15 a4 2>/dev/null")

    ports = sorted(set(glob.glob('/dev/ttyAMA*') + glob.glob('/dev/serial*') + glob.glob('/dev/ttyS*')))
    print(f"\nScanning ports: {ports}\n")

    test_message = b"GPS_OK_123\n"
    success_port = None

    for port in ports:
        try:
            # Configure port cleanly
            ser = serial.Serial(
                port=port,
                baudrate=9600,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1,
                rtscts=False,
                dsrdtr=False,
                xonxoff=False
            )
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            
            # Write test message
            ser.write(test_message)
            ser.flush()
            time.sleep(0.15)
            
            # Read back
            received = ser.read(len(test_message))
            ser.close()

            if test_message in received or b"GPS_OK" in received:
                print(f"🎉 FOUND WORKING PORT! [{port}] loopback PASSED: {received}")
                success_port = port
                break
            else:
                print(f"  [{port}]: wrote 11 bytes, received {len(received)} bytes (echo: {received})")
        except Exception as e:
            print(f"  [{port}]: Error - {e}")

    print("\n" + "=" * 65)
    if success_port:
        print(f"✅ The active hardware port on Pi 5 GPIO pins 8 & 10 is: {success_port}")
    else:
        print("ℹ️  No loopback echo yet. Checking pin configuration...")
        os.system("pinctrl get 14,15 2>/dev/null")
    print("=" * 65)

if __name__ == '__main__':
    test_all_loopback()
