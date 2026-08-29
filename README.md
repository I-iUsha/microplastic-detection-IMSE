# 🔬 Microplastic Detection System with IMSE

An AI-powered microplastic detection and environmental monitoring system that uses an **Intelligent Model Selection Engine (IMSE)** to automatically select the best segmentation model based on image quality conditions. Deployable on **Raspberry Pi 5** with USB microscope and GPS for field monitoring.

## 🌟 Key Features

- **IMSE (Intelligent Model Selection Engine)** — LightGBM meta-classifier that picks the optimal segmentation model (UNet/DeepLabV3+/LinkNet) per image
- **3 Segmentation Models** — UNet, DeepLabV3+, LinkNet trained on microplastic datasets
- **Image Quality Assessment** — 5 features: blur, brightness, contrast, particle density, edge density
- **Environmental Decision Support** — Automated contamination level assessment and risk scoring
- **Interactive Dashboard** — Professional dark-themed UI with Leaflet.js heatmaps and Chart.js analytics
- **IoT Edge Deployment** — Raspberry Pi 5 pipeline with USB microscope and GPS module
- **Report Generation** — Downloadable environmental analysis reports

## 📊 Results

| Metric | Value |
|--------|-------|
| **IMSE Mean IoU** | 0.4655 (beats all fixed baselines, p < 10⁻¹⁸) |
| **UNet Dice Score** | 0.7470 |
| **DeepLabV3+ Dice** | 0.7312 |
| **LinkNet Dice** | 0.7384 |
| **IMSE CV Accuracy** | 60.03% |

## 🏗️ Architecture

```
├── src/
│   ├── config.py                 # Central configuration
│   ├── mask_generator.py         # CSV → binary mask conversion
│   ├── preprocessing.py          # Image preprocessing pipeline
│   ├── dataset_loader.py         # PyTorch Dataset + DataLoaders
│   ├── augmentation.py           # Quality-variant generation
│   ├── models/
│   │   ├── unet.py               # UNet (ResNet34 encoder)
│   │   ├── deeplabv3plus.py      # DeepLabV3+ (ResNet34 encoder)
│   │   └── linknet.py            # LinkNet (ResNet34 encoder)
│   ├── train_segmentation.py     # Training loop
│   ├── evaluate_models.py        # Per-image evaluation
│   ├── feature_extraction.py     # Image quality features
│   ├── imse/
│   │   ├── build_meta_dataset.py # Merge features + best-model labels
│   │   └── train_lightgbm.py     # LightGBM meta-classifier
│   ├── inference.py              # End-to-end IMSE inference
│   ├── quantification.py         # Particle counting & stats
│   ├── decision_support.py       # Environmental risk & reports
│   └── iot/
│       ├── microscope.py         # USB microscope capture
│       ├── gps_reader.py         # NEO-6M GPS NMEA parsing
│       ├── edge_pipeline.py      # Full edge detection pipeline
│       ├── hardware_test.py      # Hardware diagnostics
│       └── pi_setup.sh           # Raspberry Pi setup script
├── dashboard/
│   ├── index.html                # Dashboard structure
│   ├── style.css                 # Professional dark theme
│   └── app.js                    # Charts, maps, reports viewer
├── main.py                       # CLI entry point
└── requirements_pi.txt           # Pi ARM64 dependencies
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- PyTorch (CPU or CUDA)
- segmentation-models-pytorch

### Installation
```bash
git clone https://github.com/I-iUsha/microplastic-detection-IMSE.git
cd microplastic-detection-IMSE
pip install torch torchvision segmentation-models-pytorch lightgbm opencv-python pandas numpy scikit-learn
```

### Usage
```bash
# Generate masks from annotations
python main.py --mode masks

# Augment training data
python main.py --mode augment

# Train segmentation models
python main.py --mode train_models

# Evaluate per-image
python main.py --mode evaluate

# Extract image quality features
python main.py --mode features

# Build IMSE meta-dataset
python main.py --mode build_meta

# Train IMSE (LightGBM)
python main.py --mode train_imse

# Run inference on a new image
python main.py --mode inference --image path/to/image.jpg
```

### Dashboard
Open `dashboard/index.html` in any browser.

## 🔌 IoT Deployment (Raspberry Pi 5)

### Hardware Required
- Raspberry Pi 5 (4 GB)
- USB Digital Microscope (Jiusion 2K recommended)
- NEO-6M GPS Module
- Samsung PRO Endurance 64 GB microSD
- 4 Jumper Wires (Female-to-Female)

### Setup
```bash
# On Raspberry Pi
bash src/iot/pi_setup.sh
python src/iot/hardware_test.py
python src/iot/edge_pipeline.py
```

## 📄 License
This project is part of an academic thesis. All rights reserved.

## 👤 Author
**Usha** — [GitHub](https://github.com/I-iUsha)
