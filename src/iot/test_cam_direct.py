import cv2
import glob
import subprocess
import os

print("=== Direct Camera Diagnostic ===")
video_devices = sorted(glob.glob("/dev/video*"))
print(f"Available video devices in /dev: {video_devices}")

try:
    v4l2_out = subprocess.check_output(["v4l2-ctl", "--list-devices"], stderr=subprocess.STDOUT).decode()
    print("\nv4l2-ctl list devices:\n", v4l2_out)
except Exception as e:
    print(f"v4l2-ctl not available or error: {e}")

print("\nTesting VideoCapture on indices 0-7:")
for idx in range(8):
    for backend, name in [(cv2.CAP_V4L2, "CAP_V4L2"), (cv2.CAP_ANY, "CAP_ANY")]:
        cap = cv2.VideoCapture(idx, backend)
        opened = cap.isOpened()
        if opened:
            ret, frame = cap.read()
            cap.release()
            print(f"Index {idx} ({name}): isOpened=True, read_success={ret}, frame={frame.shape if frame is not None else None}")
            if ret and frame is not None:
                save_path = f"test_capture_idx_{idx}.jpg"
                cv2.imwrite(save_path, frame)
                print(f"  --> SUCCESSFULLY saved test frame to {save_path}!")
        else:
            cap.release()
