"""
Build the IMSE Meta-Dataset.
Combines image quality features with best-model labels from per-image evaluation.
"""

import os
import sys
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config


def build_meta_dataset():
    """
    Combine image quality features and best model labels to create the meta-dataset.
    """
    config.create_output_dirs()

    # Load features (valid + augmented — these are the images evaluated in Phase 5)
    valid_features_path = os.path.join(config.RESULTS_DIR, "image_features_valid.csv")
    aug_features_path = os.path.join(config.RESULTS_DIR, "image_features_augmented.csv")

    if not os.path.exists(valid_features_path):
        print("Feature files not found. Ensure feature_extraction.py has been run.")
        return

    df_valid_feat = pd.read_csv(valid_features_path)
    feature_dfs = [df_valid_feat]

    if os.path.exists(aug_features_path):
        df_aug_feat = pd.read_csv(aug_features_path)
        feature_dfs.append(df_aug_feat)
    else:
        print("Warning: Augmented features not found. Meta-dataset will only contain original images.")

    df_features = pd.concat(feature_dfs, ignore_index=True)

    # Load per-image evaluation results
    eval_path = os.path.join(config.RESULTS_DIR, "per_image_evaluation.csv")
    if not os.path.exists(eval_path):
        print(f"Evaluation file not found at {eval_path}.")
        return

    df_eval = pd.read_csv(eval_path)

    # Normalize image_id: strip only known image extensions (.jpg, .jpeg, .png)
    # NOTE: os.path.splitext splits at the FIRST dot, which breaks filenames
    # like 'a--23-_jpg.rf.1ab5e302030f3bb3c08981ca42a8e631.jpg'
    import re
    def strip_img_ext(name):
        return re.sub(r'\.(jpg|jpeg|png)$', '', str(name), flags=re.IGNORECASE)

    df_features['image_id'] = df_features['image_id'].apply(strip_img_ext)

    # The evaluation file uses 'image_name' column — normalize it
    if 'image_name' in df_eval.columns and 'image_id' not in df_eval.columns:
        df_eval['image_id'] = df_eval['image_name'].apply(strip_img_ext)

    # Merge on image_id
    meta_df = pd.merge(df_features, df_eval[['image_id', 'best_model']], on='image_id', how='inner')

    # Save meta dataset
    meta_out_path = os.path.join(config.IMSE_DIR, "meta_dataset.csv")
    meta_df.to_csv(meta_out_path, index=False)
    print(f"Meta-dataset saved to {meta_out_path} with {len(meta_df)} samples.")

    # Analyze and save feature statistics
    stats_out_path = os.path.join(config.IMSE_DIR, "feature_statistics.txt")
    with open(stats_out_path, 'w') as f:
        f.write("Feature Statistics:\n")
        f.write(str(meta_df.describe()) + "\n\n")
        f.write("Best Model Distribution:\n")
        f.write(str(meta_df['best_model'].value_counts()) + "\n")

    # Distribution plots
    for feature in config.FEATURE_NAMES:
        plt.figure(figsize=(8, 6))
        sns.boxplot(x='best_model', y=feature, data=meta_df)
        plt.title(f"{feature.capitalize()} Distribution by Best Model")
        plt.savefig(os.path.join(config.IMSE_DIR, f"{feature}_distribution.png"))
        plt.close()

    print("Feature statistics and distribution plots saved.")


if __name__ == "__main__":
    build_meta_dataset()
