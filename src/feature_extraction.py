"""
Feature Extraction Module
Extracts 5 image-quality features: blur, brightness, contrast, particle_density, edge_density.
"""

import os
import sys
import cv2
import numpy as np
import pandas as pd
from glob import glob

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config


def extract_features(image_path: str) -> dict:
    """
    Extract 5 image-quality features from an image.

    Args:
        image_path: Path to the input image

    Returns:
        dict containing the extracted features.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Blur: Variance of Laplacian (higher = sharper)
    blur = cv2.Laplacian(gray, cv2.CV_64F).var()

    # 2. Brightness: Mean pixel intensity
    brightness = float(np.mean(gray))

    # 3. Contrast: Standard deviation of pixel intensities
    contrast = float(np.std(gray))

    # 4. Particle Density: Count of contours found after adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    particle_density = float(len(contours))

    # 5. Edge Density: Ratio of edge pixels to total pixels
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.count_nonzero(edges) / edges.size)

    return {
        "blur": blur,
        "brightness": brightness,
        "contrast": contrast,
        "particle_density": particle_density,
        "edge_density": edge_density,
    }


def extract_features_batch(image_dir: str) -> pd.DataFrame:
    """
    Extract features from all images in a directory.

    Args:
        image_dir: Directory containing images

    Returns:
        pd.DataFrame with image_id and extracted features
    """
    image_paths = (
        glob(os.path.join(image_dir, "*.jpg"))
        + glob(os.path.join(image_dir, "*.png"))
        + glob(os.path.join(image_dir, "*.jpeg"))
    )

    # Filter out annotation files and masks
    image_paths = [p for p in image_paths if not os.path.basename(p).startswith("_")]

    results = []
    for path in image_paths:
        try:
            features = extract_features(path)
            image_id = os.path.splitext(os.path.basename(path))[0]
            features["image_id"] = image_id
            results.append(features)
        except Exception as e:
            print(f"Error processing {path}: {e}")

    df = pd.DataFrame(results)
    if not df.empty:
        cols = ["image_id"] + config.FEATURE_NAMES
        df = df[cols]
    return df


if __name__ == "__main__":
    config.create_output_dirs()

    print("Extracting features for training set...")
    df_train = extract_features_batch(config.TRAIN_DIR)
    train_out = os.path.join(config.RESULTS_DIR, "image_features_train.csv")
    df_train.to_csv(train_out, index=False)
    print(f"Saved {len(df_train)} training features to {train_out}")

    print("Extracting features for validation set...")
    df_valid = extract_features_batch(config.VALID_DIR)
    valid_out = os.path.join(config.RESULTS_DIR, "image_features_valid.csv")
    df_valid.to_csv(valid_out, index=False)
    print(f"Saved {len(df_valid)} validation features to {valid_out}")
