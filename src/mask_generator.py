import os
import pandas as pd
import numpy as np
import cv2
from tqdm import tqdm
import sys

# Add project root to path so we can import config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config

def generate_masks(csv_path, image_dir, output_mask_dir):
    """
    Reads bounding box annotations from CSV and generates binary masks.
    """
    if not os.path.exists(csv_path):
        print(f"Error: Annotations file not found at {csv_path}")
        return

    print(f"Reading annotations from {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error reading {csv_path}: {e}")
        return
        
    # Group by filename since multiple bboxes can exist per image
    grouped = df.groupby('filename')
    
    print(f"Generating masks to {output_mask_dir}...")
    for filename, group in tqdm(grouped, total=len(grouped)):
        # Read the original image to get dimensions (or use from config)
        img_path = os.path.join(image_dir, filename)
        if not os.path.exists(img_path):
            print(f"Warning: Image {filename} not found in {image_dir}. Skipping.")
            continue
            
        # Get dimensions from the first row of the group
        width = int(group.iloc[0]['width'])
        height = int(group.iloc[0]['height'])
        
        # Create a blank mask (0 = background)
        mask = np.zeros((height, width), dtype=np.uint8)
        
        # Fill bounding box regions (255 = microplastic)
        for _, row in group.iterrows():
            xmin = int(row['xmin'])
            ymin = int(row['ymin'])
            xmax = int(row['xmax'])
            ymax = int(row['ymax'])
            
            # Ensure coordinates are within image bounds
            xmin = max(0, xmin)
            ymin = max(0, ymin)
            xmax = min(width - 1, xmax)
            ymax = min(height - 1, ymax)
            
            # Draw filled rectangle
            cv2.rectangle(mask, (xmin, ymin), (xmax, ymax), color=255, thickness=-1)
            
        # Save mask as PNG
        mask_filename = os.path.splitext(filename)[0] + '.png'
        mask_path = os.path.join(output_mask_dir, mask_filename)
        cv2.imwrite(mask_path, mask)

def main():
    config.create_output_dirs()
    
    print("--- Generating Train Masks ---")
    generate_masks(config.TRAIN_ANNOTATIONS, config.TRAIN_DIR, config.TRAIN_MASKS_DIR)
    
    print("\n--- Generating Validation Masks ---")
    generate_masks(config.VALID_ANNOTATIONS, config.VALID_DIR, config.VALID_MASKS_DIR)
    
    print("\nMask generation complete!")

if __name__ == "__main__":
    main()
