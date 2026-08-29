import serial
import time
from datetime import datetime

def parse_nmea(sentence):
    """
    Parse a single NMEA sentence (GPGGA or GPRMC).
    Returns a dictionary of parsed data or None.
    """
    parts = sentence.split(',')
    
    if sentence.startswith('$GPGGA'):
        if len(parts) > 9 and parts[2] and parts[4]:
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
    ports = ['/dev/ttyS0', '/dev/ttyAMA0', 'COM3'] # Add COM3 for Windows testing fallback
    for port in ports:
        try:
            s = serial.Serial(port, baudrate=9600, timeout=1)
            s.close()
            return port
        except (serial.SerialException, FileNotFoundError):
            continue
    return None

def get_gps_location(mock=False):
    """
    Read GPS location from NEO-6M module.
    Returns a dict with lat, lon, alt, satellites, timestamp.
    """
    if mock:
        return {
            'lat': 37.7749,
            'lon': -122.4194,
            'altitude': 10.0,
            'satellites': 5,
            'timestamp': datetime.utcnow().isoformat()
        }

    port = get_serial_port()
    if not port:
        print("Warning: No GPS device detected on serial ports.")
        return None

    try:
        with serial.Serial(port, baudrate=9600, timeout=2) as ser:
            start_time = time.time()
            # Wait up to 5 seconds for a valid fix
            while time.time() - start_time < 5:
                line = ser.readline().decode('ascii', errors='ignore').strip()
                if line.startswith('$GPGGA'):
                    data = parse_nmea(line)
                    if data and data['quality'] > 0:
                        return {
                            'lat': data['lat'],
                            'lon': data['lon'],
                            'altitude': data['altitude'],
                            'satellites': data['satellites'],
                            'timestamp': datetime.utcnow().isoformat()
                        }
            print("Warning: GPS fix not acquired within timeout.")
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
