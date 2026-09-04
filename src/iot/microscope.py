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
    Return verified microscope device index 0 with V4L2 backend.
    """
    backend = cv2.CAP_V4L2 if sys.platform.startswith('linux') else cv2.CAP_ANY
    return 0, backend

def capture_image(output_dir=None, filename=None):
    """
    Capture a single frame from the microscope.
    Returns the file path of the captured image or None on failure.
    """
    backend = cv2.CAP_V4L2 if sys.platform.startswith('linux') else cv2.CAP_ANY
    cap = cv2.VideoCapture(0, backend)
    
    if not cap.isOpened():
        cap.release()
        cap = cv2.VideoCapture(0)
        
    if not cap.isOpened():
        print("Error: Could not open microscope device at index 0.")
        return None

    # Read frame with sensor stabilization
    frame = None
    for _ in range(5):
        ret, test_frame = cap.read()
        if ret and test_frame is not None and test_frame.size > 0:
            frame = test_frame
            break
        time.sleep(0.05)
        
    cap.release()

    if frame is None:
        print("Error: Could not read frame from microscope.")
        return None
        
    is_focused, variance = check_focus_quality(frame)
    if not is_focused:
        print(f"Warning: Image might be blurry (Laplacian variance: {variance:.2f})")
    else:
        print(f"Focus quality check: SHARP (Laplacian variance: {variance:.2f})")
        
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
