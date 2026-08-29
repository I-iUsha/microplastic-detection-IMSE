import os
import cv2
import torch
import numpy as np
import pandas as pd
from tqdm import tqdm
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config
from src.preprocessing import preprocess_image, preprocess_mask
from src.models.unet import get_unet_model
from src.models.deeplabv3plus import get_deeplabv3plus_model
from src.models.linknet import get_linknet_model

def calculate_metrics(pred, target):
    """Calculate IoU, Dice, Precision, Recall, F1 for binary masks."""
    pred = (pred > 0.5).astype(np.float32)
    target = (target > 0.5).astype(np.float32)
    
    tp = np.sum((pred == 1) & (target == 1))
    fp = np.sum((pred == 1) & (target == 0))
    fn = np.sum((pred == 0) & (target == 1))
    
    smooth = 1e-6
    iou = tp / (tp + fp + fn + smooth)
    dice = 2 * tp / (2 * tp + fp + fn + smooth)
    precision = tp / (tp + fp + smooth)
    recall = tp / (tp + fn + smooth)
    f1 = 2 * (precision * recall) / (precision + recall + smooth)
    
    return iou, dice, precision, recall, f1

def load_model(model_func, weights_path, device):
    model = model_func()
    if os.path.exists(weights_path):
        model.load_state_dict(torch.load(weights_path, map_location=device))
        model.to(device)
        model.eval()
        return model
    else:
        print(f"Warning: Weights not found at {weights_path}")
        return None

def main():
    config.create_output_dirs()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Load Models
    models = {}
    model_funcs = {
        "UNet": get_unet_model,
        "DeepLabV3Plus": get_deeplabv3plus_model,
        "LinkNet": get_linknet_model
    }
    
    for name, func in model_funcs.items():
        weights_path = os.path.join(config.MODELS_DIR, f"{name}_best.pth")
        model = load_model(func, weights_path, device)
        if model is not None:
            models[name] = model
            
    if not models:
        print("No trained models found. Exiting.")
        return

    # Gather validation images (Original + Augmented)
    valid_exts = ['.jpg', '.jpeg', '.png']
    valid_stems = set()
    eval_items = [] # list of (img_path, mask_path, img_name)
    
    # 1. Original Valid Images
    if os.path.exists(config.VALID_DIR):
        for fname in os.listdir(config.VALID_DIR):
            if any(fname.lower().endswith(ext) for ext in valid_exts):
                stem = os.path.splitext(fname)[0]
                valid_stems.add(stem)
                
                mask_fname = stem + '.png'
                mask_path = os.path.join(config.VALID_MASKS_DIR, mask_fname)
                if os.path.exists(mask_path):
                    eval_items.append((os.path.join(config.VALID_DIR, fname), mask_path, fname))
                    
    # 2. Augmented Valid Images
    if os.path.exists(config.AUGMENTED_IMAGES_DIR):
        for fname in os.listdir(config.AUGMENTED_IMAGES_DIR):
            if any(fname.lower().endswith(ext) for ext in valid_exts):
                # Check if it belongs to valid set by matching the prefix
                stem = os.path.splitext(fname)[0]
                is_valid = any(stem.startswith(v_stem) for v_stem in valid_stems)
                if is_valid:
                    mask_fname = stem + '.png'
                    mask_path = os.path.join(config.AUGMENTED_MASKS_DIR, mask_fname)
                    if os.path.exists(mask_path):
                        eval_items.append((os.path.join(config.AUGMENTED_IMAGES_DIR, fname), mask_path, fname))

    print(f"Total images to evaluate: {len(eval_items)}")
    
    results = []
    
    # Evaluate
    with torch.no_grad():
        for img_path, mask_path, img_name in tqdm(eval_items, desc="Evaluating"):
            # Load and preprocess
            image = cv2.imread(img_path)
            mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            
            if image is None or mask is None:
                continue
                
            image = preprocess_image(image, use_clahe=True, use_blur=False)
            mask = preprocess_mask(mask)
            
            # Convert to tensor
            image_tensor = torch.tensor(np.transpose(image, (2, 0, 1)), dtype=torch.float32).unsqueeze(0).to(device)
            mask_np = mask.squeeze() # (256, 256)
            
            row = {"image_name": img_name}
            best_iou = -1
            best_model_name = "None"
            
            for m_name, model in models.items():
                output = model(image_tensor)
                output_np = output.squeeze().cpu().numpy()
                
                iou, dice, precision, recall, f1 = calculate_metrics(output_np, mask_np)
                
                row[f"{m_name.lower()}_iou"] = iou
                row[f"{m_name.lower()}_dice"] = dice
                row[f"{m_name.lower()}_precision"] = precision
                row[f"{m_name.lower()}_recall"] = recall
                row[f"{m_name.lower()}_f1"] = f1
                
                if iou > best_iou:
                    best_iou = iou
                    best_model_name = m_name
                    
            row["best_model"] = best_model_name
            results.append(row)
            
    if not results:
        print("No evaluation results generated.")
        return
        
    # Save per-image results
    df_results = pd.DataFrame(results)
    per_image_csv = os.path.join(config.RESULTS_DIR, "per_image_evaluation.csv")
    df_results.to_csv(per_image_csv, index=False)
    print(f"\nSaved per-image results to {per_image_csv}")
    
    # Compute overall metrics
    summary = []
    for m_name in models.keys():
        m_lower = m_name.lower()
        summary.append({
            "Model": m_name,
            "Mean_IoU": df_results[f"{m_lower}_iou"].mean(),
            "Mean_Dice": df_results[f"{m_lower}_dice"].mean(),
            "Mean_Precision": df_results[f"{m_lower}_precision"].mean(),
            "Mean_Recall": df_results[f"{m_lower}_recall"].mean(),
            "Mean_F1": df_results[f"{m_lower}_f1"].mean(),
        })
        
    df_summary = pd.DataFrame(summary)
    summary_csv = os.path.join(config.RESULTS_DIR, "overall_evaluation_summary.csv")
    df_summary.to_csv(summary_csv, index=False)
    
    print("\n--- Overall Evaluation Summary ---")
    print(df_summary.to_string(index=False))
    print(f"\nSaved overall summary to {summary_csv}")
    
if __name__ == "__main__":
    main()
