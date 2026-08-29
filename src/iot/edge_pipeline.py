import os
import sys
import json
import time
import cv2
from datetime import datetime

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config
from src.inference import run_inference
from src.decision_support import generate_report # Assuming this exists or similar logic is needed

from .microscope import capture_image
from .gps_reader import get_gps_location

def process_capture(mock_hardware=False):
    """
    Complete edge deployment pipeline for a single capture:
    1. Captures image
    2. Reads GPS
    3. Runs inference
    4. Generates report
    5. Saves results
    """
    timestamp = int(time.time())
    dt_str = datetime.utcnow().isoformat().replace(':', '-')
    
    out_dir = os.path.join(config.OUTPUTS_DIR, "field_results")
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Capture Image
    img_filename = f"capture_{dt_str}.jpg"
    img_path = None
    if not mock_hardware:
        img_path = capture_image(output_dir=out_dir, filename=img_filename)
        
    if img_path is None:
        print("Hardware capture failed or mocked. Using dummy image if available.")
        # Fallback for testing
        test_img = os.path.join(config.TRAIN_DIR, "sample.jpg") # Example fallback
        if os.path.exists(test_img):
            img_path = os.path.join(out_dir, img_filename)
            import shutil
            shutil.copy(test_img, img_path)
        else:
            print("No fallback image found. Aborting capture.")
            return None
            
    # 2. Read GPS
    gps_data = get_gps_location(mock=mock_hardware)
    if not gps_data:
        gps_data = {'lat': None, 'lon': None, 'altitude': None, 'satellites': 0, 'timestamp': dt_str}
        
    # 3 & 4. Run Inference (IMSE + Quantification)
    print("Running inference...")
    mask_path = os.path.join(out_dir, f"mask_{dt_str}.png")
    try:
        results = run_inference(img_path, device='cpu')
        cv2.imwrite(mask_path, results['mask'])
    except Exception as e:
        print(f"Inference failed: {e}")
        return None
        
    # 5. Generate Decision Support Report (mocked based on config thresholds)
    overall_stats = results['particle_info']['overall_stats']
    count = overall_stats['total_count']
    
    contamination_level = "Low"
    for level, (low, high) in config.CONTAMINATION_THRESHOLDS.items():
        if low <= count <= high:
            contamination_level = level
            break
            
    # Simple risk score calculation based on config weights
    # Normalizing count to a 0-1 score, simplified logic
    normalized_count = min(count / 100.0, 1.0)
    risk_score = normalized_count * config.RISK_WEIGHTS['particle_count'] # Add other factors if needed
    
    # 6. Save results locally
    summary = {
        'timestamp': dt_str,
        'gps': gps_data,
        'model_selected': results['selected_model'],
        'confidence': results['confidence'],
        'particle_count': count,
        'risk_score': risk_score,
        'contamination_level': contamination_level,
        'image_file': img_filename,
        'mask_file': f"mask_{dt_str}.png"
    }
    
    json_path = os.path.join(out_dir, f"summary_{dt_str}.json")
    with open(json_path, 'w') as f:
        json.dump(summary, f, indent=4)
        
    print(f"Capture processed successfully. Contamination: {contamination_level}")
    return summary

def run_continuous(interval_seconds=3600, mock_hardware=False):
    """Run pipeline continuously at set interval."""
    print(f"Starting continuous edge pipeline every {interval_seconds}s.")
    try:
        while True:
            process_capture(mock_hardware)
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        print("\nEdge pipeline stopped.")

def batch_process_captures(directory):
    """Process multiple captures and generate summary."""
    # Placeholder for batch logic if needed
    pass

if __name__ == "__main__":
    print("Running single edge pipeline test...")
    # Use mock=True for initial test if hardware is unavailable
    process_capture(mock_hardware=True)
