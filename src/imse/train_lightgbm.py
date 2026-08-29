"""
IMSE LightGBM Meta-Classifier Training.
Trains a LightGBM model to predict which segmentation model is best for each image.
Includes statistical comparison against fixed-model baselines.
"""

import os
import sys
import numpy as np
import pandas as pd
import lightgbm as lgb
import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from scipy import stats

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config


def train_imse():
    """Train the IMSE LightGBM meta-classifier with baseline comparison."""
    config.create_output_dirs()

    meta_path = os.path.join(config.IMSE_DIR, "meta_dataset.csv")
    if not os.path.exists(meta_path):
        print(f"Meta-dataset not found at {meta_path}")
        return

    df = pd.read_csv(meta_path)
    print(f"Loaded meta-dataset with {len(df)} samples.")
    print(f"Class distribution:\n{df['best_model'].value_counts()}")

    # Map string labels to integers
    df['target'] = df['best_model'].map(config.MODEL_LABEL_MAP)

    X = df[config.FEATURE_NAMES]
    y = df['target']

    # Stratified 5-fold CV
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=config.RANDOM_SEED)

    oof_preds = np.zeros(len(df), dtype=int)
    models = []

    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        train_data = lgb.Dataset(X_train, label=y_train)
        val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)

        model = lgb.train(
            config.LIGHTGBM_PARAMS,
            train_data,
            valid_sets=[train_data, val_data],
            callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)]
        )
        models.append(model)

        preds = model.predict(X_val)
        oof_preds[val_idx] = np.argmax(preds, axis=1)

        fold_acc = accuracy_score(y.iloc[val_idx], oof_preds[val_idx])
        print(f"  Fold {fold + 1}: Accuracy = {fold_acc:.4f}")

    # Final model on all data
    final_train_data = lgb.Dataset(X, label=y)
    final_model = lgb.train(config.LIGHTGBM_PARAMS, final_train_data)

    # Save model
    model_path = os.path.join(config.IMSE_DIR, "lightgbm_model.pkl")
    joblib.dump(final_model, model_path)
    print(f"\nSaved LightGBM model to {model_path}")

    # Overall CV metrics
    acc = accuracy_score(y, oof_preds)
    precision, recall, f1, _ = precision_recall_fscore_support(y, oof_preds, average=None, zero_division=0)

    print(f"\n--- IMSE Cross-Validation Results ---")
    print(f"Overall CV Accuracy: {acc:.4f}")
    for i, model_name in config.LABEL_MODEL_MAP.items():
        if i < len(precision):
            print(f"  {model_name} - Precision: {precision[i]:.4f}, Recall: {recall[i]:.4f}, F1: {f1[i]:.4f}")

    # Confusion Matrix
    cm = confusion_matrix(y, oof_preds)
    plt.figure(figsize=(8, 6))
    labels = [config.LABEL_MODEL_MAP[i] for i in range(len(config.MODEL_LABEL_MAP))]
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=labels, yticklabels=labels)
    plt.title("IMSE Confusion Matrix")
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig(os.path.join(config.RESULTS_DIR, "imse_confusion_matrix.png"))
    plt.close()

    # Feature Importance
    importance = final_model.feature_importance(importance_type='gain')
    plt.figure(figsize=(10, 6))
    sns.barplot(x=importance, y=config.FEATURE_NAMES)
    plt.title('LightGBM Feature Importance (Gain)')
    plt.tight_layout()
    plt.savefig(os.path.join(config.RESULTS_DIR, "imse_feature_importance.png"))
    plt.close()

    # ─── Baseline Comparison (Statistical) ─────────────────────────────────────
    eval_path = os.path.join(config.RESULTS_DIR, "per_image_evaluation.csv")
    if not os.path.exists(eval_path):
        print(f"\nCannot perform baseline comparison. {eval_path} missing.")
        return

    df_eval = pd.read_csv(eval_path)

    # Normalize image_id in eval file
    if 'image_name' in df_eval.columns and 'image_id' not in df_eval.columns:
        df_eval['image_id'] = df_eval['image_name'].apply(
            lambda x: os.path.splitext(x)[0] if '.' in x else x
        )

    # Map OOF predictions
    df['imse_pred_label'] = oof_preds
    df['imse_pred_model'] = df['imse_pred_label'].map(config.LABEL_MODEL_MAP)

    # Merge with eval data — need to match column naming
    # The evaluate_models.py uses lowercase model names in columns (e.g., unet_iou)
    comp_df = pd.merge(df[['image_id', 'imse_pred_model']], df_eval, on='image_id', how='inner')

    if comp_df.empty:
        print("Warning: No matching images between meta-dataset and evaluation. Skipping baseline comparison.")
        return

    # Build IoU columns — handle both naming conventions
    iou_cols = {}
    for model_name in config.MODEL_NAMES:
        # Try lowercase format first (from evaluate_models.py)
        col_lower = f"{model_name.lower()}_iou"
        col_title = f"{model_name}_IoU"
        if col_lower in comp_df.columns:
            iou_cols[model_name] = col_lower
        elif col_title in comp_df.columns:
            iou_cols[model_name] = col_title
        else:
            print(f"Warning: IoU column for {model_name} not found in evaluation data.")

    if len(iou_cols) < len(config.MODEL_NAMES):
        print("Cannot perform full baseline comparison. Missing IoU columns.")
        return

    # IMSE selection IoU
    comp_df['IMSE_IoU'] = comp_df.apply(
        lambda row: row[iou_cols[row['imse_pred_model']]] if row['imse_pred_model'] in iou_cols else 0,
        axis=1
    )

    # Random selection IoU
    np.random.seed(config.RANDOM_SEED)
    random_models = np.random.choice(config.MODEL_NAMES, size=len(comp_df))
    comp_df['Random_IoU'] = [
        comp_df.iloc[i][iou_cols[m]] for i, m in enumerate(random_models)
    ]

    # Oracle (best possible) IoU for reference
    comp_df['Oracle_IoU'] = comp_df[[iou_cols[m] for m in config.MODEL_NAMES]].max(axis=1)

    # Build comparison results
    baselines = {}
    for model_name in config.MODEL_NAMES:
        baselines[f'{model_name} (Fixed)'] = comp_df[iou_cols[model_name]]
    baselines['Random Selection'] = comp_df['Random_IoU']
    baselines['IMSE (Ours)'] = comp_df['IMSE_IoU']
    baselines['Oracle (Upper Bound)'] = comp_df['Oracle_IoU']

    results = []
    imse_scores = baselines['IMSE (Ours)']

    for name, scores in baselines.items():
        mean_iou = scores.mean()
        std_iou = scores.std()

        if name != 'IMSE (Ours)' and name != 'Oracle (Upper Bound)':
            # Paired t-test: is IMSE significantly better?
            t_stat, p_val = stats.ttest_rel(imse_scores, scores)
            # Wilcoxon signed-rank test (non-parametric alternative)
            try:
                w_stat, w_pval = stats.wilcoxon(imse_scores - scores)
            except ValueError:
                w_stat, w_pval = np.nan, np.nan

            results.append({
                'Strategy': name,
                'Mean_IoU': mean_iou,
                'Std_IoU': std_iou,
                'T_Statistic': t_stat,
                'P_Value_TTest': p_val,
                'W_Statistic': w_stat,
                'P_Value_Wilcoxon': w_pval,
                'Significant_vs_IMSE': p_val < 0.05 and t_stat > 0
            })
        else:
            results.append({
                'Strategy': name,
                'Mean_IoU': mean_iou,
                'Std_IoU': std_iou,
                'T_Statistic': None,
                'P_Value_TTest': None,
                'W_Statistic': None,
                'P_Value_Wilcoxon': None,
                'Significant_vs_IMSE': None
            })

    res_df = pd.DataFrame(results)
    print("\n--- Baseline Comparison (Statistical) ---")
    print(res_df[['Strategy', 'Mean_IoU', 'Std_IoU', 'P_Value_TTest', 'Significant_vs_IMSE']].to_string(index=False))

    res_df.to_csv(os.path.join(config.IMSE_DIR, "baseline_comparison.csv"), index=False)

    # Bar plot comparison
    plt.figure(figsize=(12, 6))
    colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#94a3b8', '#22d3ee', '#10b981']
    ax = sns.barplot(x='Strategy', y='Mean_IoU', data=res_df, palette=colors[:len(res_df)])
    plt.title("Average IoU by Selection Strategy\n(IMSE vs Fixed-Model Baselines)", fontsize=14)
    plt.ylabel("Mean IoU")
    plt.xlabel("")
    plt.xticks(rotation=30, ha='right')

    # Add value labels on bars
    for i, row in res_df.iterrows():
        ax.text(i, row['Mean_IoU'] + 0.005, f"{row['Mean_IoU']:.4f}", ha='center', fontsize=9)

    plt.tight_layout()
    plt.savefig(os.path.join(config.RESULTS_DIR, "baseline_comparison_iou.png"), dpi=300)
    plt.close()

    print(f"\nBaseline comparison saved to {os.path.join(config.IMSE_DIR, 'baseline_comparison.csv')}")


if __name__ == "__main__":
    train_imse()
