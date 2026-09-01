"""
Microplastic Detection System — Main Entry Point
Orchestrates the complete pipeline: mask generation → augmentation → training → 
evaluation → feature extraction → IMSE training → inference.
"""

import os
import sys
import argparse

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import src.config as config


def run_masks():
    """Phase 2: Generate segmentation masks from bounding box annotations."""
    print("\n" + "=" * 60)
    print("PHASE 2: Generating Segmentation Masks")
    print("=" * 60)
    from src.mask_generator import main as mask_main
    mask_main()


def run_augmentation():
    """Phase 3: Generate augmented images with quality variations."""
    print("\n" + "=" * 60)
    print("PHASE 3: Generating Augmented Data")
    print("=" * 60)
    from src.augmentation import main as aug_main
    aug_main()


def run_training():
    """Phase 4: Train all 3 segmentation models."""
    print("\n" + "=" * 60)
    print("PHASE 4: Training Segmentation Models")
    print("=" * 60)
    from src.train_segmentation import main as train_main
    train_main()


def run_evaluation():
    """Phase 5: Evaluate all models per-image on validation set."""
    print("\n" + "=" * 60)
    print("PHASE 5: Per-Image Model Evaluation")
    print("=" * 60)
    from src.evaluate_models import main as eval_main
    eval_main()


def run_feature_extraction():
    """Phase 6a: Extract image quality features."""
    print("\n" + "=" * 60)
    print("PHASE 6a: Feature Extraction")
    print("=" * 60)
    from src.feature_extraction import extract_features_batch
    import pandas as pd

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

    # Also extract from augmented images
    if os.path.exists(config.AUGMENTED_IMAGES_DIR):
        print("Extracting features for augmented images...")
        df_aug = extract_features_batch(config.AUGMENTED_IMAGES_DIR)
        aug_out = os.path.join(config.RESULTS_DIR, "image_features_augmented.csv")
        df_aug.to_csv(aug_out, index=False)
        print(f"Saved {len(df_aug)} augmented features to {aug_out}")


def run_build_meta_dataset():
    """Phase 6b: Build IMSE meta-dataset."""
    print("\n" + "=" * 60)
    print("PHASE 6b: Building IMSE Meta-Dataset")
    print("=" * 60)
    from src.imse.build_meta_dataset import build_meta_dataset
    build_meta_dataset()


def run_train_imse():
    """Phase 6c: Train LightGBM meta-classifier."""
    print("\n" + "=" * 60)
    print("PHASE 6c: Training IMSE (LightGBM Meta-Classifier)")
    print("=" * 60)
    from src.imse.train_lightgbm import train_imse
    train_imse()


def run_inference(image_path: str, device: str = 'cpu'):
    """Phase 7: Run inference on a single image."""
    print("\n" + "=" * 60)
    print("PHASE 7: Running Inference")
    print("=" * 60)
    from src.inference import run_inference as inference_fn
    from src.decision_support import generate_report

    results = inference_fn(image_path, device)

    print(f"\n--- Inference Results ---")
    print(f"Selected Model: {results['selected_model']}")
    print(f"Confidence: {results['confidence']:.4f}")
    print(f"Features: {results['features']}")

    overall = results['particle_info']['overall_stats']
    print(f"Detected {overall['total_count']} particles")
    print(f"Total Area: {overall['total_area']:.1f} px²")
    print(f"Size Distribution: {results['particle_info']['size_classification']}")

    # Generate environmental report
    sample_id = os.path.splitext(os.path.basename(image_path))[0]
    report_path = generate_report(
        results['particle_info'],
        sample_id=sample_id,
        model_used=results['selected_model'],
        features=results['features'],
    )
    print(f"\nEnvironmental report saved to: {report_path}")

    # Save mask
    import cv2
    mask_out = os.path.join(config.RESULTS_DIR, f"{sample_id}_mask.png")
    cv2.imwrite(mask_out, results['mask'])
    print(f"Segmentation mask saved to: {mask_out}")

    # Save field result for dashboard
    import json
    from datetime import datetime
    from src.decision_support import get_contamination_level, calculate_risk_score

    try:
        field_dir = os.path.join(config.OUTPUTS_DIR, "field_results")
        os.makedirs(field_dir, exist_ok=True)
        field_index_path = os.path.join(field_dir, "index.json")

        density_metric = (overall['total_area'] / (config.IMG_SIZE ** 2)) * 100
        risk_score = calculate_risk_score(overall['total_count'], results['particle_info']['size_classification'], density_metric)
        level = get_contamination_level(overall['total_count'])

        field_entry = {
            'sample_id': sample_id,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'particle_count': overall['total_count'],
            'total_area': overall['total_area'],
            'contamination_level': level,
            'risk_score': risk_score,
            'model_selected': results['selected_model'],
            'confidence': results['confidence'],
            'gps': {'lat': 28.7041, 'lon': 77.1025}
        }

        field_list = []
        if os.path.exists(field_index_path):
            try:
                with open(field_index_path, 'r', encoding='utf-8') as f:
                    field_list = json.load(f)
            except Exception:
                field_list = []

        field_list = [f for f in field_list if f.get('sample_id') != sample_id]
        field_list.insert(0, field_entry)

        with open(field_index_path, 'w', encoding='utf-8') as f:
            json.dump(field_list, f, indent=2)
        print(f"Updated dashboard field results index: {field_index_path}")
    except Exception as e:
        print(f"Warning: Could not update field_results index.json: {e}")

    return results


def run_full_train():
    """Run the complete training pipeline (Phases 2-6)."""
    print("\n" + "#" * 60)
    print("# MICROPLASTIC DETECTION SYSTEM — FULL TRAINING PIPELINE")
    print("#" * 60)

    config.create_output_dirs()

    run_masks()
    run_augmentation()
    run_training()
    run_evaluation()
    run_feature_extraction()
    run_build_meta_dataset()
    run_train_imse()

    print("\n" + "#" * 60)
    print("# TRAINING PIPELINE COMPLETE!")
    print("#" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Microplastic Detection System with IMSE",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --mode train              # Run full training pipeline
  python main.py --mode masks              # Generate masks only
  python main.py --mode augment            # Generate augmentations only
  python main.py --mode train_models       # Train segmentation models only
  python main.py --mode evaluate           # Evaluate models only
  python main.py --mode features           # Extract features only
  python main.py --mode build_meta         # Build IMSE meta-dataset only
  python main.py --mode train_imse         # Train IMSE only
  python main.py --mode inference --image path/to/image.jpg
        """
    )
    parser.add_argument(
        '--mode',
        choices=['train', 'masks', 'augment', 'train_models', 'evaluate',
                 'features', 'build_meta', 'train_imse', 'inference'],
        required=True,
        help='Pipeline mode to run'
    )
    parser.add_argument('--image', type=str, help='Image path for inference mode')
    parser.add_argument('--device', type=str, default='cpu', help='Device (cpu or cuda)')

    args = parser.parse_args()

    if args.mode == 'train':
        run_full_train()
    elif args.mode == 'masks':
        run_masks()
    elif args.mode == 'augment':
        run_augmentation()
    elif args.mode == 'train_models':
        run_training()
    elif args.mode == 'evaluate':
        run_evaluation()
    elif args.mode == 'features':
        run_feature_extraction()
    elif args.mode == 'build_meta':
        run_build_meta_dataset()
    elif args.mode == 'train_imse':
        run_train_imse()
    elif args.mode == 'inference':
        if not args.image:
            parser.error("--image is required for inference mode")
        run_inference(args.image, args.device)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
