import cv2
import time
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config

def check_focus_quality(frame):
    """
    Check the focus quality of a frame using Laplacian variance.
    Returns (is_focused, variance)
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    threshold = 100.0  # Configurable threshold
    return variance > threshold, variance

def get_microscope_device():
    """
    Attempt to find the microscope device index (usually /dev/video0 or /dev/video1).
    Returns (index, backend) or (None, None) if none found.
    """
    backends = [cv2.CAP_V4L2, cv2.CAP_ANY] if sys.platform.startswith('linux') else [cv2.CAP_ANY]
    for backend in backends:
        for index in range(4):
            try:
                cap = cv2.VideoCapture(index, backend)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                    time.sleep(0.2)
                    for _ in range(3):
                        ret, frame = cap.read()
                    if ret and frame is not None and frame.size > 0:
                        cap.release()
                        return index, backend
                    cap.release()
            except Exception:
                pass
    return None, None

def capture_image(output_dir=None, filename=None):
    """
    Capture a single frame from the microscope.
    Returns the file path of the captured image or None on failure.
    """
    device_index, backend = get_microscope_device()
    if device_index is None:
        print("Warning: No microscope device detected.")
        return None

    cap = cv2.VideoCapture(device_index, backend if backend is not None else cv2.CAP_ANY)
    
    # Configure USB UVC Camera parameters
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
    
    # Allow sensor auto-exposure to stabilize
    time.sleep(0.3)
    frame = None
    ret = False
    for _ in range(5):
        ret, frame = cap.read()
        if ret and frame is not None and frame.size > 0:
            break
        time.sleep(0.1)
        
    cap.release()
    
    if not ret or frame is None:
        print("Error: Could not read frame from microscope.")
        return None
        
    is_focused, variance = check_focus_quality(frame)
    if not is_focused:
        print(f"Warning: Image might be blurry (Laplacian variance: {variance:.2f})")
        
    if output_dir is None:
        output_dir = os.path.join(config.OUTPUTS_DIR, "field_results")
    
    os.makedirs(output_dir, exist_ok=True)
    
    if filename is None:
        filename = f"capture_{int(time.time())}.jpg"
        
    filepath = os.path.join(output_dir, filename)
    cv2.imwrite(filepath, frame)
    print(f"Image captured and saved to {filepath}")
    return filepath

def start_continuous_capture(interval_seconds=60, output_dir=None):
    """
    Continuously capture images at a configurable interval.
    """
    print(f"Starting continuous capture every {interval_seconds} seconds.")
    try:
        while True:
            capture_image(output_dir)
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        print("\nContinuous capture stopped.")

if __name__ == "__main__":
    print("Testing microscope capture...")
    capture_image()
