"""
End-to-end Inference Pipeline for Microplastic Detection.
Integrates IMSE model selection → segmentation → post-processing → quantification.
"""

import os
import sys
import argparse
import numpy as np
import cv2
import pandas as pd
import joblib
import torch

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config
from src.feature_extraction import extract_features
from src.quantification import quantify_particles
from src.preprocessing import preprocess_image
from src.models.unet import get_unet_model
from src.models.deeplabv3plus import get_deeplabv3plus_model
from src.models.linknet import get_linknet_model


# Model factory mapping
MODEL_FACTORY = {
    "UNet": get_unet_model,
    "DeepLabV3Plus": get_deeplabv3plus_model,
    "LinkNet": get_linknet_model,
}


def load_segmentation_model(model_name: str, device: torch.device) -> torch.nn.Module:
    """Load a specific segmentation model with trained weights."""
    model_path = os.path.join(config.MODELS_DIR, f"{model_name}_best.pth")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model weights not found at {model_path}")

    if model_name not in MODEL_FACTORY:
        raise ValueError(f"Unknown model: {model_name}. Choose from {list(MODEL_FACTORY.keys())}")

    model = MODEL_FACTORY[model_name]()
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    return model


def post_process_mask(mask: np.ndarray, min_area: int = 50) -> np.ndarray:
    """Apply morphological closing and remove small contours."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out_mask = np.zeros_like(mask)
    for cnt in contours:
        if cv2.contourArea(cnt) >= min_area:
            cv2.drawContours(out_mask, [cnt], -1, 255, -1)

    return out_mask


def run_inference(image_path: str, device: str = 'cpu') -> dict:
    """
    End-to-end inference pipeline for a single image.

    Args:
        image_path: Path to the input microscope image
        device: 'cpu' or 'cuda'

    Returns:
        dict with keys: selected_model, features, confidence, particle_info, mask
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found at {image_path}")

    device = torch.device(device)

    # 1. Load original image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    # 2. Extract quality features (from original image, before preprocessing)
    features = extract_features(image_path)

    # 3. IMSE predicts best model
    lgb_model_path = os.path.join(config.IMSE_DIR, "lightgbm_model.pkl")
    if not os.path.exists(lgb_model_path):
        raise FileNotFoundError(f"IMSE model not found at {lgb_model_path}")

    lgb_model = joblib.load(lgb_model_path)
    feature_values = pd.DataFrame([features])[config.FEATURE_NAMES]

    pred_probs = lgb_model.predict(feature_values)
    pred_idx = int(np.argmax(pred_probs, axis=1)[0])
    selected_model_name = config.LABEL_MODEL_MAP[pred_idx]

    # Get confidence score
    confidence = float(pred_probs[0][pred_idx])

    print(f"IMSE selected: {selected_model_name} (confidence: {confidence:.4f})")
    print(f"Features: {features}")

    # 4. Preprocess image for segmentation
    processed = preprocess_image(img, use_clahe=True, use_blur=False)

    # 5. Load selected model and run segmentation
    seg_model = load_segmentation_model(selected_model_name, device)

    # Convert to tensor (C, H, W) and add batch dimension
    input_tensor = torch.tensor(
        np.transpose(processed, (2, 0, 1)), dtype=torch.float32
    ).unsqueeze(0).to(device)

    with torch.no_grad():
        output = seg_model(input_tensor)

    # Convert to binary mask
    pred_mask = output.squeeze().cpu().numpy()
    binary_mask = (pred_mask > 0.5).astype(np.uint8) * 255

    # 6. Post-process mask
    final_mask = post_process_mask(binary_mask, min_area=50)

    # 7. Quantification
    particle_info = quantify_particles(final_mask)

    return {
        "selected_model": selected_model_name,
        "features": features,
        "confidence": confidence,
        "particle_info": particle_info,
        "mask": final_mask,
    }


def main():
    parser = argparse.ArgumentParser(description="Run IMSE Inference Pipeline")
    parser.add_argument("image_path", help="Path to input image")
    parser.add_argument("--device", default="cpu", help="Device (cpu or cuda)")
    parser.add_argument("--out_mask", default=None, help="Path to save output mask")
    args = parser.parse_args()

    try:
        results = run_inference(args.image_path, args.device)
        print(f"\n--- Inference Results ---")
        print(f"Selected Model: {results['selected_model']}")
        print(f"Confidence: {results['confidence']:.4f}")
        print(f"Extracted Features: {results['features']}")

        overall = results['particle_info']['overall_stats']
        print(f"Detected {overall['total_count']} particles")
        print(f"Total Area: {overall['total_area']:.1f} px²")
        print(f"Size Distribution: {results['particle_info']['size_classification']}")

        if args.out_mask:
            cv2.imwrite(args.out_mask, results['mask'])
            print(f"Saved predicted mask to {args.out_mask}")

    except Exception as e:
        print(f"Error during inference: {e}")
        raise


if __name__ == "__main__":
    main()
