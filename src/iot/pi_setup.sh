#!/bin/bash
# Raspberry Pi Initial Setup Script for Microplastic Detection System

echo "Starting Raspberry Pi Environment Setup..."

# 1. Update apt packages
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install system dependencies (including pre-built Python packages for ARM64)
echo "Installing system dependencies and pre-compiled libraries..."
sudo apt-get install -y \
    libopencv-dev \
    python3-opencv \
    python3-pip \
    python3-venv \
    python3-pandas \
    python3-numpy \
    python3-scipy \
    python3-sklearn \
    python3-serial \
    python3-joblib \
    python3-matplotlib \
    python3-tqdm \
    i2c-tools \
    git \
    v4l-utils

# 3. Enable serial port for GPS (non-interactive)
echo "Enabling Serial Port..."
# Disable serial console, enable serial hardware
sudo raspi-config nonint do_serial_hw 0
sudo raspi-config nonint do_serial_cons 1

# 4. Set up Python virtual environment with system packages enabled
echo "Setting up Python virtual environment..."
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR" || exit
python3 -m venv --system-site-packages venv
source venv/bin/activate

# 5. Install Python ML dependencies
echo "Installing PyTorch and ML dependencies..."
pip install --upgrade pip

# Install PyTorch for ARM64
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install segmentation models & lightgbm
pip install --extra-index-url https://www.piwheels.org/simple segmentation-models-pytorch lightgbm

# 6. Test Hardware
echo "Hardware Setup Complete. Please reboot the system for serial changes to take effect."
echo "After reboot, run: python3 src/iot/hardware_test.py to verify."

# Optional: Create systemd service
# cat << EOF | sudo tee /etc/systemd/system/microplastic-edge.service
# [Unit]
# Description=Microplastic Edge Pipeline
# After=network.target
#
# [Service]
# ExecStart=/home/pi/major/venv/bin/python /home/pi/major/src/iot/edge_pipeline.py
# WorkingDirectory=/home/pi/major
# StandardOutput=inherit
# StandardError=inherit
# Restart=always
# User=pi
#
# [Install]
# WantedBy=multi-user.target
# EOF
# sudo systemctl enable microplastic-edge.service

echo "Setup script finished."
