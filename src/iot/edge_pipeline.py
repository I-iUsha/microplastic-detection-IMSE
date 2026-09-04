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
from src.decision_support import generate_report

try:
    from src.iot.microscope import capture_image
    from src.iot.gps_reader import get_gps_location
except ImportError:
    from microscope import capture_image
    from gps_reader import get_gps_location

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
    dt_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    out_dir = os.path.join(config.OUTPUTS_DIR, "field_results")
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Capture Image (Real USB microscope or graceful dataset sample fallback)
    img_filename = f"capture_{dt_str}.jpg"
    img_path = None
    if not mock_hardware:
        img_path = capture_image(output_dir=out_dir, filename=img_filename)
        
    if img_path is None:
        print("Hardware microscope not detected (or mock mode enabled). Using sample from dataset.")
        import glob
        import shutil
        valid_images = glob.glob(os.path.join(config.VALID_DIR, "*.jpg")) + glob.glob(os.path.join(config.TRAIN_DIR, "*.jpg"))
        if valid_images:
            test_img = valid_images[0]
            img_path = os.path.join(out_dir, img_filename)
            shutil.copy(test_img, img_path)
            print(f"Loaded sample image from dataset: {os.path.basename(test_img)}")
        else:
            print("No fallback image found in dataset. Aborting capture.")
            return None
            
    # 2. Read GPS (Real NEO-6M or mock coordinates)
    gps_data = get_gps_location(mock=mock_hardware)
    if not gps_data or gps_data.get('lat') is None:
        # Fallback coordinates for demonstration
        gps_data = {'lat': 28.7041, 'lon': 77.1025, 'altitude': 216.0, 'satellites': 6, 'timestamp': dt_str}
        
    # 3 & 4. Run Inference (IMSE + Quantification)
    print("Running IMSE inference on edge...")
    mask_path = os.path.join(out_dir, f"mask_{dt_str}.png")
    try:
        results = run_inference(img_path, device='cpu')
        cv2.imwrite(mask_path, results['mask'])
    except Exception as e:
        print(f"Inference failed: {e}")
        return None
        
    # 5. Generate Environmental Report
    from src.decision_support import get_contamination_level, calculate_risk_score
    overall_stats = results['particle_info']['overall_stats']
    count = overall_stats['total_count']
    
    contamination_level = get_contamination_level(count)
    density_metric = (overall_stats['total_area'] / (config.IMG_SIZE ** 2)) * 100
    risk_score = calculate_risk_score(count, results['particle_info']['size_classification'], density_metric)
    
    locations = [{'lat': gps_data['lat'], 'lon': gps_data['lon'], 'level': contamination_level}] if gps_data.get('lat') else None
    
    sample_id = f"IOT_{dt_str}"
    report_path = generate_report(
        results['particle_info'],
        sample_id=sample_id,
        locations=locations,
        model_used=results['selected_model'],
        features=results['features'],
    )
    
    # 6. Save field result summary & update dashboard index
    summary = {
        'sample_id': sample_id,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'gps': gps_data,
        'model_selected': results['selected_model'],
        'confidence': float(results['confidence']),
        'particle_count': count,
        'total_area': float(overall_stats['total_area']),
        'risk_score': float(risk_score),
        'contamination_level': contamination_level,
        'image_file': img_filename,
        'mask_file': f"mask_{dt_str}.png",
        'report_file': f"report_{sample_id}.md"
    }
    
    # Save individual JSON
    json_path = os.path.join(out_dir, f"summary_{dt_str}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=4)
        
    # Update field_results/index.json for Dashboard
    try:
        field_index_path = os.path.join(out_dir, "index.json")
        field_list = []
        if os.path.exists(field_index_path):
            try:
                with open(field_index_path, 'r', encoding='utf-8') as f:
                    field_list = json.load(f)
            except Exception:
                field_list = []
        field_list = [f for f in field_list if f.get('sample_id') != sample_id]
        field_list.insert(0, summary)
        with open(field_index_path, 'w', encoding='utf-8') as f:
            json.dump(field_list, f, indent=2)
        print(f"Updated dashboard field results: {field_index_path}")
    except Exception as e:
        print(f"Warning: Could not update field index: {e}")
        
    print(f"Capture processed successfully! Contamination Level: {contamination_level} | Risk Score: {risk_score:.2f}")
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
