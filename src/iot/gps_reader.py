try:
    import serial
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

import time
from datetime import datetime, timezone

def parse_nmea(sentence):
    """
    Parse a single NMEA sentence (GPGGA, GNGGA, GPRMC, GNRMC).
    Returns a dictionary of parsed data or None.
    """
    if not sentence or not isinstance(sentence, str):
        return None
    sentence = sentence.strip()
    parts = sentence.split(',')
    
    # Check for GGA (Fix data: Lat, Lon, Altitude, Satellites)
    if sentence.startswith('$GPGGA') or sentence.startswith('$GNGGA'):
        if len(parts) > 9 and parts[2] and parts[4]:
            try:
                lat = convert_to_degrees(parts[2], parts[3])
                lon = convert_to_degrees(parts[4], parts[5])
                quality = int(parts[6]) if parts[6] else 0
                satellites = int(parts[7]) if parts[7] else 0
                alt = float(parts[9]) if parts[9] else 0.0
                
                return {
                    'type': 'GGA',
                    'lat': lat,
                    'lon': lon,
                    'altitude': alt,
                    'quality': quality,
                    'satellites': satellites
                }
            except Exception:
                pass
    return None

def convert_to_degrees(raw_value, direction):
    """
    Convert raw NMEA coordinate (e.g. 4807.038) to decimal degrees.
    """
    if not raw_value:
        return 0.0
        
    dot_idx = raw_value.find('.')
    degrees = float(raw_value[:dot_idx-2])
    minutes = float(raw_value[dot_idx-2:])
    
    decimal = degrees + (minutes / 60)
    if direction in ['S', 'W']:
        decimal = -decimal
        
    return decimal

def get_serial_port():
    """Auto-detect serial port for GPS on Pi."""
    if not HAS_SERIAL:
        return None
    # /dev/serial0 is the primary alias on Raspberry Pi 5
    ports = ['/dev/serial0', '/dev/ttyAMA0', '/dev/ttyAMA10', '/dev/ttyS0', 'COM3']
    for port in ports:
        try:
            s = serial.Serial(port, baudrate=9600, timeout=0.5)
            s.close()
            return port
        except Exception:
            continue
    return None

def get_gps_location(mock=False):
    """
    Read GPS location from NEO-6M module.
    Returns a dict with lat, lon, alt, satellites, timestamp.
    """
    if mock:
        return {
            'lat': 17.3850,
            'lon': 78.4867,
            'altitude': 542.0,
            'satellites': 8,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

    port = get_serial_port()
    if not port:
        print("Warning: No GPS device detected on serial ports.")
        return None

    try:
        with serial.Serial(port, baudrate=9600, timeout=2) as ser:
            start_time = time.time()
            # Wait up to 6 seconds for a valid fix
            while time.time() - start_time < 6:
                line = ser.readline().decode('ascii', errors='ignore').strip()
                if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                    data = parse_nmea(line)
                    if data and data['quality'] > 0:
                        return {
                            'lat': data['lat'],
                            'lon': data['lon'],
                            'altitude': data['altitude'],
                            'satellites': data['satellites'],
                            'timestamp': datetime.now(timezone.utc).isoformat()
                        }
            print("Warning: GPS fix not acquired within timeout (antenna may need open sky).")
            return None
    except Exception as e:
        print(f"Error reading GPS: {e}")
        return None

if __name__ == "__main__":
    print("Testing GPS module...")
    loc = get_gps_location(mock=False)
    if not loc:
        print("Falling back to mock mode...")
        loc = get_gps_location(mock=True)
    print(f"Location: {loc}")
