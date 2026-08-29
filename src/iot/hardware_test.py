import os
import sys
import psutil
import torch
from .microscope import get_microscope_device, capture_image
from .gps_reader import get_serial_port, get_gps_location

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config

def generate_hardware_report():
    report_lines = []
    report_lines.append("=== Hardware Diagnostic Report ===")
    
    # OS & System Info
    report_lines.append("\n[System Info]")
    report_lines.append(f"OS: {sys.platform}")
    
    # CPU
    cpu_percent = psutil.cpu_percent(interval=1)
    report_lines.append(f"CPU Usage: {cpu_percent}%")
    
    # RAM
    ram = psutil.virtual_memory()
    report_lines.append(f"Total RAM: {ram.total / (1024**3):.2f} GB")
    report_lines.append(f"Available RAM: {ram.available / (1024**3):.2f} GB")
    
    # Storage
    disk = psutil.disk_usage('/')
    report_lines.append(f"Total Storage: {disk.total / (1024**3):.2f} GB")
    report_lines.append(f"Free Storage: {disk.free / (1024**3):.2f} GB")
    
    # Test Microscope
    report_lines.append("\n[Microscope Test]")
    cam_idx = get_microscope_device()
    if cam_idx is not None:
        report_lines.append(f"Microscope detected at index {cam_idx}")
        img_path = capture_image(filename="test_capture.jpg")
        if img_path:
            report_lines.append("Capture Test: SUCCESS")
        else:
            report_lines.append("Capture Test: FAILED (Could not read frame)")
    else:
        report_lines.append("Microscope: NOT DETECTED")

    # Test GPS
    report_lines.append("\n[GPS Test]")
    serial_port = get_serial_port()
    if serial_port:
        report_lines.append(f"GPS Serial Port detected at {serial_port}")
        loc = get_gps_location()
        if loc:
            report_lines.append(f"GPS Fix Test: SUCCESS ({loc['satellites']} satellites)")
            report_lines.append(f"Location: {loc['lat']}, {loc['lon']}")
        else:
            report_lines.append("GPS Fix Test: FAILED (No fix or timeout)")
    else:
        report_lines.append("GPS: NOT DETECTED")

    # Test Model Loading
    report_lines.append("\n[Model Loading Test]")
    if ram.total < 4 * (1024**3) - (500*1024**2): # roughly < 3.5GB
        report_lines.append("Warning: System RAM is low. Model loading might fail.")
    else:
        report_lines.append("System RAM sufficient for 4GB Pi 5 requirement.")
        
    # Check model files existence
    for model_name in config.MODEL_NAMES:
        path = os.path.join(config.MODELS_DIR, f"{model_name}_best.pth")
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / (1024**2)
            report_lines.append(f"Found {model_name} checkpoint ({size_mb:.2f} MB)")
        else:
            report_lines.append(f"Missing {model_name} checkpoint at {path}")
            
    report_content = "\n".join(report_lines)
    print(report_content)
    
    with open("hardware_report.txt", "w") as f:
        f.write(report_content)
    print("\nSaved report to hardware_report.txt")

if __name__ == "__main__":
    generate_hardware_report()
